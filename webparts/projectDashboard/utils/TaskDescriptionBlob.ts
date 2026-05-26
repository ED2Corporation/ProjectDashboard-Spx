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
  return {
    id: asString(record.id) || `sp-${index + 1}`,
    wbs: asString(record.wbs),
    sortOrder: Math.max(0, Math.floor(asNumber(record.sortOrder) || index)),
    task: asString(record.task),
    duration: record.duration !== undefined && record.duration !== null && asString(record.duration) !== ""
      ? asNumber(record.duration)
      : undefined,
    complete: Math.max(0, Math.min(100, asNumber(record.complete))),
    start: asString(record.start),
    finish: asString(record.finish),
    actualFinish: asString(record.actualFinish),
    notes: normalizeNotes(record.notes),
    evidence: normalizeEvidence(record.evidence),
    approvals: normalizeApprovals(record.approvals),
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

export const buildTaskJsonTable = (
  raw: string | undefined,
  options: {
    sortOrder?: number;
    isRelease?: boolean;
    releaseUnits?: number;
    subprocess?: ITaskSubprocessData;
    clearSubprocess?: boolean;
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

  return Object.keys(next).length ? JSON.stringify(next) : undefined;
};
