import { ApprovalStatus, ApproverRole, IApprovalEntry, IEvidenceEntry, INoteEntry } from "../../../models";

export interface ISubprocessSubTask {
  id: string;
  wbs: string;
  sortOrder: number;
  task: string;
  duration?: number;
  complete: number;
  start: string;
  finish: string;
  actualFinish?: string;
  notes?: INoteEntry[];
  evidence?: IEvidenceEntry[];
  approvals?: IApprovalEntry[];
}

export interface ITaskSubprocessData {
  subTasks: ISubprocessSubTask[];
}

export interface ITaskStepEntry {
  id: string;
  wbs: string;
  sortOrder: number;
  title: string;
  units: number;
  complete: number;
  start: string;
  finish: string;
  actualFinish?: string;
  notes?: INoteEntry[];
  evidence?: IEvidenceEntry[];
  approvals?: IApprovalEntry[];
  subprocess?: ITaskSubprocessData;
}

export interface ITaskStepsData {
  enabled: boolean;
  totalUnits: number;
  unitsPerStep: number;
  stepCount: number;
  mode?: "fixed" | "weekday";
  weekdays?: number[];
  steps: ITaskStepEntry[];
}

type TaskJsonTableObject = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const isArray = <T = unknown>(value: unknown): value is T[] => Array.isArray(value);

const asApprovalStatus = (value: unknown): ApprovalStatus => {
  switch (asString(value).toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      return "pending";
  }
};

const asApproverRole = (value: unknown): ApproverRole | undefined => {
  switch (asString(value).toLowerCase()) {
    case "primary":
      return "primary";
    case "delegate":
      return "delegate";
    case "additional":
      return "additional";
    default:
      return undefined;
  }
};

const asNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
};

export const getTodayDateInputValue = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCompletionFinish = (complete: number, finish: string): string =>
  complete >= 100 && !finish ? getTodayDateInputValue() : finish;

const normalizeNotes = (value: unknown): INoteEntry[] => {
  if (!isArray<unknown>(value)) return [];

  const entries: INoteEntry[] = [];

  value.forEach((entry) => {
    const record = isRecord(entry) ? entry : {};
    const note = asString(record.note);
    const date = asString(record.date);
    const user = asString(record.user);

    if (!note && !date && !user) return;
    entries.push({ note, date, user });
  });

  return entries;
};

const normalizeEvidence = (value: unknown): IEvidenceEntry[] => {
  if (!isArray<unknown>(value)) return [];

  const entries: IEvidenceEntry[] = [];

  value.forEach((entry) => {
    const record = isRecord(entry) ? entry : {};
    const fileUrl = asString(record.fileUrl);
    const fileName = asString(record.fileName);
    const date = asString(record.date);
    const user = asString(record.user);
    const note = asString(record.note);
    const isEvidenceOfCompletion = record.isEvidenceOfCompletion === true;

    if (!fileUrl && !fileName && !date && !user && !note && !isEvidenceOfCompletion) return;

    const nextEntry: IEvidenceEntry = { fileUrl, fileName, date, user };
    if (note) nextEntry.note = note;
    if (isEvidenceOfCompletion) nextEntry.isEvidenceOfCompletion = true;
    entries.push(nextEntry);
  });

  return entries;
};

const normalizeApprovals = (value: unknown): IApprovalEntry[] => {
  if (!isArray<unknown>(value)) return [];

  const entries: IApprovalEntry[] = [];

  value.forEach((entry) => {
    const record = isRecord(entry) ? entry : {};
    const date = asString(record.date);
    const user = asString(record.user);
    const email = asString(record.email);
    const comment = asString(record.comment);
    const role = asApproverRole(record.role);
    const status = asApprovalStatus(record.status);

    if (!date && !user && !email && !comment && !role && status === "pending" && !asString(record.status)) {
      return;
    }

    const nextEntry: IApprovalEntry = { status, date, user, email };
    if (comment) nextEntry.comment = comment;
    if (role) nextEntry.role = role;
    entries.push(nextEntry);
  });

  return entries;
};

