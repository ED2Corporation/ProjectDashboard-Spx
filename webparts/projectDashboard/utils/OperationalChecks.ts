// Operational checks on the plan PO-Inbounds writes (contract: "WO-Dashboard - operational validations.md").
// Pure functions: they only read tasks / project data and return messages (and optional fixes the user may apply).
// Nothing here writes deps, depTypes, lot, taskSchedule, ganttScheduling or ProjectDetails.lots.

import { ITaskListItem } from "../../../models";
import { IReleaseRecord } from "../../../models/IProjectService";
import { toAppDate } from "./DateUtils";
import { getTaskSteps, getTaskSubprocess, parseTaskJsonTableObject, ISubprocessSubTask } from "./TaskDescriptionBlob";
import { addWorkingDays, checkParentSpan, workingDaysBetween } from "./TaskDateConsistency";

export type DepType = "FS" | "SS" | "FF" | "SF";

export type OpFix =
  | { kind: "task-dates"; taskId: string; start: string; finish: string }
  | { kind: "step-dates"; taskId: string; stepId: string; start: string; finish: string }
  | { kind: "subtask-dates"; taskId: string; stepId?: string; subtaskId: string; start: string; finish: string }
  | { kind: "steps-total-units"; taskId: string; totalUnits: number };

export interface IOpIssue {
  key: string;
  severity: "warning" | "info";
  wbs: string;
  message: string;
  fix?: OpFix;
}

/** A task or subtask that can take part in a dependency. */
interface IPlanNode {
  key: string;
  taskId: string;
  stepId?: string;
  subtaskId?: string;
  wbs: string;
  complete: number;
  start: string;
  finish: string;
  deps: string[];
  depTypes: Record<string, unknown>;
  baselineFinish?: string;
  /** Only leaves (tasks without children, subtasks) get a date fix: a parent follows its children. */
  isLeaf: boolean;
}

type PlanIndex = Map<string, IPlanNode>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const asNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const ymd = (v?: unknown): string => toAppDate(typeof v === "string" || v instanceof Date ? v : undefined);
const baselineFinishOf = (holder: unknown): string | undefined => {
  const baseline = isRecord(holder) && isRecord(holder.baseline) ? holder.baseline : undefined;
  return baseline && typeof baseline.finish === "string" && baseline.finish ? baseline.finish.slice(0, 10) : undefined;
};

/** m/d/yy, the format used across the dashboard. */
export const fmtDate = (value: string): string => {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : value;
};

// ─── Index ────────────────────────────────────────────────────────────────────

const subtaskNode = (task: ITaskListItem, st: ISubprocessSubTask, stepId?: string): IPlanNode => ({
  key: stepId ? `${task.Id}:${stepId}/${st.id}` : `${task.Id}:${st.id}`,
  taskId: task.Id,
  stepId,
  subtaskId: st.id,
  wbs: st.wbs || st.task || st.id,
  complete: asNum(st.complete),
  start: ymd(st.start),
  finish: ymd(st.finish),
  deps: asStrings(st.deps),
  depTypes: isRecord(st.depTypes) ? st.depTypes : {},
  baselineFinish: baselineFinishOf(st),
  isLeaf: true,
});

export const buildPlanIndex = (tasks: ITaskListItem[]): PlanIndex => {
  const index: PlanIndex = new Map();
  tasks.forEach(task => {
    const raw = parseTaskJsonTableObject(task.jsonTable);
    const subprocess = getTaskSubprocess(task.jsonTable);
    const steps = getTaskSteps(task.jsonTable);
    const hasChildren = subprocess.subTasks.length > 0 || steps.steps.length > 0;
    index.set(task.Id, {
      key: task.Id,
      taskId: task.Id,
      wbs: task.Title || task.Task || task.Id,
      complete: asNum(task.Complete),
      start: ymd(task.Start),
      finish: ymd(task.Finish),
      deps: asStrings(raw.deps),
      depTypes: isRecord(raw.depTypes) ? raw.depTypes : {},
      baselineFinish: baselineFinishOf(raw.taskSchedule),
      isLeaf: !hasChildren,
    });
    subprocess.subTasks.forEach(st => { const n = subtaskNode(task, st); index.set(n.key, n); });
    steps.steps.forEach(step => (step.subprocess?.subTasks ?? []).forEach(st => {
      const n = subtaskNode(task, st, step.id); index.set(n.key, n);
    }));
  });
  return index;
};

