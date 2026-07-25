import { ISubprocessSubTask } from "./TaskDescriptionBlob";

interface IExcelSubprocessRow {
  Subtasks?: string;
  Subtask?: string;
  Task?: string;
  Title?: string;
  Name?: string;
  Duration?: string | number;
  Complete?: string | number;
  Start?: string | number | Date;
  Finish?: string | number | Date;
  ActualFinish?: string | number | Date;
  [key: string]: unknown;
}

const formatSubTaskWbs = (parentWbs: string, index: number): string => {
  const prefix = parentWbs.trim();
  const suffix = String(index + 1).padStart(2, "0");
  return prefix ? `${prefix}.${suffix}` : suffix;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.floor(value)));

const toDateInputValue = (value: unknown): string => {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseSubprocessExcelFile = async (
  file: File,
  parentWbs: string,
  parentStart: string,
  parentFinish: string
): Promise<ISubprocessSubTask[]> => {
  const XLSX = await import(/* webpackChunkName: "xlsx" */ "xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true, cellText: false });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;

  if (!sheet) {
    throw new Error("Excel workbook does not contain a readable sheet.");
  }

  const rows = XLSX.utils.sheet_to_json<IExcelSubprocessRow>(sheet, { defval: "", raw: false });
  if (!rows.length) {
    throw new Error("Excel subprocess template is empty.");
  }

  const headers = Object.keys(rows[0] || {});
  const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "");
  const headerMap = new Map<string, string>(headers.map((header) => [normalizeHeader(header), header]));
  const resolveHeader = (aliases: string[]): string | undefined => {
    for (const alias of aliases) {
      const match = headerMap.get(normalizeHeader(alias));
      if (match) return match;
    }
    return undefined;
  };

  const taskColumn = resolveHeader(["Subtasks", "Subtask", "Task", "Title", "Name"]) || headers[0];
  const durationColumn = resolveHeader(["Duration", "Days"]);
  const completeColumn = resolveHeader(["Complete", "% Complete", "PercentComplete"]);
  const startColumn = resolveHeader(["Start", "Start Date"]);
  const finishColumn = resolveHeader(["Finish", "Finish Date", "End", "End Date"]);
  const actualFinishColumn = resolveHeader(["ActualFinish", "Actual Finish", "Completed", "Completed Date"]);

  if (!taskColumn) {
    throw new Error("Excel subprocess template must contain at least one column for the subtask name.");
  }

  const importedSubTasks = rows.reduce<ISubprocessSubTask[]>((acc, row, index) => {
    const taskTitle = String(row[taskColumn] || "").trim();
    if (!taskTitle) {
      return acc;
    }

    const completeRaw = completeColumn ? row[completeColumn] : undefined;
    const complete = completeRaw !== undefined && completeRaw !== ""
      ? clampPercent(toNumber(completeRaw))
      : 0;

    const start = toDateInputValue(startColumn ? row[startColumn] : undefined) || parentStart || "";
    const finish = toDateInputValue(finishColumn ? row[finishColumn] : undefined) || parentFinish || start;
    const actualFinish = toDateInputValue(actualFinishColumn ? row[actualFinishColumn] : undefined);
    const durationRaw = durationColumn ? row[durationColumn] : undefined;

    acc.push({
      id: `sp-import-${Date.now()}-${index + 1}`,
      wbs: formatSubTaskWbs(parentWbs, acc.length),
      sortOrder: acc.length,
      task: taskTitle,
      duration: durationRaw !== undefined && durationRaw !== "" ? toNumber(durationRaw) : 0,
      complete,
      start,
      finish,
      actualFinish,
      notes: [],
      evidence: [],
      approvals: [],
    });

    return acc;
  }, []);

  if (!importedSubTasks.length) {
    throw new Error("Excel subprocess template does not contain valid subtasks.");
  }

  return importedSubTasks;
};
