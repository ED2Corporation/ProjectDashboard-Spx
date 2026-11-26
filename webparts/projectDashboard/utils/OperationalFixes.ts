// Turns the fixes the user picked in the Validate panel into ordinary task save payloads.
// It reuses buildTaskPersistencePayload, so the save path is the same as the Task Card's.

import { ITaskListItem } from "../../../models";
import { toAppDate } from "./DateUtils";
import { OpFix } from "./OperationalChecks";
import { getTaskSteps, getTaskSubprocess, ISubprocessSubTask } from "./TaskDescriptionBlob";
import { buildTaskPersistencePayload, ITaskPersistencePayload } from "./TaskPersistencePayload";

type DateFix = Extract<OpFix, { start: string }>;

const nodeKeyOf = (fix: DateFix): string =>
  fix.kind === "task-dates" ? `t|${fix.taskId}`
    : fix.kind === "step-dates" ? `b|${fix.taskId}|${fix.stepId}`
      : `s|${fix.taskId}|${fix.stepId ?? ""}|${fix.subtaskId}`;

/** Several date fixes on one item (two FS links): the latest start controls, as in PO-Inbounds. */
const controllingFixes = (fixes: OpFix[]): OpFix[] => {
  const dateFixes = new Map<string, DateFix>();
  const rest: OpFix[] = [];
  fixes.forEach(fix => {
    if (fix.kind === "steps-total-units") { rest.push(fix); return; }
    const key = nodeKeyOf(fix);
    const prev = dateFixes.get(key);
    if (!prev || fix.start > prev.start) dateFixes.set(key, fix);
  });
  return [...rest, ...Array.from(dateFixes.values())];
};

const withDates = (st: ISubprocessSubTask, fix: DateFix): ISubprocessSubTask => ({ ...st, start: fix.start, finish: fix.finish });

/** One payload per task touched by the fixes. */
export const buildFixPayloads = (tasks: ITaskListItem[], fixes: OpFix[]): ITaskPersistencePayload[] => {
  const byTask = new Map<string, OpFix[]>();
  controllingFixes(fixes).forEach(fix => byTask.set(fix.taskId, [...(byTask.get(fix.taskId) ?? []), fix]));

  const payloads: ITaskPersistencePayload[] = [];
  byTask.forEach((taskFixes, taskId) => {
    const task = tasks.find(t => t.Id === taskId);
    if (!task) return;
    let start = toAppDate(task.Start);
    let finish = toAppDate(task.Finish);
    let subprocess = getTaskSubprocess(task.jsonTable);
    let taskSteps = getTaskSteps(task.jsonTable);
    let subprocessChanged = false;
    let stepsChanged = false;

    taskFixes.forEach(fix => {
      switch (fix.kind) {
        case "task-dates":
          start = fix.start; finish = fix.finish;
          break;
        case "step-dates":
          taskSteps = { ...taskSteps, steps: taskSteps.steps.map(s => s.id === fix.stepId ? { ...s, start: fix.start, finish: fix.finish } : s) };
          stepsChanged = true;
          break;
        case "subtask-dates":
          if (fix.stepId) {
            taskSteps = { ...taskSteps, steps: taskSteps.steps.map(s => s.id !== fix.stepId || !s.subprocess ? s : {
              ...s, subprocess: { ...s.subprocess, subTasks: s.subprocess.subTasks.map(st => st.id === fix.subtaskId ? withDates(st, fix) : st) },
            }) };
            stepsChanged = true;
          } else {
            subprocess = { ...subprocess, subTasks: subprocess.subTasks.map(st => st.id === fix.subtaskId ? withDates(st, fix) : st) };
            subprocessChanged = true;
          }
          break;
        case "steps-total-units":
          taskSteps = { ...taskSteps, totalUnits: fix.totalUnits };
          stepsChanged = true;
          break;
      }
    });

    const { payload } = buildTaskPersistencePayload({
      task,
      complete: task.Complete ?? 0,
      effort: task.Effort,
      start,
      finish,
      actualFinish: task.ActualFinish ? new Date(task.ActualFinish) : undefined,
      subprocess: subprocessChanged ? subprocess : undefined,
      taskSteps: stepsChanged ? taskSteps : undefined,
    });
    payloads.push(payload);
  });
  return payloads;
};