/** "123" = task, "123:sp-…" = subtask of task 123, "sp-…" = sibling subtask (same subprocess). */
const resolveToken = (node: IPlanNode, token: string, index: PlanIndex): IPlanNode | undefined => {
  const t = token.trim();
  if (/^\d+$/.test(t) || t.indexOf(":") >= 0) return index.get(t);
  if (!node.subtaskId) return undefined;
  return index.get(node.stepId ? `${node.taskId}:${node.stepId}/${t}` : `${node.taskId}:${t}`);
};

/** No entry = FS; any other value = FS. */
export const depTypeOf = (node: { depTypes: Record<string, unknown> }, token: string): DepType => {
  const v = node.depTypes[token];
  return v === "SS" || v === "FF" || v === "SF" ? v : "FS";
};

interface ILink { type: DepType; succ: IPlanNode; pred: IPlanNode }

const linksAsSuccessor = (node: IPlanNode, index: PlanIndex): ILink[] =>
  node.deps
    .map(token => ({ token, pred: resolveToken(node, token, index) }))
    .filter((l): l is { token: string; pred: IPlanNode } => !!l.pred && l.pred.key !== node.key)
    .map(l => ({ type: depTypeOf(node, l.token), succ: node, pred: l.pred }));

const linksAsPredecessor = (node: IPlanNode, index: PlanIndex): ILink[] => {
  const links: ILink[] = [];
  index.forEach(other => {
    if (other.key === node.key) return;
    linksAsSuccessor(other, index).forEach(l => { if (l.pred.key === node.key) links.push(l); });
  });
  return links;
};

// ─── 1. Dependencies in execution (progress) ─────────────────────────────────

/**
 * Pending predecessors of `node`, in one message. With `prevComplete` only the transition is checked
 * (0 → started, < 100 → complete); without it, the current state is checked (Validate panel).
 */
export const progressMessage = (node: IPlanNode, index: PlanIndex, prevComplete?: number): string | undefined => {
  const started = node.complete > 0 && (prevComplete === undefined || prevComplete <= 0);
  const finished = node.complete >= 100 && (prevComplete === undefined || prevComplete < 100);
  if (!started && !finished) return undefined;

  const parts = linksAsSuccessor(node, index).map(({ type, pred }) => {
    if (started && type === "FS" && pred.complete < 100) return `FS dependency with task ${pred.wbs}: it is not complete yet.`;
    if (started && type === "SS" && pred.complete <= 0) return `SS dependency with task ${pred.wbs}: it has not started yet.`;
    if (finished && type === "FF" && pred.complete < 100) return `FF dependency with task ${pred.wbs}: it is not complete yet.`;
    if (finished && type === "SF" && pred.complete <= 0) return `SF dependency with task ${pred.wbs}: it has not started yet.`;
    return undefined;
  }).filter((p): p is string => !!p);
  return parts.length ? parts.join(" ") : undefined;
};

// ─── 2. Date changes ─────────────────────────────────────────────────────────

/** Why the dates break the link, or undefined when it holds (or dates are missing). */
const linkDateProblem = ({ type, succ: a, pred: b }: ILink): string | undefined => {
  if (!a.start || !a.finish || !b.start || !b.finish) return undefined;
  switch (type) {
    case "FS": return a.start > b.finish ? undefined
      : `${a.wbs} starts ${fmtDate(a.start)}, not after ${b.wbs} finishes ${fmtDate(b.finish)}.`;
    case "SS": return a.start === b.start ? undefined
      : `${a.wbs} starts ${fmtDate(a.start)}, ${b.wbs} starts ${fmtDate(b.start)}.`;
    case "FF": return a.finish === b.finish ? undefined
      : `${a.wbs} finishes ${fmtDate(a.finish)}, ${b.wbs} finishes ${fmtDate(b.finish)}.`;
    case "SF": return a.finish >= b.start ? undefined
      : `${a.wbs} finishes ${fmtDate(a.finish)}, before ${b.wbs} starts ${fmtDate(b.start)}.`;
  }
};

