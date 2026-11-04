import * as XLSX from "xlsx";
import { ISubprocessSubTask } from "./TaskDescriptionBlob";

export const exportSubprocessToExcel = (subTasks: ISubprocessSubTask[], fileName = "subprocess-template"): void => {
  const rows = subTasks.map(t => ({
    Task: t.task,
    Duration: t.duration ?? 0,
    Complete: t.complete,
    Start: t.start,
    Finish: t.finish,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Subtasks");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};
