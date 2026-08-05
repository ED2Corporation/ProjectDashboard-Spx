import { reorderWbsEntriesForMove } from "../ParseWBS";

describe("WBS reorder helpers", () => {
  it("moves a task and recalculates WBS and sortOrder without changing ids", () => {
    const result = reorderWbsEntriesForMove(
      [
        { id: "a", wbs: "2.01", sortOrder: 1 },
        { id: "b", wbs: "2.02", sortOrder: 2 },
        { id: "c", wbs: "2.03", sortOrder: 3 },
      ],
      "b",
      "first"
    );

    expect(result.map(entry => ({
      id: entry.item.id,
      wbs: entry.wbs,
      sortOrder: entry.sortOrder,
    }))).toEqual([
      { id: "b", wbs: "2.01", sortOrder: 1 },
      { id: "a", wbs: "2.02", sortOrder: 2 },
      { id: "c", wbs: "2.03", sortOrder: 3 },
    ]);
  });

  it("moves a parent task as a WBS block and preserves child suffixes", () => {
    const result = reorderWbsEntriesForMove(
      [
        { id: "a", wbs: "2.01", sortOrder: 1 },
        { id: "a-child", wbs: "2.01.01", sortOrder: 2 },
        { id: "b", wbs: "2.02", sortOrder: 3 },
        { id: "c", wbs: "2.03", sortOrder: 4 },
      ],
      "a",
      "down"
    );

    expect(result.map(entry => ({
      id: entry.item.id,
      wbs: entry.wbs,
      sortOrder: entry.sortOrder,
    }))).toEqual([
      { id: "b", wbs: "2.01", sortOrder: 1 },
      { id: "a", wbs: "2.02", sortOrder: 2 },
      { id: "a-child", wbs: "2.02.01", sortOrder: 3 },
      { id: "c", wbs: "2.03", sortOrder: 4 },
    ]);
  });
});