/** Dates of the successor that satisfy the link, keeping its working-day duration. */
const linkFixSpan = ({ type, succ: a, pred: b }: ILink): { start: string; finish: string } => {
  const duration = workingDaysBetween(a.start, a.finish);
  if (type === "FS") { const s = addWorkingDays(b.finish, 1); return { start: s, finish: addWorkingDays(s, duration) }; }
  if (type === "SS") return { start: b.start, finish: addWorkingDays(b.start, duration) };
  const f = type === "FF" ? b.finish : b.start;
  return { start: addWorkingDays(f, -duration), finish: f };
};

const dateFixFor = (node: IPlanNode, span: { start: string; finish: string }): OpFix | undefined => {
  if (!node.isLeaf) return undefined;
  return node.subtaskId
    ? { kind: "subtask-dates", taskId: node.taskId, stepId: node.stepId, subtaskId: node.subtaskId, ...span }
    : { kind: "task-dates", taskId: node.taskId, ...span };
};

/** Broken date rules of every link of `node`, as successor and as predecessor. */
const linkDateIssues = (node: IPlanNode, index: PlanIndex, asPredecessorToo = true): IOpIssue[] =>
  [...linksAsSuccessor(node, index), ...(asPredecessorToo ? linksAsPredecessor(node, index) : [])]
    .map(link => ({ link, problem: linkDateProblem(link) }))
    .filter((x): x is { link: ILink; problem: string } => !!x.problem)
    .map(({ link, problem }) => {
      const other = link.succ.key === node.key ? link.pred : link.succ;
      return {
        key: `dep-date|${link.succ.key}|${link.pred.key}`,
        severity: "warning" as const,
        wbs: node.wbs,
        message: `${link.type} dependency with task ${other.wbs}: ${problem}`,
        fix: dateFixFor(link.succ, linkFixSpan(link)),
      };
    });

const baselineIssue = (node: IPlanNode): IOpIssue | undefined => {
  if (!node.baselineFinish || !node.finish || node.finish <= node.baselineFinish) return undefined;
  const slip = workingDaysBetween(node.baselineFinish, node.finish);
  return {
    key: `slip|${node.key}`,
    severity: "info",
    wbs: node.wbs,
    message: `Finishes ${fmtDate(node.finish)}, ${slip} working day${slip === 1 ? "" : "s"} after its baseline ${fmtDate(node.baselineFinish)}.`,
  };
};

const lotEtaIssue = (task: ITaskListItem, finish: string): IOpIssue | undefined => {
  const raw = parseTaskJsonTableObject(task.jsonTable);
  const lot = isRecord(raw.lot) ? raw.lot : undefined;
  const eta = lot && typeof lot.eta === "string" ? lot.eta.slice(0, 10) : "";
  if (!lot || !eta || !finish || finish <= eta) return undefined;
  const label = lot.position ?? lot.lotNo ?? "";
  return {
    key: `lot-eta|${task.Id}`,
    severity: "warning",
    wbs: task.Title || task.Id,
    message: `LOT ${label} finishes ${fmtDate(finish)}, after its delivery date ${fmtDate(eta)}.`,
  };
};

// ─── 3. Sizing ───────────────────────────────────────────────────────────────

export const sizingIssues = (task: ITaskListItem): IOpIssue[] => {
  const raw = parseTaskJsonTableObject(task.jsonTable);
  const rawSteps = isRecord(raw.taskSteps) && Array.isArray(raw.taskSteps.steps) ? raw.taskSteps.steps : [];
  if (!rawSteps.length) return [];
  const steps = getTaskSteps(task.jsonTable).steps;
  const sum = steps.reduce((s, step) => s + (step.units || 0), 0);
  const rawSubprocess = isRecord(raw.subprocess) ? raw.subprocess : {};
  const lot = isRecord(raw.lot) ? raw.lot : {};
  const planned = asNum(rawSubprocess.units) || asNum(lot.units);
  const wbs = task.Title || task.Id;
  const issues: IOpIssue[] = [];
  if (planned > 0 && sum !== planned) {
    issues.push({ key: `size|${task.Id}`, severity: "warning", wbs,
      message: `Batches total ${sum} units; the task is planned for ${planned}.` });
  }
  if (isRecord(raw.taskSteps) && asNum(raw.taskSteps.totalUnits) === 0) {
    issues.push({ key: `size-total|${task.Id}`, severity: "warning", wbs,
      message: `Batch total units is 0 while ${steps.length} batch${steps.length === 1 ? "" : "es"} exist (sum ${sum}).`,
      fix: { kind: "steps-total-units", taskId: task.Id, totalUnits: sum } });
  }
  return issues;
};

