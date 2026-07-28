import { ITaskListItem } from "../../../models";
import {
  buildTaskJsonTable,
  getTaskSteps,
  getTaskSortOrder,
  getTaskSubprocess,
  ITaskStepsData,
  ITaskSubprocessData,
} from "./TaskDescriptionBlob";

export const JSON_TABLE_SIZE_WARNING_THRESHOLD = 50000;
export const JSON_TABLE_SIZE_CRITICAL_THRESHOLD = 90000;

export type TaskJsonTableSizeLevel = "ok" | "warning" | "critical";

export interface ITaskJsonTableSizeStatus {
  length: number;
  level: TaskJsonTableSizeLevel;
  message?: string;
}

export interface ITaskPersistencePayload {
  Id: string;
  Title: string;
  Gate: string;
  Task: string;
  Complete: number;
  Effort?: number;
  Barriers: string;
  ActionableStatus: string;
  Start?: Date;
  Finish?: Date;
  ActualFinish?: Date;
  Description: string;
  jsonTable: string;
  isRelease: boolean;
  releaseUnits: number;
  EvidenceOfCompletion?: ITaskListItem["EvidenceOfCompletion"];
  originalGate?: string;
  renameGate?: boolean;
}

interface IBuildTaskPersistencePayloadOptions {
  task: ITaskListItem;
  sourceJsonTable?: string;
  title?: string;
  gate?: string;
  taskTitle?: string;
  complete: number;
  effort?: number | string;
  barriers?: string;
  actionableStatus?: string;
  start?: Date | string;
  finish?: Date | string;
  actualFinish?: Date;
  description?: string;
  isRelease?: boolean;
  releaseUnits?: number;
  evidenceOfCompletion?: ITaskListItem["EvidenceOfCompletion"];
  originalGate?: string;
  renameGate?: boolean;
  subprocess?: ITaskSubprocessData;
  clearSubprocess?: boolean;
  taskSteps?: ITaskStepsData;
  clearTaskSteps?: boolean;
}

const toDate = (value?: Date | string): Date | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
};

const toEffort = (value?: number | string): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return undefined;
};

export const getTaskJsonTableSizeStatus = (jsonTable?: string): ITaskJsonTableSizeStatus => {
  const length = jsonTable?.length ?? 0;
  if (length >= JSON_TABLE_SIZE_CRITICAL_THRESHOLD) {
    return {
      length,
      level: "critical",
      message: `jsonTable is ${length} characters. Consider moving nested logs to a dedicated store.`,
    };
  }
  if (length >= JSON_TABLE_SIZE_WARNING_THRESHOLD) {
    return {
      length,
      level: "warning",
      message: `jsonTable is ${length} characters. Nested subprocess logs are growing.`,
    };
  }
  return { length, level: "ok" };
};

export const buildTaskSortOrderJsonTable = (sourceJsonTable: string | undefined, sortOrder: number): string =>
  buildTaskJsonTable(sourceJsonTable, { sortOrder }) ?? JSON.stringify({ sortOrder });

export const getTaskCompleteLockMessageFromJsonTable = (jsonTable?: string): string | undefined => {
  const taskSteps = getTaskSteps(jsonTable);
  if (taskSteps.enabled && taskSteps.steps.length > 0) {
    return "Complete is calculated from Step Tasks. Update progress in Step Tasks.";
  }

  const subprocess = getTaskSubprocess(jsonTable);
  if (subprocess.subTasks.length > 0) {
    return "Complete is calculated from subprocess tasks. Update progress in Subprocess Workspace.";
  }

  return undefined;
};

export const buildTaskPersistencePayload = ({
  task,
  sourceJsonTable,
  title,
  gate,
  taskTitle,
  complete,
  effort,
  barriers,
  actionableStatus,
  start,
  finish,
  actualFinish,
  description,
  isRelease,
  releaseUnits,
  evidenceOfCompletion,
  originalGate,
  renameGate,
  subprocess,
  clearSubprocess,
  taskSteps,
  clearTaskSteps,
}: IBuildTaskPersistencePayloadOptions): {
  payload: ITaskPersistencePayload;
  jsonTable?: string;
  jsonTableSize: ITaskJsonTableSizeStatus;
} => {
  const effectiveSourceJsonTable = sourceJsonTable ?? task.jsonTable;
  const effectiveIsRelease = isRelease ?? task.isRelease ?? false;
  const effectiveReleaseUnits = effectiveIsRelease ? (releaseUnits ?? task.releaseUnits ?? 0) : 0;
  const jsonTable = buildTaskJsonTable(effectiveSourceJsonTable, {
    sortOrder: getTaskSortOrder(effectiveSourceJsonTable),
    isRelease: effectiveIsRelease || undefined,
    releaseUnits: effectiveIsRelease ? effectiveReleaseUnits : undefined,
    subprocess,
    clearSubprocess,
    taskSteps,
    clearTaskSteps,
  });

  const payload: ITaskPersistencePayload = {
    Id: task.Id,
    Title: title ?? task.Title ?? "",
    Gate: gate ?? task.Gate ?? "",
    Task: taskTitle ?? task.Task ?? "",
    Complete: complete,
    Effort: toEffort(effort),
    Barriers: barriers ?? task.Barriers ?? "",
    ActionableStatus: actionableStatus ?? task.ActionableStatus ?? "",
    Start: toDate(start ?? task.Start),
    Finish: toDate(finish ?? task.Finish),
    ActualFinish: actualFinish,
    Description: description ?? task.Description ?? "",
    jsonTable: jsonTable ?? "",
    isRelease: effectiveIsRelease,
    releaseUnits: effectiveReleaseUnits,
    EvidenceOfCompletion: evidenceOfCompletion ?? task.EvidenceOfCompletion,
  };

  if (originalGate !== undefined) {
    payload.originalGate = originalGate;
  }
  if (renameGate !== undefined) {
    payload.renameGate = renameGate;
  }

  return { payload, jsonTable, jsonTableSize: getTaskJsonTableSizeStatus(jsonTable) };
};