const normalizeSubTask = (value: unknown, index: number): ISubprocessSubTask => {
  const record = isRecord(value) ? value : {};
  const complete = Math.max(0, Math.min(100, asNumber(record.complete)));
  const finish = asString(record.finish);
  return {
    id: asString(record.id) || `sp-${index + 1}`,
    wbs: asString(record.wbs),
    sortOrder: Math.max(0, Math.floor(asNumber(record.sortOrder) || index)),
    task: asString(record.task),
    duration: record.duration !== undefined && record.duration !== null && `${record.duration}`.trim() !== ""
      ? asNumber(record.duration)
      : undefined,
    complete,
    start: asString(record.start),
    finish: getCompletionFinish(complete, finish),
    actualFinish: asString(record.actualFinish),
    notes: normalizeNotes(record.notes),
    evidence: normalizeEvidence(record.evidence),
    approvals: normalizeApprovals(record.approvals),
  };
};

const normalizeTaskStep = (value: unknown, index: number): ITaskStepEntry => {
  const record = isRecord(value) ? value : {};
  const subprocess = isRecord(record.subprocess) ? record.subprocess : {};
  const subTasksRaw = Array.isArray(subprocess.subTasks) ? subprocess.subTasks : [];
  const complete = Math.max(0, Math.min(100, asNumber(record.complete)));
  const finish = asString(record.finish);
  return {
    id: asString(record.id) || `step-${index + 1}`,
    wbs: asString(record.wbs),
    sortOrder: Math.max(0, Math.floor(asNumber(record.sortOrder) || index)),
    title: asString(record.title),
    units: Math.max(0, Math.floor(asNumber(record.units))),
    complete,
    start: asString(record.start),
    finish: getCompletionFinish(complete, finish),
    actualFinish: asString(record.actualFinish),
    notes: normalizeNotes(record.notes),
    evidence: normalizeEvidence(record.evidence),
    approvals: normalizeApprovals(record.approvals),
    subprocess: {
      subTasks: subTasksRaw
        .map((entry, subIndex) => normalizeSubTask(entry, subIndex))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((entry, subIndex) => ({ ...entry, sortOrder: subIndex })),
    },
  };
};

export const parseTaskJsonTableObject = (raw?: string): TaskJsonTableObject => {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getTaskSortOrder = (raw?: string): number | undefined => {
  const parsed = parseTaskJsonTableObject(raw);
  return typeof parsed.sortOrder === "number" ? parsed.sortOrder : undefined;
};

export const getTaskIsRelease = (raw?: string): boolean => {
  const parsed = parseTaskJsonTableObject(raw);
  return parsed.isRelease === true;
};

export const getTaskReleaseUnits = (raw?: string): number | undefined => {
  const parsed = parseTaskJsonTableObject(raw);
  const units = asNumber(parsed.releaseUnits);
  return units > 0 ? units : undefined;
};

export const getTaskSubprocess = (raw?: string): ITaskSubprocessData => {
  const parsed = parseTaskJsonTableObject(raw);
  const subprocess = isRecord(parsed.subprocess) ? parsed.subprocess : {};
  const subTasksRaw = Array.isArray(subprocess.subTasks) ? subprocess.subTasks : [];

  return {
    subTasks: subTasksRaw
      .map((entry, index) => normalizeSubTask(entry, index))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry, index) => ({ ...entry, sortOrder: index })),
  };
};