// ─── Parent span (existing rule, offered in the Validate panel) ──────────────

const spanIssues = (task: ITaskListItem): IOpIssue[] => {
  const subprocess = getTaskSubprocess(task.jsonTable);
  const steps = getTaskSteps(task.jsonTable);
  const wbs = task.Title || task.Id;
  const issues: IOpIssue[] = [];
  const taskCheck = checkParentSpan(
    { start: ymd(task.Start), finish: ymd(task.Finish) },
    [...(steps.enabled ? steps.steps : []), ...subprocess.subTasks]
  );
  if (taskCheck && !taskCheck.inSync) {
    const { start, finish } = taskCheck.expected;
    issues.push({ key: `span|${task.Id}`, severity: "warning", wbs,
      message: `Task dates do not match its batches/subtasks — expected ${fmtDate(start)} – ${fmtDate(finish)}.`,
      fix: { kind: "task-dates", taskId: task.Id, start, finish } });
  }
  steps.steps.forEach(step => {
    const check = checkParentSpan({ start: step.start, finish: step.finish }, step.subprocess?.subTasks ?? []);
    if (!check || check.inSync) return;
    const { start, finish } = check.expected;
    issues.push({ key: `span|${task.Id}|${step.id}`, severity: "warning", wbs: step.wbs || wbs,
      message: `Batch dates do not match its subtasks — expected ${fmtDate(start)} – ${fmtDate(finish)}.`,
      fix: { kind: "step-dates", taskId: task.Id, stepId: step.id, start, finish } });
  });
  return issues;
};

// ─── 5. Lots and releases ────────────────────────────────────────────────────

export interface IProjectLotsInput {
  units?: number;
  projectDetails?: string;
  releases?: IReleaseRecord[];
}

interface ILotEntry { lotNo: number; units: number; builtUnits?: number }

const parseLots = (projectDetails?: string): ILotEntry[] => {
  try {
    const pd = JSON.parse(projectDetails || "{}");
    if (!Array.isArray(pd.lots)) return [];
    return (pd.lots as unknown[]).filter(isRecord).map(l => ({
      lotNo: asNum(l.lotNo),
      units: asNum(l.units),
      builtUnits: l.builtUnits === undefined || l.builtUnits === null ? undefined : asNum(l.builtUnits),
    }));
  } catch {
    return [];
  }
};

export const lotIssues = ({ units, projectDetails, releases }: IProjectLotsInput): IOpIssue[] => {
  const woUnits = units ?? 0;
  const lots = parseLots(projectDetails);
  const issues: IOpIssue[] = [];
  const plannedOf = (l: ILotEntry): number => l.builtUnits ?? l.units;

  const plannedTotal = lots.reduce((s, l) => s + plannedOf(l), 0);
  if (lots.length && plannedTotal !== woUnits) {
    issues.push({ key: "lots-total", severity: "warning", wbs: "WO", message: `Planned ${plannedTotal} - PO ${woUnits}` });
  }
  lots.forEach(l => {
    if (l.builtUnits !== undefined && l.builtUnits !== l.units) {
      issues.push({ key: `lot-plan|${l.lotNo}`, severity: "info", wbs: `LOT ${l.lotNo}`,
        message: `LOT ${l.lotNo} planned ${l.builtUnits}, PO row ${l.units}.` });
    }
  });

  const releasedByLot = new Map<number, number>();
  (releases ?? []).forEach(r => {
    if (r.lotNo !== undefined) releasedByLot.set(r.lotNo, (releasedByLot.get(r.lotNo) ?? 0) + (r.units || 0));
  });
  lots.forEach(l => {
    const released = releasedByLot.get(l.lotNo) ?? 0;
    if (released > plannedOf(l)) {
      issues.push({ key: `lot-release|${l.lotNo}`, severity: "warning", wbs: `LOT ${l.lotNo}`,
        message: `LOT ${l.lotNo} released ${released} of ${plannedOf(l)}.` });
    }
  });

  const releasedTotal = (releases ?? []).reduce((s, r) => s + (r.units || 0), 0);
  if (woUnits > 0 && releasedTotal > woUnits) {
    issues.push({ key: "wo-release", severity: "warning", wbs: "WO", message: `WO released ${releasedTotal} of ${woUnits} units.` });
  }
  return issues;
};

