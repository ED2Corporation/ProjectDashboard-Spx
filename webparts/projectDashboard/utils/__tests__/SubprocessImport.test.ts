import { parseSubprocessExcelFile } from "../SubprocessImport";

const createTestFile = (arrayBuffer: ArrayBuffer, fileName: string): File => {
  return {
    name: fileName,
    arrayBuffer: async () => arrayBuffer,
  } as File;
};

describe("parseSubprocessExcelFile", () => {
  it("maps the subprocess template rows into subprocess subTasks", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const rows = [
      { Subtasks: "Upload BOM", Duration: 1, Start: "7/24/26", Finish: "7/24/26" },
      { Subtasks: "Check Inventory", Duration: 2, Start: "7/25/26", Finish: "7/28/26", Complete: 50 },
    ];

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Plan");
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = createTestFile(arrayBuffer, "Upload-Subprocess Ver1.xlsx");

    const subTasks = await parseSubprocessExcelFile(file, "1.01", "2026-07-24", "2026-07-24");

    expect(subTasks).toHaveLength(2);
    expect(subTasks[0]).toEqual(expect.objectContaining({
      sortOrder: 0,
      wbs: "1.01.01",
      task: "Upload BOM",
      duration: 1,
      complete: 0,
      start: "2026-07-24",
      finish: "2026-07-24",
    }));
    expect(subTasks[1]).toEqual(expect.objectContaining({
      sortOrder: 1,
      wbs: "1.01.02",
      task: "Check Inventory",
      duration: 2,
      complete: 50,
      start: "2026-07-25",
      finish: "2026-07-28",
    }));
  });

  it("accepts a template with only the task-name column and uses parent defaults", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const rows = [
      { Task: "Partial shipment lot 1" },
      { Task: "Partial shipment lot 2" },
    ];

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Plan");
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = createTestFile(arrayBuffer, "subprocess-minimal.xlsx");

    const subTasks = await parseSubprocessExcelFile(file, "2.01", "2026-07-20", "2026-07-24");

    expect(subTasks).toHaveLength(2);
    expect(subTasks[0]).toEqual(expect.objectContaining({
      wbs: "2.01.01",
      task: "Partial shipment lot 1",
      duration: 0,
      complete: 0,
      start: "2026-07-20",
      finish: "2026-07-24",
    }));
    expect(subTasks[1]).toEqual(expect.objectContaining({
      wbs: "2.01.02",
      task: "Partial shipment lot 2",
      duration: 0,
      complete: 0,
      start: "2026-07-20",
      finish: "2026-07-24",
    }));
  });
});
