export interface ISubprocessSubTask {
  id: string;
  wbs: string;
  task: string;
  complete: number;
  start: string;
  finish: string;
  actualFinish: string;
}

export interface ITaskSubprocessData {
  items: number;
  subTasks: ISubprocessSubTask[];
}

type TaskJsonTableObject = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
};

const normalizeSubTask = (value: unknown, index: number): ISubprocessSubTask => {
  const record = isRecord(value) ? value : {};
  return {
    id: asString(record.id) || `sp-${index + 1}`,
    wbs: asString(record.wbs),
    task: asString(record.task),
    complete: Math.max(0, Math.min(100, asNumber(record.complete))),
    start: asString(record.start),
    finish: asString(record.finish),
    actualFinish: asString(record.actualFinish),
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

export const getTaskSubprocess = (raw?: string): ITaskSubprocessData => {
  const parsed = parseTaskJsonTableObject(raw);
  const subprocess = isRecord(parsed.subprocess) ? parsed.subprocess : {};
  const subTasksRaw = Array.isArray(subprocess.subTasks) ? subprocess.subTasks : [];

  return {
    items: asNumber(subprocess.items),
    subTasks: subTasksRaw.map((entry, index) => normalizeSubTask(entry, index)),
  };
};

export const buildTaskJsonTable = (
  raw: string | undefined,
  options: {
    sortOrder?: number;
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

  if (options.clearSubprocess) {
    delete next.subprocess;
  } else if (options.subprocess) {
    next.subprocess = {
      items: Math.max(0, Math.floor(asNumber(options.subprocess.items))),
      subTasks: options.subprocess.subTasks.map((entry, index) => normalizeSubTask(entry, index)),
    };
  }

  return Object.keys(next).length ? JSON.stringify(next) : undefined;
};