// ─── Validate panel: every check over the whole project ─────────────────────

export const validateProject = (tasks: ITaskListItem[], project: IProjectLotsInput): IOpIssue[] => {
  const index = buildPlanIndex(tasks);
  const issues: IOpIssue[] = [];
  const seen = new Set<string>();
  const push = (issue?: IOpIssue): void => {
    if (!issue || seen.has(issue.key)) return;
    seen.add(issue.key);
    issues.push(issue);
  };

  index.forEach(node => {
    const progress = progressMessage(node, index);
    if (progress) push({ key: `dep-progress|${node.key}`, severity: "warning", wbs: node.wbs, message: progress });
    // Every link is visited once from its successor, so the predecessor side is not needed here.
    linkDateIssues(node, index, false).forEach(push);
    push(baselineIssue(node));
  });
  tasks.forEach(task => {
    push(lotEtaIssue(task, ymd(task.Finish)));
    sizingIssues(task).forEach(push);
    spanIssues(task).forEach(push);
  });
  lotIssues(project).forEach(push);
  return issues;
};

// ─── Save guard: what a single save would introduce ─────────────────────────

export interface ITaskSaveChange {
  Complete?: number;
  // The list quick-save payload sends null for a cleared date (legacy shape).
  Start?: Date | string | null; // eslint-disable-line @rushstack/no-new-null
  Finish?: Date | string | null; // eslint-disable-line @rushstack/no-new-null
  jsonTable?: string;
}

/**
 * Warnings for saving `change` on `task`, compared with what is stored. Progress rules fire on the transition;
 * date rules, baseline slip and lot ETA fire for the items whose dates change; sizing only when it gets worse.
 */
export const checkTaskSave = (tasks: ITaskListItem[], task: ITaskListItem, change: ITaskSaveChange): string[] => {
  const after: ITaskListItem = {
    ...task,
    ...(change.Complete !== undefined && { Complete: change.Complete }),
    ...(change.Start !== undefined && { Start: (change.Start ?? undefined) as Date | undefined }),
    ...(change.Finish !== undefined && { Finish: (change.Finish ?? undefined) as Date | undefined }),
    ...(change.jsonTable !== undefined && { jsonTable: change.jsonTable }),
  };
  const others = tasks.filter(t => t.Id !== task.Id);
  const beforeIndex = buildPlanIndex([...others, task]);
  const afterIndex = buildPlanIndex([...others, after]);
  const lines: string[] = [];
  const add = (wbs: string, message: string): void => {
    const line = `${wbs}: ${message}`;
    if (lines.indexOf(line) < 0) lines.push(line);
  };

  afterIndex.forEach(node => {
    if (node.taskId !== task.Id) return;
    const before = beforeIndex.get(node.key);
    const progress = progressMessage(node, afterIndex, before?.complete ?? 0);
    if (progress) add(node.wbs, progress);

    const datesChanged = !before || before.start !== node.start || before.finish !== node.finish;
    if (!datesChanged) return;
    linkDateIssues(node, afterIndex).forEach(i => add(i.wbs, i.message));
    const slip = baselineIssue(node);
    if (slip && (!before || before.finish !== node.finish)) add(slip.wbs, slip.message);
    if (!node.subtaskId) {
      const lot = lotEtaIssue(after, node.finish);
      if (lot) add(lot.wbs, lot.message);
    }
  });

  const sizingBefore = sizingIssues(task).map(i => i.message);
  sizingIssues(after).filter(i => sizingBefore.indexOf(i.message) < 0).forEach(i => add(i.wbs, i.message));
  return lines;
};

/** Thrown by a guarded save when the user cancels it after reading the warnings. */
export class SaveCancelledError extends Error {
  constructor() {
    super("Save cancelled — review the warnings and save again.");
    this.name = "SaveCancelledError";
  }
}

export const isSaveCancelled = (error: unknown): boolean =>
  !!error && (error as { name?: string }).name === "SaveCancelledError";

/** Alert first, then save: returns true when there is nothing to warn about or the user chose to save anyway. */
export const confirmSaveWarnings = (lines: string[]): boolean =>
  lines.length === 0 ||
  window.confirm(
    `Before saving, please review:\n\n• ${lines.join("\n• ")}\n\nOK = save anyway · Cancel = go back and adjust`
  );
