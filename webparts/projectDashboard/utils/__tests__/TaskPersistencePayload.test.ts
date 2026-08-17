import { ITaskListItem } from "../../../../models";
import {
  buildTaskSortOrderJsonTable,
  buildTaskPersistencePayload,
  getTaskCompleteLockMessageFromJsonTable,
  getTaskJsonTableSizeStatus,
  JSON_TABLE_SIZE_CRITICAL_THRESHOLD,
  JSON_TABLE_SIZE_WARNING_THRESHOLD,
} from "../TaskPersistencePayload";
import { buildTaskJsonTable, getTaskSteps, getTaskSubprocess, getTodayDateInputValue } from "../TaskDescriptionBlob";

describe("buildTaskPersistencePayload", () => {
  const task: ITaskListItem = {
    Id: "1",
    Title: "2.01",
    Gate: "Gate A",
    Task: "Parent task",
    Complete: 0,
    Start: new Date("2026-04-01T00:00:00Z"),
    Finish: new Date("2026-04-05T00:00:00Z"),
    Description: "Existing description",
    Barriers: "Existing barrier",
    ActionableStatus: "Existing action",
    Effort: 4,
  };

  const rawJsonTable = buildTaskJsonTable(undefined, {
    subprocess: {
      subTasks: [{
        id: "parent-sp-1",
        wbs: "2.01.01",
        sortOrder: 0,
        task: "Parent subprocess",
        complete: 20,
        start: "2026-04-01",
        finish: "2026-04-01",
        notes: [{ date: "2026-04-01", user: "Ops", note: "Parent log" }],
      }],
    },
    taskSteps: {
      enabled: true,
      totalUnits: 20,
      unitsPerStep: 10,
      stepCount: 2,
      steps: [{
        id: "step-1",
        wbs: "2.01.01",
        sortOrder: 0,
        title: "Lot 1",
        units: 10,
        complete: 30,
        start: "2026-04-01",
        finish: "2026-04-01",
        subprocess: {
          subTasks: [{
            id: "step-sp-1",
            wbs: "2.01.01.01",
            sortOrder: 0,
            task: "Step subprocess",
            complete: 40,
            start: "2026-04-01",
            finish: "2026-04-01",
            evidence: [{ date: "2026-04-01", user: "Ops", fileName: "proof.pdf", fileUrl: "/proof.pdf" }],
          }],
        },
      }],
    },
  });

  it("updates direct subprocess without removing task steps", () => {
    const { payload } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      complete: 100,
      subprocess: {
        subTasks: [{
          id: "parent-sp-1",
          wbs: "2.01.01",
          sortOrder: 0,
          task: "Parent subprocess updated",
          complete: 100,
          start: "2026-04-01",
          finish: "2026-04-01",
        }],
      },
      clearSubprocess: false,
    });

    const subprocess = getTaskSubprocess(payload.jsonTable);
    const taskSteps = getTaskSteps(payload.jsonTable);
    expect(payload.Complete).toBe(100);
    expect(subprocess.subTasks[0].task).toBe("Parent subprocess updated");
    expect(taskSteps.steps[0].subprocess?.subTasks[0].evidence?.[0].fileName).toBe("proof.pdf");
  });

  it("updates task steps without removing direct subprocess", () => {
    const currentSteps = getTaskSteps(rawJsonTable);
    const { payload } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      complete: 75,
      taskSteps: {
        ...currentSteps,
        steps: currentSteps.steps.map(step => ({ ...step, complete: 75 })),
      },
      clearTaskSteps: false,
    });

    expect(getTaskSubprocess(payload.jsonTable).subTasks[0].notes?.[0].note).toBe("Parent log");
    expect(getTaskSteps(payload.jsonTable).steps[0].complete).toBe(75);
  });

  it("builds task detail payload with explicit field overrides", () => {
    const { payload } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      title: "2.02",
      gate: "Gate B",
      taskTitle: "Updated parent task",
      complete: 50,
      effort: "6",
      barriers: "Updated barrier",
      actionableStatus: "Updated action",
      start: "2026-04-02",
      finish: "2026-04-06",
      actualFinish: undefined,
      isRelease: true,
      releaseUnits: 5,
      originalGate: "Gate A",
      renameGate: true,
    });

    expect(payload).toEqual(expect.objectContaining({
      Title: "2.02",
      Gate: "Gate B",
      Task: "Updated parent task",
      Complete: 50,
      Effort: 6,
      Barriers: "Updated barrier",
      ActionableStatus: "Updated action",
      ActualFinish: undefined,
      isRelease: true,
      releaseUnits: 5,
      originalGate: "Gate A",
      renameGate: true,
    }));
    expect(getTaskSubprocess(payload.jsonTable).subTasks).toHaveLength(1);
    expect(getTaskSteps(payload.jsonTable).steps).toHaveLength(1);
  });

  it("sets task finish to today when complete is 100 and finish is missing", () => {
    const expectedToday = getTodayDateInputValue();

    const { payload } = buildTaskPersistencePayload({
      task: { ...task, Finish: undefined, jsonTable: rawJsonTable },
      complete: 100,
      finish: "",
    });

    expect(payload.Finish?.toISOString().slice(0, 10)).toBe(expectedToday);
  });

  it("preserves existing task finish when complete reaches 100", () => {
    const { payload } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      complete: 100,
    });

    expect(payload.Finish?.toISOString().slice(0, 10)).toBe("2026-04-05");
  });

  it("clears direct subprocess without removing task steps", () => {
    const { payload } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      complete: 30,
      clearSubprocess: true,
    });

    expect(getTaskSubprocess(payload.jsonTable).subTasks).toHaveLength(0);
    expect(getTaskSteps(payload.jsonTable).steps[0].subprocess?.subTasks[0].task).toBe("Step subprocess");
  });

  it("clears task steps without removing direct subprocess", () => {
    const { payload } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      complete: 20,
      clearTaskSteps: true,
    });

    expect(getTaskSteps(payload.jsonTable).steps).toHaveLength(0);
    expect(getTaskSubprocess(payload.jsonTable).subTasks[0].task).toBe("Parent subprocess");
  });

  it("reports jsonTable size status without changing the persisted payload", () => {
    const warning = getTaskJsonTableSizeStatus("x".repeat(JSON_TABLE_SIZE_WARNING_THRESHOLD));
    const critical = getTaskJsonTableSizeStatus("x".repeat(JSON_TABLE_SIZE_CRITICAL_THRESHOLD));

    expect(getTaskJsonTableSizeStatus("small").level).toBe("ok");
    expect(warning).toEqual(expect.objectContaining({
      length: JSON_TABLE_SIZE_WARNING_THRESHOLD,
      level: "warning",
    }));
    expect(critical).toEqual(expect.objectContaining({
      length: JSON_TABLE_SIZE_CRITICAL_THRESHOLD,
      level: "critical",
    }));
  });

  it("returns jsonTable size metadata from payload builds", () => {
    const { payload, jsonTableSize } = buildTaskPersistencePayload({
      task: { ...task, jsonTable: rawJsonTable },
      complete: 20,
    });

    expect(jsonTableSize.length).toBe(payload.jsonTable.length);
    expect(jsonTableSize.level).toBe("ok");
  });

  it("updates sort order without removing subprocess or task steps", () => {
    const next = buildTaskSortOrderJsonTable(rawJsonTable, 9);

    expect(JSON.parse(next).sortOrder).toBe(9);
    expect(getTaskSubprocess(next).subTasks[0].task).toBe("Parent subprocess");
    expect(getTaskSteps(next).steps[0].subprocess?.subTasks[0].task).toBe("Step subprocess");
  });

  it("detects when task complete is calculated from jsonTable children", () => {
    const subprocessOnly = buildTaskJsonTable(undefined, {
      subprocess: getTaskSubprocess(rawJsonTable),
    });
    const taskStepsOnly = buildTaskJsonTable(undefined, {
      taskSteps: getTaskSteps(rawJsonTable),
    });

    expect(getTaskCompleteLockMessageFromJsonTable(undefined)).toBeUndefined();
    expect(getTaskCompleteLockMessageFromJsonTable(subprocessOnly)).toContain("subprocess tasks");
    expect(getTaskCompleteLockMessageFromJsonTable(taskStepsOnly)).toContain("Batches");
  });
});