export const getTaskSteps = (raw?: string): ITaskStepsData => {
  const parsed = parseTaskJsonTableObject(raw);
  const taskSteps = isRecord(parsed.taskSteps) ? parsed.taskSteps : {};
  const stepsRaw = Array.isArray(taskSteps.steps) ? taskSteps.steps : [];
  const totalUnits = Math.max(0, Math.floor(asNumber(taskSteps.totalUnits)));
  const unitsPerStep = Math.max(0, Math.floor(asNumber(taskSteps.unitsPerStep)));
  const stepCount = Math.max(0, Math.floor(asNumber(taskSteps.stepCount)));
  const mode = taskSteps.mode === "weekday" ? "weekday" : "fixed";
  const weekdaysRaw = Array.isArray(taskSteps.weekdays) ? taskSteps.weekdays : [];
  const weekdays = weekdaysRaw
    .map((entry) => Math.floor(asNumber(entry)))
    .filter((entry, index, array) => entry >= 1 && entry <= 6 && array.indexOf(entry) === index)
    .sort((a, b) => a - b);
  const normalizedSteps = stepsRaw
    .map((entry, index) => normalizeTaskStep(entry, index))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry, index) => ({ ...entry, sortOrder: index }));

  return {
    enabled: taskSteps.enabled === true || normalizedSteps.length > 0,
    totalUnits: totalUnits > 0 ? totalUnits : normalizedSteps.reduce((sum, entry) => sum + entry.units, 0),
    unitsPerStep: unitsPerStep > 0 ? unitsPerStep : (normalizedSteps[0]?.units ?? 0),
    stepCount: stepCount > 0 ? stepCount : normalizedSteps.length,
    mode,
    weekdays: weekdays.length > 0 ? weekdays : [1],
    steps: normalizedSteps,
  };
};

export const buildTaskJsonTable = (
  raw: string | undefined,
  options: {
    sortOrder?: number;
    isRelease?: boolean;
    releaseUnits?: number;
    subprocess?: ITaskSubprocessData;
    clearSubprocess?: boolean;
    taskSteps?: ITaskStepsData;
    clearTaskSteps?: boolean;
  }
): string | undefined => {
  const next: TaskJsonTableObject = parseTaskJsonTableObject(raw);

  if (!Object.keys(next).length && raw && raw.trim()) {
    next.legacyText = raw;
  }

  if (typeof options.sortOrder === "number") {
    next.sortOrder = options.sortOrder;
  } else if (typeof next.sortOrder !== "number") {
    delete next.sortOrder;
  }

  if (options.isRelease === true) {
    next.isRelease = true;
  } else {
    delete next.isRelease;
  }

  if (options.isRelease === true && typeof options.releaseUnits === "number" && Number.isFinite(options.releaseUnits) && options.releaseUnits > 0) {
    next.releaseUnits = options.releaseUnits;
  } else {
    delete next.releaseUnits;
  }

  if (options.clearSubprocess) {
    delete next.subprocess;
  } else if (options.subprocess) {
    const normalizedSubTasks = options.subprocess.subTasks
      .map((entry, index) => normalizeSubTask(entry, index))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry, index) => ({
        ...entry,
        sortOrder: index,
      }));

    next.subprocess = {
      subTasks: normalizedSubTasks,
    };
  }

  if (options.clearTaskSteps) {
    delete next.taskSteps;
  } else if (options.taskSteps) {
    const normalizedSteps = options.taskSteps.steps
      .map((entry, index) => normalizeTaskStep(entry, index))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry, index) => ({
        ...entry,
        sortOrder: index,
      }));

    const taskStepMode = options.taskSteps.mode === "weekday" ? "weekday" : "fixed";
    const taskStepWeekdays = Array.isArray(options.taskSteps.weekdays)
      ? options.taskSteps.weekdays
          .map((entry) => Math.floor(asNumber(entry)))
          .filter((entry, index, array) => entry >= 1 && entry <= 6 && array.indexOf(entry) === index)
          .sort((a, b) => a - b)
      : [];

    next.taskSteps = {
      enabled: options.taskSteps.enabled === true || normalizedSteps.length > 0,
      totalUnits: Math.max(0, Math.floor(asNumber(options.taskSteps.totalUnits))),
      unitsPerStep: Math.max(0, Math.floor(asNumber(options.taskSteps.unitsPerStep))),
      stepCount: Math.max(0, Math.floor(asNumber(options.taskSteps.stepCount))),
      mode: taskStepMode,
      weekdays: taskStepMode === "weekday" ? (taskStepWeekdays.length > 0 ? taskStepWeekdays : [1]) : undefined,
      steps: normalizedSteps,
    };
  }

  return Object.keys(next).length ? JSON.stringify(next) : undefined;
};
