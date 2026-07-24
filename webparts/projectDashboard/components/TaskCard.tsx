import React, { useEffect, useRef, useState } from "react";
import { ITaskListItem } from "../../../models";
import { INoteEntry, IEvidenceEntry, IApprovalEntry } from "../../../models/ITaskLogFields";
import styles from "./TaskCard.module.scss";
import NotesLog from "./NotesLog";
import EvidenceLog from "./EvidenceLog";
import ApprovalsLog from "./ApprovalsLog";
import SubprocessCard from "./SubprocessCard";
import {
  buildTaskJsonTable,
  getTaskReleaseUnits,
  getTaskSortOrder,
  getTaskSteps,
  getTaskSubprocess,
  ITaskStepsData,
  ITaskSubprocessData,
} from "../utils/TaskDescriptionBlob";

type TaskTab = 'notes' | 'evidence' | 'approvals';
type TaskCardColumnFocus = 'balanced' | 'left' | 'right';
type TaskStepsSource = 'pieces' | 'lots';

export interface ITaskCardProjectInfo {
  projectNumber: string;   // e.g. "1003028"
  partNumber:    string;   // e.g. "ED2-0030 Rev-B"
}

interface TaskCardProps {
  task: ITaskListItem;
  isPlanner?: boolean;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  projectInfo?: ITaskCardProjectInfo;
  projectUnits?: number;
  remainingReleaseUnits?: number;
  onSaveLogField?: (taskId: string, field: 'Notes' | 'Evidence' | 'Approvals', entries: unknown[]) => Promise<void>;
  onSendEmail?: (to: string[], subject: string, body: string) => Promise<void>;
  onSearchUsers?: (query: string) => Promise<{ displayName: string; email: string }[]>;
  onTaskCompleted?: () => void;
  isCreating?: boolean;
  isDeleting?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
  onNavigate?: (dir: 'prev' | 'next') => void;
  isMoveFirst?: boolean;
  isMoveLast?: boolean;
  isMoving?: boolean;
  onMoveFirst?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLast?: () => void;
  onClose?: () => void;
  onDelete: (id: string) => void;
  onNew: (task: ITaskListItem) => void;
  onSave: (
    item: string,
    payload?: string
  ) => void;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
}

const createEmptyTaskSteps = (): ITaskStepsData => ({
  enabled: false,
  totalUnits: 0,
  unitsPerStep: 0,
  stepCount: 0,
  steps: [],
});

const createEmptySubprocess = (): ITaskSubprocessData => ({
  subTasks: [],
});

const asPositiveInteger = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.floor(value));
};

const clampPercentValue = (value: number): number =>
  Math.max(0, Math.min(100, Math.floor(Number.isFinite(value) ? value : 0)));

const aggregateWeightedComplete = (entries: Array<{ complete: number; weight: number }>): number => {
  if (!entries.length) return 0;

  const normalized = entries.map(entry => ({
    complete: clampPercentValue(entry.complete),
    weight: entry.weight > 0 ? entry.weight : 0,
  }));

  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    const average = normalized.reduce((sum, entry) => sum + entry.complete, 0) / normalized.length;
    return clampPercentValue(average);
  }

  const weighted = normalized.reduce((sum, entry) => sum + (entry.complete * entry.weight), 0) / totalWeight;
  return clampPercentValue(weighted);
};

const daysBetween = (startValue: string, finishValue: string): number => {
  if (!startValue || !finishValue) return 0;
  const [sy, sm, sd] = startValue.split("-").map(Number);
  const [fy, fm, fd] = finishValue.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(fy, fm - 1, fd) - Date.UTC(sy, sm - 1, sd)) / 86400000));
};

const addDaysToDateString = (dateValue: string, days: number): string => {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) + days * 86400000);
  return date.toISOString().slice(0, 10);
};

const getStepDateRanges = (startValue: string, finishValue: string, count: number): Array<{ start: string; finish: string }> => {
  if (!startValue || !finishValue || count <= 0) {
    return Array.from({ length: count }, () => ({ start: startValue, finish: finishValue }));
  }

  const inclusiveDays = daysBetween(startValue, finishValue) + 1;
  return Array.from({ length: count }, (_, index) => {
    const startOffset = Math.floor((index * inclusiveDays) / count);
    const endOffset = index === count - 1
      ? inclusiveDays - 1
      : Math.max(startOffset, Math.floor(((index + 1) * inclusiveDays) / count) - 1);

    return {
      start: addDaysToDateString(startValue, startOffset),
      finish: addDaysToDateString(startValue, endOffset),
    };
  });
};

const TaskCard: React.FC<TaskCardProps> = ({ task, isPlanner, isCreating, isDeleting, hasPrev, hasNext, onNavigate, isMoveFirst, isMoveLast, isMoving, onMoveFirst, onMoveUp, onMoveDown, onMoveLast, currentUserEmail, currentUserDisplayName, projectInfo, projectUnits, remainingReleaseUnits, onClose, onSave, onDelete, onNew, onUploadEvidenceFile, onSaveLogField, onSendEmail, onSearchUsers, onTaskCompleted }) => {
  const [activeTab, setActiveTab] = useState<TaskTab>('notes');
  const canManageApprovers = true; // All users can manage approvers
  const [wbs,             setWbs]             = useState(task.Title ?? "");
  const [gate,            setGate]            = useState(task.Gate ?? "");
  const [gateEditEnabled, setGateEditEnabled] = useState(false);
  const [renameAllGateTasks, setRenameAllGateTasks] = useState(true);
  const [isRelease, setIsRelease] = useState(task.isRelease ?? false);
  const [releaseUnits, setReleaseUnits] = useState<number>(task.releaseUnits ?? getTaskReleaseUnits(task.jsonTable) ?? 0);
  const [taskTitle, setTaskTitle] = useState(task.Task ?? "");
  const [complete, setComplete] = useState<number>(task.Complete ?? 0);
  const [start, setStart] = useState<string>(
    task.Start ? new Date(task.Start).toISOString().slice(0, 10) : ""
  );
  const [finish, setFinish] = useState<string>(
    task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : ""
  );

  // Duration (days) derived from start/finish; editing it adjusts finish
  const durationDays = (s: string, f: string): number => {
    if (!s || !f) return 0;
    const [sy, sm, sd] = s.split("-").map(Number);
    const [fy, fm, fd] = f.split("-").map(Number);
    return Math.max(0, Math.round((Date.UTC(fy, fm - 1, fd) - Date.UTC(sy, sm - 1, sd)) / 86400000));
  };
  const duration = durationDays(start, finish);
  const handleDurationChange = (days: number): void => {
    if (!start || days < 0) return;
    const [sy, sm, sd] = start.split("-").map(Number);
    const d = new Date(Date.UTC(sy, sm - 1, sd) + days * 86400000);
    setFinish(d.toISOString().slice(0, 10));
  };
  const [effort, setEffort] = useState<string>(
    task.Effort !== undefined ? task.Effort.toString() : ""
  );
  const [barriers, setBarriers] = useState(task.Barriers ?? "");
  const [actionableStatus, setActionableStatus] = useState(task.ActionableStatus ?? "");
  const [evidenceOfCompletion, setEvidenceOfCompletion] = useState<ITaskListItem["EvidenceOfCompletion"]>(task.EvidenceOfCompletion);
  const [notesLog, setNotesLog] = useState<INoteEntry[]>(task.Notes ?? []);
  const [evidenceLog, setEvidenceLog] = useState<IEvidenceEntry[]>(task.Evidence ?? []);
  const initialTaskSteps = getTaskSteps(task.jsonTable);
  const rawInitialSubprocess = getTaskSubprocess(task.jsonTable);
  const initialHasSubprocessWorkspace =
    rawInitialSubprocess.subTasks.length > 0 ||
    initialTaskSteps.enabled ||
    initialTaskSteps.steps.length > 0;
  const initialSubprocess = initialTaskSteps.enabled || initialTaskSteps.steps.length > 0
    ? createEmptySubprocess()
    : rawInitialSubprocess;
  const [showSubprocess, setShowSubprocess] = useState(initialHasSubprocessWorkspace);
  const [subprocess, setSubprocess] = useState<ITaskSubprocessData>(initialSubprocess);
  const [showTaskSteps, setShowTaskSteps] = useState(initialTaskSteps.enabled || initialTaskSteps.steps.length > 0);
  const [taskSteps, setTaskSteps] = useState<ITaskStepsData>(initialTaskSteps);
  const [taskStepsPieces, setTaskStepsPieces] = useState<number>(initialTaskSteps.unitsPerStep > 0 ? initialTaskSteps.unitsPerStep : 20);
  const [taskStepsLots, setTaskStepsLots] = useState<number>(initialTaskSteps.stepCount);
  const [taskStepsSource, setTaskStepsSource] = useState<TaskStepsSource>(
    initialTaskSteps.stepCount > 0 && initialTaskSteps.unitsPerStep <= 0 ? "lots" : "pieces"
  );
  const [selectedTaskStepId, setSelectedTaskStepId] = useState<string | undefined>(initialTaskSteps.steps[0]?.id);
  const [isTaskStepExpanded, setIsTaskStepExpanded] = useState(initialTaskSteps.steps.length > 0);
  const [showTaskStepSubprocess, setShowTaskStepSubprocess] = useState(false);
  const [taskStepTitleEdit, setTaskStepTitleEdit] = useState(initialTaskSteps.steps[0]?.title ?? "");
  const [taskStepUnitsEdit, setTaskStepUnitsEdit] = useState<number>(initialTaskSteps.steps[0]?.units ?? 0);
  const [taskStepCompleteEdit, setTaskStepCompleteEdit] = useState<number>(initialTaskSteps.steps[0]?.complete ?? 0);
  const [taskStepStartEdit, setTaskStepStartEdit] = useState(initialTaskSteps.steps[0]?.start ?? "");
  const [taskStepFinishEdit, setTaskStepFinishEdit] = useState(initialTaskSteps.steps[0]?.finish ?? "");
  const [taskStepActualFinishEdit, setTaskStepActualFinishEdit] = useState(initialTaskSteps.steps[0]?.actualFinish ?? "");
  const [columnFocus, setColumnFocus] = useState<TaskCardColumnFocus>('balanced');
  const [bodyCollapsed, setBodyCollapsed] = useState(initialHasSubprocessWorkspace);
  const notesLogRef        = useRef<INoteEntry[]>(task.Notes ?? []);
  const previousCompleteRef = useRef<number>(task.Complete ?? 0);
  const skipNextCompleteEffectRef = useRef(false);
  const skipNextTaskStepsRecalcRef = useRef(true);
  const hasTaskSteps = taskSteps.enabled && taskSteps.steps.length > 0;
  const totalProjectUnits = asPositiveInteger(projectUnits ?? 0);
  const hasSubprocessWorkspace = showSubprocess || subprocess.subTasks.length > 0 || hasTaskSteps;

  const buildTaskStepsData = (source: TaskStepsSource, rawValue: number, enabled = true): ITaskStepsData => {
    const totalUnits = asPositiveInteger(projectUnits ?? 0);
    if (totalUnits <= 0) {
      return {
        enabled,
        totalUnits: 0,
        unitsPerStep: 0,
        stepCount: 0,
        steps: [],
      };
    }

    let stepCount = 0;
    let unitsPerStep = 0;

    if (source === "pieces") {
      unitsPerStep = asPositiveInteger(rawValue);
      if (unitsPerStep <= 0) {
        return {
          enabled,
          totalUnits,
          unitsPerStep: 0,
          stepCount: 0,
          steps: [],
        };
      }
      stepCount = Math.ceil(totalUnits / unitsPerStep);
    } else {
      stepCount = asPositiveInteger(rawValue);
      if (stepCount <= 0) {
        return {
          enabled,
          totalUnits,
          unitsPerStep: 0,
          stepCount: 0,
          steps: [],
        };
      }
      unitsPerStep = Math.max(1, Math.floor(totalUnits / stepCount));
    }

    const dateRanges = getStepDateRanges(start, finish, stepCount);
    const baseWbs = wbs || task.Title || "1";
    const baseTitle = taskTitle || task.Task || "Task";
    const previousSteps = taskSteps.steps;
    let remainingUnits = totalUnits;

    const steps = Array.from({ length: stepCount }, (_, index) => {
      const previousStep = previousSteps[index];
      const defaultUnits = source === "pieces"
        ? Math.min(unitsPerStep, remainingUnits)
        : Math.min(Math.max(1, Math.floor(totalUnits / stepCount)), remainingUnits);
      const units = index === stepCount - 1 ? remainingUnits : defaultUnits;
      remainingUnits -= units;

      return {
        id: `step-${index + 1}`,
        wbs: `${baseWbs}.${String(index + 1).padStart(2, "0")}`,
        sortOrder: index,
        title: `${baseTitle} - Step ${index + 1}`,
        units,
        complete: previousStep?.complete ?? 0,
        start: dateRanges[index]?.start ?? start,
        finish: dateRanges[index]?.finish ?? finish,
        actualFinish: previousStep?.actualFinish ?? "",
        notes: previousStep?.notes ?? [],
        evidence: previousStep?.evidence ?? [],
        approvals: previousStep?.approvals ?? [],
        subprocess: previousStep?.subprocess ?? { subTasks: [] },
      };
    });

    return {
      enabled,
      totalUnits,
      unitsPerStep,
      stepCount,
      steps,
    };
  };

  const aggregateSubprocessComplete = (subprocessValue: ITaskSubprocessData): number =>
    aggregateWeightedComplete(
      subprocessValue.subTasks.map(subTask => ({
        complete: subTask.complete,
        weight: typeof subTask.duration === "number" && Number.isFinite(subTask.duration) && subTask.duration > 0
          ? subTask.duration
          : 0,
      }))
    );

  const normalizeTaskStepsAggregation = (value: ITaskStepsData): ITaskStepsData => ({
    ...value,
    steps: value.steps.map(step => {
      const subprocessValue = step.subprocess ?? { subTasks: [] };
      const derivedComplete = subprocessValue.subTasks.length > 0
        ? aggregateSubprocessComplete(subprocessValue)
        : clampPercentValue(step.complete);

      return {
        ...step,
        complete: derivedComplete,
        actualFinish: derivedComplete === 100
          ? (step.actualFinish || new Date().toISOString().slice(0, 10))
          : "",
      };
    }),
  });

  const aggregateTaskStepsComplete = (value: ITaskStepsData): number =>
    aggregateWeightedComplete(
      normalizeTaskStepsAggregation(value).steps.map(step => ({
        complete: step.complete,
        weight: step.units > 0 ? step.units : 0,
      }))
    );

  const deriveTaskComplete = (nextTaskSteps?: ITaskStepsData, nextSubprocess?: ITaskSubprocessData): number => {
    if (nextTaskSteps && nextTaskSteps.enabled && nextTaskSteps.steps.length > 0) {
      return aggregateTaskStepsComplete(nextTaskSteps);
    }

    if (nextSubprocess && nextSubprocess.subTasks.length > 0) {
      return aggregateSubprocessComplete(nextSubprocess);
    }

    return clampPercentValue(complete);
  };

  const applyTaskStepsFromPieces = (piecesValue: number, enabled = true): void => {
    const normalizedPieces = asPositiveInteger(piecesValue);
    const nextTaskSteps = normalizeTaskStepsAggregation(buildTaskStepsData("pieces", normalizedPieces, enabled));
    setTaskStepsSource("pieces");
    setTaskStepsPieces(normalizedPieces || 20);
    setTaskStepsLots(nextTaskSteps.stepCount);
    setTaskSteps(nextTaskSteps);
    setComplete(deriveTaskComplete(nextTaskSteps, undefined));
  };

  const applyTaskStepsFromLots = (lotsValue: number, enabled = true): void => {
    const normalizedLots = asPositiveInteger(lotsValue);
    const nextTaskSteps = normalizeTaskStepsAggregation(buildTaskStepsData("lots", normalizedLots, enabled));
    setTaskStepsSource("lots");
    setTaskStepsLots(normalizedLots);
    setTaskStepsPieces(nextTaskSteps.unitsPerStep);
    setTaskSteps(nextTaskSteps);
    setComplete(deriveTaskComplete(nextTaskSteps, undefined));
  };

  const commitTaskSteps = (nextTaskSteps: ITaskStepsData): ITaskStepsData => {
    setTaskSteps(nextTaskSteps);
    setSelectedTaskStepId(current => {
      if (current && nextTaskSteps.steps.some(step => step.id === current)) {
        return current;
      }
      return nextTaskSteps.steps[0]?.id;
    });
    return nextTaskSteps;
  };

  useEffect(() => {
    setWbs(task.Title ?? "");
    setGate(task.Gate ?? "");
    setGateEditEnabled(false);
    setRenameAllGateTasks(true);
    setIsRelease(task.isRelease ?? false);
    setReleaseUnits(task.releaseUnits ?? getTaskReleaseUnits(task.jsonTable) ?? 0);
    setTaskTitle(task.Task ?? "");
    setComplete(task.Complete ?? 0);
    setStart(task.Start ? new Date(task.Start).toISOString().slice(0, 10) : "");
    setFinish(task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : "");
    setEffort(task.Effort !== undefined ? task.Effort.toString() : "");
    setBarriers(task.Barriers ?? "");
    setActionableStatus(task.ActionableStatus ?? "");
    setEvidenceOfCompletion(task.EvidenceOfCompletion);
    setNotesLog(task.Notes ?? []);
    notesLogRef.current = task.Notes ?? [];
    setEvidenceLog(task.Evidence ?? []);
    const nextTaskSteps = getTaskSteps(task.jsonTable);
    const rawNextSubprocess = getTaskSubprocess(task.jsonTable);
    const nextHasSubprocessWorkspace =
      rawNextSubprocess.subTasks.length > 0 ||
      nextTaskSteps.enabled ||
      nextTaskSteps.steps.length > 0;
    const nextSubprocess = nextTaskSteps.enabled || nextTaskSteps.steps.length > 0
      ? createEmptySubprocess()
      : rawNextSubprocess;
    setShowSubprocess(nextHasSubprocessWorkspace);
    setSubprocess(nextSubprocess);
    setShowTaskSteps(nextTaskSteps.enabled || nextTaskSteps.steps.length > 0);
    setTaskSteps(nextTaskSteps);
    setTaskStepsPieces(nextTaskSteps.unitsPerStep > 0 ? nextTaskSteps.unitsPerStep : 20);
    setTaskStepsLots(nextTaskSteps.stepCount);
    setTaskStepsSource(nextTaskSteps.stepCount > 0 && nextTaskSteps.unitsPerStep <= 0 ? "lots" : "pieces");
    setSelectedTaskStepId(nextTaskSteps.steps[0]?.id);
    setShowTaskStepSubprocess(false);
    skipNextTaskStepsRecalcRef.current = true;
    setColumnFocus('balanced');
    setBodyCollapsed(nextHasSubprocessWorkspace);
    previousCompleteRef.current = task.Complete ?? 0;
  }, [task]);

  useEffect(() => {
    if (skipNextTaskStepsRecalcRef.current) {
      skipNextTaskStepsRecalcRef.current = false;
      return;
    }

    if (!taskSteps.enabled) return;

    if (taskStepsSource === "lots" && taskStepsLots > 0) {
      setTaskSteps(buildTaskStepsData("lots", taskStepsLots, true));
      return;
    }

    if (taskStepsPieces > 0) {
      setTaskSteps(buildTaskStepsData("pieces", taskStepsPieces, true));
    }
  }, [projectUnits, start, finish, wbs, taskTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!taskSteps.steps.length) {
      setSelectedTaskStepId(undefined);
      setIsTaskStepExpanded(false);
      setShowTaskStepSubprocess(false);
      setTaskStepTitleEdit("");
      setTaskStepUnitsEdit(0);
      setTaskStepCompleteEdit(0);
      setTaskStepStartEdit("");
      setTaskStepFinishEdit("");
      setTaskStepActualFinishEdit("");
      return;
    }

    if (selectedTaskStepId && taskSteps.steps.some(step => step.id === selectedTaskStepId)) {
      return;
    }

    setSelectedTaskStepId(taskSteps.steps[0].id);
    setIsTaskStepExpanded(true);
  }, [taskSteps.steps, selectedTaskStepId]);

  useEffect(() => {
    const selectedStep = selectedTaskStepId
      ? taskSteps.steps.find(step => step.id === selectedTaskStepId)
      : undefined;

    if (!selectedStep) return;

    setTaskStepTitleEdit(selectedStep.title);
    setTaskStepUnitsEdit(selectedStep.units);
    setTaskStepCompleteEdit(selectedStep.complete);
    setTaskStepStartEdit(selectedStep.start);
    setTaskStepFinishEdit(selectedStep.finish);
    setTaskStepActualFinishEdit(selectedStep.actualFinish ?? "");
  }, [selectedTaskStepId, taskSteps.steps]);

  const handleSave = (overrides?: {
    complete?: number;
    evidenceOfCompletion?: ITaskListItem["EvidenceOfCompletion"];
  }): void => {
    if (isRelease && releaseUnits <= 0) {
      alert("Release Units must be greater than 0 for a release task.");
      return;
    }

    const derivedTaskSteps = taskSteps.enabled
      ? normalizeTaskStepsAggregation(taskSteps)
      : createEmptyTaskSteps();
    const derivedSubprocess = derivedTaskSteps.enabled && derivedTaskSteps.steps.length > 0
      ? undefined
      : subprocess;
    const effectiveComplete = overrides?.complete ?? deriveTaskComplete(derivedTaskSteps, derivedSubprocess);
    const effectiveEvidence = overrides && Object.prototype.hasOwnProperty.call(overrides, 'evidenceOfCompletion')
      ? overrides.evidenceOfCompletion
      : evidenceOfCompletion;
    const actualFinish: Date | null =
      effectiveComplete === 100
        ? task.ActualFinish ? new Date(task.ActualFinish) : new Date()
        : null;

    const gateChanged = gate !== task.Gate;
    const sortOrder = getTaskSortOrder(task.jsonTable);
    const nextTaskSteps = derivedTaskSteps;
    const hasTaskStepsData = nextTaskSteps.enabled && nextTaskSteps.steps.length > 0;
    const hasSubprocessData = !hasTaskStepsData && subprocess.subTasks.length > 0;
    const jsonTable = buildTaskJsonTable(task.jsonTable, {
      sortOrder,
      isRelease: isRelease || undefined,
      releaseUnits: isRelease ? releaseUnits : undefined,
      subprocess: hasSubprocessData ? subprocess : undefined,
      clearSubprocess: !hasSubprocessData,
      taskSteps: hasTaskStepsData ? nextTaskSteps : undefined,
      clearTaskSteps: !hasTaskStepsData,
    });
    const data = {
      Id: task.Id,
      Title: wbs,
      Gate: gate,
      Task: taskTitle,
      Complete: effectiveComplete,
      Effort: effort ? Number(effort) : undefined,
      Barriers: barriers,
      ActionableStatus: actionableStatus,
      Start: start ? new Date(start) : undefined,
      Finish: finish ? new Date(finish) : undefined,
      ActualFinish: actualFinish,
      Description: task.Description ?? "",
      jsonTable: jsonTable ?? "",
      isRelease,
      releaseUnits: isRelease ? releaseUnits : 0,
      EvidenceOfCompletion: effectiveEvidence,
      ...(gateChanged && { originalGate: task.Gate, renameGate: renameAllGateTasks }),
    };

    setComplete(effectiveComplete);
    onSave(task.Id, JSON.stringify(data));
  };

  const handleSaveSubprocessOnly = (nextSubprocess: ITaskSubprocessData): void => {
    const hasSubprocessData = nextSubprocess.subTasks.length > 0;
    const aggregatedComplete = hasSubprocessData ? aggregateSubprocessComplete(nextSubprocess) : 0;
    const jsonTable = buildTaskJsonTable(task.jsonTable, {
      sortOrder: getTaskSortOrder(task.jsonTable),
      isRelease: task.isRelease || undefined,
      releaseUnits: task.isRelease ? task.releaseUnits : undefined,
      subprocess: hasSubprocessData ? nextSubprocess : undefined,
      clearSubprocess: !hasSubprocessData,
    });

    const data = {
      Id: task.Id,
      Title: task.Title ?? "",
      Gate: task.Gate ?? "",
      Task: task.Task ?? "",
      Complete: aggregatedComplete,
      Effort: task.Effort,
      Barriers: task.Barriers ?? "",
      ActionableStatus: task.ActionableStatus ?? "",
      Start: task.Start ?? undefined,
      Finish: task.Finish ?? undefined,
      ActualFinish: aggregatedComplete === 100 ? (task.ActualFinish ?? new Date()) : undefined,
      Description: task.Description ?? "",
      jsonTable: jsonTable ?? "",
      isRelease: task.isRelease ?? false,
      releaseUnits: task.isRelease ? (task.releaseUnits ?? 0) : 0,
      EvidenceOfCompletion: task.EvidenceOfCompletion,
    };

    setSubprocess(nextSubprocess);
    setComplete(aggregatedComplete);
    onSave(task.Id, JSON.stringify(data));
  };

  const handleSaveTaskStepsOnly = (nextTaskSteps: ITaskStepsData): void => {
    const normalizedTaskSteps = normalizeTaskStepsAggregation(nextTaskSteps);
    const hasTaskStepsData = normalizedTaskSteps.enabled && normalizedTaskSteps.steps.length > 0;
    const aggregatedComplete = hasTaskStepsData ? aggregateTaskStepsComplete(normalizedTaskSteps) : 0;
    const jsonTable = buildTaskJsonTable(task.jsonTable, {
      sortOrder: getTaskSortOrder(task.jsonTable),
      isRelease: task.isRelease || undefined,
      releaseUnits: task.isRelease ? task.releaseUnits : undefined,
      clearSubprocess: true,
      taskSteps: hasTaskStepsData ? normalizedTaskSteps : undefined,
      clearTaskSteps: !hasTaskStepsData,
    });

    const data = {
      Id: task.Id,
      Title: task.Title ?? "",
      Gate: task.Gate ?? "",
      Task: task.Task ?? "",
      Complete: aggregatedComplete,
      Effort: task.Effort,
      Barriers: task.Barriers ?? "",
      ActionableStatus: task.ActionableStatus ?? "",
      Start: task.Start ?? undefined,
      Finish: task.Finish ?? undefined,
      ActualFinish: aggregatedComplete === 100 ? (task.ActualFinish ?? new Date()) : undefined,
      Description: task.Description ?? "",
      jsonTable: jsonTable ?? "",
      isRelease: task.isRelease ?? false,
      releaseUnits: task.isRelease ? (task.releaseUnits ?? 0) : 0,
      EvidenceOfCompletion: task.EvidenceOfCompletion,
    };

    setTaskSteps(normalizedTaskSteps);
    setComplete(aggregatedComplete);
    onSave(task.Id, JSON.stringify(data));
  };

  const handleSaveTaskStepSubprocessOnly = (stepId: string, nextSubprocess: ITaskSubprocessData): void => {
    const nextTaskSteps: ITaskStepsData = {
      ...taskSteps,
      enabled: true,
      steps: taskSteps.steps.map(step => (
        step.id === stepId
          ? {
              ...step,
              subprocess: nextSubprocess,
            }
          : step
      )),
    };

    const normalizedTaskSteps = normalizeTaskStepsAggregation(nextTaskSteps);
    commitTaskSteps(normalizedTaskSteps);
    handleSaveTaskStepsOnly(normalizedTaskSteps);
  };

  const handleSaveSelectedTaskStep = (): void => {
    if (!selectedTaskStepId) return;

    if (taskStepStartEdit && taskStepFinishEdit) {
      const startMs = Date.parse(taskStepStartEdit);
      const finishMs = Date.parse(taskStepFinishEdit);
      if (Number.isFinite(startMs) && Number.isFinite(finishMs) && finishMs < startMs) {
        alert("Step Finish date cannot be earlier than Step Start date.");
        return;
      }
    }

    const normalizedUnits = Math.max(1, Math.floor(taskStepUnitsEdit || 0));
    const normalizedComplete = Math.max(0, Math.min(100, Math.floor(taskStepCompleteEdit || 0)));
    const normalizedActualFinish = normalizedComplete === 100
      ? (taskStepActualFinishEdit || new Date().toISOString().slice(0, 10))
      : "";

    const nextTaskSteps: ITaskStepsData = {
      ...taskSteps,
      enabled: true,
      steps: taskSteps.steps.map(step => (
        step.id === selectedTaskStepId
          ? {
              ...step,
              title: taskStepTitleEdit || step.title,
              units: normalizedUnits,
              complete: normalizedComplete,
              start: taskStepStartEdit,
              finish: taskStepFinishEdit,
              actualFinish: normalizedActualFinish,
            }
          : step
      )),
    };
    nextTaskSteps.totalUnits = nextTaskSteps.steps.reduce((sum, step) => sum + Math.max(0, step.units || 0), 0);

    const normalizedTaskSteps = normalizeTaskStepsAggregation(nextTaskSteps);
    commitTaskSteps(normalizedTaskSteps);
    handleSaveTaskStepsOnly(normalizedTaskSteps);
  };

  const buildApprovalEmail = (requestedBy: string): { subject: string; body: string } => {
    const jobNumber  = projectInfo?.projectNumber ?? '';
    const partNumber = projectInfo?.partNumber    ?? '';
    const subject = `Approval requested: ${task.Task}`;
    const body = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
  <h2 style="color:#0078d4;margin-bottom:4px;">Task Approval Required</h2>
  <p style="margin:0 0 16px;">Task <strong>${task.Task}</strong> requires your approval.</p>

  <div style="background:#f3f8fd;border-left:4px solid #0078d4;border-radius:4px;padding:16px 20px;margin-bottom:16px;">
    <p style="margin:0 0 12px;font-weight:600;color:#0078d4;">How to find this task</p>
    <ol style="margin:0;padding-left:20px;line-height:2;">
      <li>Go to the <a href="https://ed2corp.sharepoint.com/" style="color:#0078d4;">Jobs Management page</a></li>
      ${jobNumber ? `<li>Find Job <strong>${jobNumber}</strong> in the Jobs table${partNumber ? ` (Part Number: <strong>${partNumber}</strong>)` : ''}</li>` : ''}
      <li>Click on gate <strong>${task.Gate}</strong> to expand its tasks</li>
      <li>Click on task name <strong>${task.Task}</strong> to open its detail panel</li>
      <li>In the right column, open the <strong>Approvals</strong> tab</li>
    </ol>
  </div>

  <p style="color:#444;">Review the task and <strong>approve or reject</strong> based on your assessment.</p>
  <p style="color:#999;font-size:12px;margin-top:20px;">Requested by: <strong>${requestedBy}</strong></p>
</div>`.trim();
    return { subject, body };
  };


  const saveNotesEntries = async (entries: INoteEntry[], shouldSaveTask = false): Promise<void> => {
    setNotesLog(entries);
    notesLogRef.current = entries;
    await onSaveLogField?.(task.Id, 'Notes', entries);
    if (shouldSaveTask) {
      handleSave();
    }
  };

  const saveEvidenceEntries = async (entries: IEvidenceEntry[], shouldSaveTask = false): Promise<void> => {
    setEvidenceLog(entries);
    await onSaveLogField?.(task.Id, 'Evidence', entries);
    if (shouldSaveTask) {
      handleSave();
    }
  };

  const appendAuditNote = async (text: string): Promise<void> => {
    const entry: INoteEntry = {
      date: new Date().toISOString(),
      user: currentUserDisplayName ?? '',
      note: text,
    };
    await saveNotesEntries([...notesLogRef.current, entry]);
  };

  const handleToggleEvidenceOfCompletion = async (entry: IEvidenceEntry): Promise<void> => {
    const nextEntries = evidenceLog.map(current => {
      const isTarget =
        current.date === entry.date &&
        current.fileUrl === entry.fileUrl &&
        current.fileName === entry.fileName;

      if (isTarget) {
        return {
          ...current,
          isEvidenceOfCompletion: !current.isEvidenceOfCompletion,
        };
      }

      if (!entry.isEvidenceOfCompletion) {
        return {
          ...current,
          isEvidenceOfCompletion: false,
        };
      }

      return current;
    });

    const activeEvidence = nextEntries.find(current => current.isEvidenceOfCompletion);
    const nextEvidenceOfCompletion = activeEvidence
      ? {
          Url: activeEvidence.fileUrl,
          Description: activeEvidence.note || activeEvidence.fileName,
        }
      : undefined;

    setEvidenceOfCompletion(nextEvidenceOfCompletion);
    await saveEvidenceEntries(nextEntries, false);
    handleSave({ evidenceOfCompletion: nextEvidenceOfCompletion });
    await appendAuditNote(
      activeEvidence && activeEvidence.fileUrl === entry.fileUrl && activeEvidence.date === entry.date
        ? `Evidence of completion marked for file ${entry.fileName} by ${currentUserDisplayName ?? 'system'}`
        : `Evidence of completion removed for file ${entry.fileName} by ${currentUserDisplayName ?? 'system'}`
    );
  };

  const handleSaveClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    handleSave();
  };

  useEffect(() => {
    if (skipNextCompleteEffectRef.current) {
      skipNextCompleteEffectRef.current = false;
      previousCompleteRef.current = complete;
      return;
    }

    const crossedToComplete = previousCompleteRef.current < 100 && complete === 100;
    previousCompleteRef.current = complete;

    if (!crossedToComplete) {
      return;
    }

    handleSave({ complete: 100 });
    appendAuditNote(`Task marked as 100% complete by ${currentUserDisplayName ?? 'system'}`).catch(() => undefined);
  }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasCompletionEvidence = evidenceLog.some(entry => entry.isEvidenceOfCompletion);
  const handleNew = (): void => onNew(task);
  const handleDelete = (): void => onDelete(task.Id);
  const handleToggleSubprocess = (): void => {
    setShowSubprocess(prev => {
      const next = !prev;
      if (next) {
        setBodyCollapsed(true);
      }
      return next;
    });
  };
  const handleToggleTaskSteps = (): void => {
    setShowTaskSteps(prev => {
      const next = !prev;
      if (next) {
        setShowSubprocess(true);
        setBodyCollapsed(false);
      }
      return next;
    });
  };
  const selectedTaskStep = selectedTaskStepId
    ? taskSteps.steps.find(step => step.id === selectedTaskStepId)
    : undefined;
  const taskStepsPanel = !showTaskSteps ? null : (
    <div className={styles["task-steps-card"]}>
      <div className={styles["task-steps-header"]}>
        <strong>TaskSteps</strong>
        <label className={styles["gate-edit-toggle"]}>
          <input
            type="checkbox"
            checked={taskSteps.enabled}
            onChange={e => {
              const checked = e.target.checked;
              if (!checked) {
                setTaskSteps(createEmptyTaskSteps());
                setShowTaskStepSubprocess(false);
                setIsTaskStepExpanded(false);
                return;
              }
              setSubprocess(createEmptySubprocess());
              if (taskStepsSource === "lots" && taskStepsLots > 0) {
                applyTaskStepsFromLots(taskStepsLots, true);
              } else {
                applyTaskStepsFromPieces(taskStepsPieces > 0 ? taskStepsPieces : 20, true);
              }
            }}
          />
          <span className={styles["gate-edit-track"]}>
            <span className={styles["gate-edit-thumb"]} />
          </span>
          <span className={styles["gate-edit-label"]}>Use</span>
        </label>
      </div>

      <div className={styles["task-steps-grid"]}>
        <label className={styles["task-steps-field"]}>
          <span>Total Units</span>
          <input type="number" value={totalProjectUnits || ""} className={styles["input-small"]} disabled />
        </label>
        <label className={styles["task-steps-field"]}>
          <span># Pieces</span>
          <input
            type="number"
            min={1}
            value={taskStepsPieces || ""}
            className={styles["input-small"]}
            onChange={e => applyTaskStepsFromPieces(Number(e.target.value) || 0, taskSteps.enabled)}
          />
        </label>
        <label className={styles["task-steps-field"]}>
          <span># Lots</span>
          <input
            type="number"
            min={1}
            value={taskStepsLots || ""}
            className={styles["input-small"]}
            onChange={e => applyTaskStepsFromLots(Number(e.target.value) || 0, taskSteps.enabled)}
          />
        </label>
      </div>

      {totalProjectUnits <= 0 && (
        <div className={styles["task-steps-hint"]}>
          TaskSteps need project Units defined in ED2-Projects.
        </div>
      )}

      {taskSteps.enabled && taskSteps.steps.length > 0 && (
        <>
          <div className={styles["task-steps-summary"]}>
            <span>{taskSteps.steps.length} steps generated</span>
            <div className={styles["task-steps-summary-actions"]}>
              {selectedTaskStep && (
                <button
                  type="button"
                  className={`${styles["task-button"]} ${styles["task-button-save"]} ${((selectedTaskStep.subprocess?.subTasks?.length ?? 0) > 0) ? styles["task-button-subprocess-ready"] : ""}`}
                  onClick={() => setShowTaskStepSubprocess(prev => !prev)}
                >
                  <span className={styles["task-button-label"]}>
                    {showTaskStepSubprocess ? "Hide Step Flow" : "Step Flow"}
                  </span>
                </button>
              )}
              <button
                type="button"
                className={`${styles["task-button"]} ${styles["task-button-save"]}`}
                onClick={() => {
                  setTaskSteps(createEmptyTaskSteps());
                  setTaskStepsLots(0);
                  setTaskStepsPieces(20);
                  setSelectedTaskStepId(undefined);
                  setIsTaskStepExpanded(false);
                  setShowTaskStepSubprocess(false);
                }}
              >
                <span className={styles["task-button-label"]}>Reset</span>
              </button>
            </div>
          </div>

          <div className={styles["task-steps-preview"]}>
            {taskSteps.steps.map(step => {
              const isSelectedStep = step.id === selectedTaskStepId;
              const stepDuration = daysBetween(step.start, step.finish);

              return (
                <div key={step.id} className={styles["task-step-item"]}>
                  <button
                    type="button"
                    className={[
                      styles["task-step-row"],
                      isSelectedStep ? styles["task-step-row-active"] : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => {
                      if (isSelectedStep) {
                        setIsTaskStepExpanded(prev => {
                          const nextExpanded = !prev;
                          if (!nextExpanded) {
                            setShowTaskStepSubprocess(false);
                          }
                          return nextExpanded;
                        });
                        return;
                      }

                      setSelectedTaskStepId(step.id);
                      setIsTaskStepExpanded(true);
                    }}
                  >
                    <div className={styles["task-step-main"]}>
                      <span className={styles["task-step-wbs"]}>{step.wbs}</span>
                      <span className={styles["task-step-title"]}>{step.title}</span>
                    </div>
                    <div className={styles["task-step-meta"]}>
                      <span>{step.units} units</span>
                      <span>{step.subprocess?.subTasks?.length ?? 0} subprocess</span>
                      <span>{step.start || "-"} to {step.finish || "-"}</span>
                    </div>
                  </button>

                  {isSelectedStep && isTaskStepExpanded && selectedTaskStep && (
                    <div className={styles["task-step-workspace"]}>
                      <div className={styles["task-step-detail"]}>
                        <div className={styles["task-step-detail-header"]}>
                          <div>
                            <strong>{selectedTaskStep.wbs}</strong>
                            <span>{selectedTaskStep.title}</span>
                          </div>
                          <div className={styles["task-step-detail-meta"]}>
                            <span>{selectedTaskStep.units} units</span>
                            <span>{stepDuration} days</span>
                            <span>{selectedTaskStep.subprocess?.subTasks?.length ?? 0} subprocess</span>
                          </div>
                        </div>

                        <div className={styles["task-step-editor"]}>
                          <label className={styles["task-step-editor-field"]}>
                            <span>Task</span>
                            <input
                              type="text"
                              value={taskStepTitleEdit}
                              className={styles["input-small"]}
                              onChange={e => setTaskStepTitleEdit(e.target.value)}
                            />
                          </label>
                          <label className={styles["task-step-editor-field"]}>
                            <span>Units</span>
                            <input
                              type="number"
                              min={1}
                              value={taskStepUnitsEdit}
                              className={styles["input-small"]}
                              onChange={e => setTaskStepUnitsEdit(Math.max(1, Number(e.target.value) || 0))}
                            />
                          </label>
                          <label className={styles["task-step-editor-field"]}>
                            <span>% Complete</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={taskStepCompleteEdit}
                              className={styles["input-small"]}
                              onChange={e => setTaskStepCompleteEdit(Number(e.target.value) || 0)}
                            />
                          </label>
                          <label className={styles["task-step-editor-field"]}>
                            <span>Start</span>
                            <input
                              type="date"
                              value={taskStepStartEdit}
                              className={styles["input-small"]}
                              onChange={e => setTaskStepStartEdit(e.target.value)}
                            />
                          </label>
                          <label className={styles["task-step-editor-field"]}>
                            <span>Delivery Date</span>
                            <input
                              type="date"
                              value={taskStepFinishEdit}
                              className={styles["input-small"]}
                              onChange={e => setTaskStepFinishEdit(e.target.value)}
                            />
                          </label>
                          <label className={styles["task-step-editor-field"]}>
                            <span>Actual Finish</span>
                            <input
                              type="date"
                              value={taskStepActualFinishEdit}
                              className={styles["input-small"]}
                              onChange={e => setTaskStepActualFinishEdit(e.target.value)}
                              disabled={taskStepCompleteEdit < 100}
                            />
                          </label>
                          <div className={styles["task-step-editor-actions"]}>
                            <button
                              type="button"
                              className={`${styles["task-button"]} ${styles["task-button-save"]}`}
                              onClick={handleSaveSelectedTaskStep}
                            >
                              <span className={styles["task-button-label"]}>Save Step</span>
                            </button>
                          </div>
                        </div>

                        {showTaskStepSubprocess && (
                          <SubprocessCard
                            parentWbs={selectedTaskStep.wbs}
                            parentStart={selectedTaskStep.start}
                            parentFinish={selectedTaskStep.finish}
                            value={selectedTaskStep.subprocess ?? { subTasks: [] }}
                            onChange={(nextValue) => {
                              const normalizedTaskSteps = normalizeTaskStepsAggregation({
                                ...taskSteps,
                                enabled: true,
                                steps: taskSteps.steps.map(taskStep => (
                                  taskStep.id === selectedTaskStep.id
                                    ? { ...taskStep, subprocess: nextValue }
                                    : taskStep
                                )),
                              });
                              commitTaskSteps(normalizedTaskSteps);
                              setComplete(deriveTaskComplete(normalizedTaskSteps, undefined));
                            }}
                            onSaveSubprocess={(nextValue) => handleSaveTaskStepSubprocessOnly(selectedTaskStep.id, nextValue)}
                            onClose={() => setShowTaskStepSubprocess(false)}
                            currentUserEmail={currentUserEmail}
                            currentUserDisplayName={currentUserDisplayName}
                            onUploadEvidenceFile={onUploadEvidenceFile}
                            onSendEmail={onSendEmail}
                            onSearchUsers={onSearchUsers}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={styles["task-card"]}>
        <div className={styles["task-card-header"]}>
          <div className={styles["task-details-title-group"]}>
            <div className={styles["task-details-kicker"]}>Task</div>
            <h1 className={styles["task-title"]}>{task.Task}</h1>
          </div>
          <div className={styles["task-btn-group"]}>

          {/* ── Prev / Next navigation — blue card ── */}
          <div className={styles["task-nav-card"]}>
            <button
              type="button"
              className={`${styles["task-button"]} ${styles["task-button-nav"]}`}
              onClick={() => onNavigate?.('prev')}
              disabled={!hasPrev}
              title={hasPrev ? "Previous task" : "No previous task"}
            >
              <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10l4-5 4 5"/>
              </svg>
            </button>
            <button
              type="button"
              className={`${styles["task-button"]} ${styles["task-button-nav"]}`}
              onClick={() => onNavigate?.('next')}
              disabled={!hasNext}
              title={hasNext ? "Next task" : "No next task"}
            >
              <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6l4 5 4-5"/>
              </svg>
            </button>
          </div>

          {/* ── Delete / Add new — card ── */}
          <div className={styles["task-actions-card"]}>
            <button type="button" className={styles["task-button"]} onClick={handleDelete} title={isDeleting ? "Deleting…" : "Delete task"} disabled={isDeleting}>
              {isDeleting ? (
                <svg className={`${styles["icon-small"]} ${styles.spinning}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 15" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 5h10M6 5V3h4v2M4.5 5l.7 8h6.6l.7-8"/>
                </svg>
              )}
            </button>
            <button type="button" className={styles["task-button"]} onClick={handleNew} title={isCreating ? "Creating…" : "Add new task"} disabled={isCreating}>
              {isCreating ? (
                <svg className={`${styles["icon-small"]} ${styles.spinning}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 15" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 3v10M3 8h10"/>
                </svg>
              )}
            </button>
          </div>

          {/* ── Move order — card, between actions and Save ── */}
          {(onMoveFirst || onMoveUp || onMoveDown || onMoveLast) && (
            <div className={styles["task-reorder-card"]}>
              <button type="button" className={styles["task-button"]} onClick={onMoveFirst} disabled={!!isMoveFirst || !!isMoving} title="Move First">
                <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3h10M8 13V6M5 9l3-3 3 3"/>
                </svg>
              </button>
              <button type="button" className={styles["task-button"]} onClick={onMoveUp} disabled={!!isMoveFirst || !!isMoving} title="Move Up">
                <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10l4-5 4 5"/>
                </svg>
              </button>
              <button type="button" className={styles["task-button"]} onClick={onMoveDown} disabled={!!isMoveLast || !!isMoving} title="Move Down">
                <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 6l4 5 4-5"/>
                </svg>
              </button>
              <button type="button" className={styles["task-button"]} onClick={onMoveLast} disabled={!!isMoveLast || !!isMoving} title="Move Last">
                <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 13h10M8 3v7M5 7l3 3 3-3"/>
                </svg>
              </button>
            </div>
          )}

          <button
            type="button"
            className={`${styles["task-button"]} ${styles["task-button-save"]} ${hasSubprocessWorkspace ? styles["task-button-subprocess-ready"] : ""}`}
            onClick={handleToggleSubprocess}
            title={showSubprocess ? "Collapse subprocess workspace" : "Add subprocess"}
          >
            <span className={styles["task-button-label"]}>Add Subprocess</span>
          </button>

          </div>
        </div>
      <div className={styles["task-card-panels"]}>
        <div className={styles["task-details-shell"]}>
        <div className={styles["task-details-toolbar"]}>
          {bodyCollapsed ? (
            <>
              <div className={styles["task-details-summary"]}>
                <div className={styles["task-details-summary-top"]}>
                  <div className={styles["task-details-summary-heading"]}>
                    <div className={styles["task-details-summary-title"]}>Task Details</div>
                    <div className={styles["task-details-summary-subtitle"]}>Expand to edit task data and review its log.</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles["task-button"]} ${styles["task-button-collapse"]} ${styles["task-details-summary-toggle"]}`}
                    onClick={() => setBodyCollapsed(false)}
                    title="Expand task card details"
                    aria-label="Expand task card details"
                  >
                    <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6l5 5 5-5" />
                    </svg>
                  </button>
                </div>
                <div className={styles["task-details-summary-grid"]}>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-label"]}>WBS</div>
                  </div>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-label"]}>Gate / Task</div>
                  </div>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-label"]}>% Complete</div>
                  </div>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-label"]}>Calendar</div>
                  </div>
                </div>
                <div className={styles["task-details-summary-grid"]}>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-value"]}>{wbs || "N/A"}</div>
                  </div>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-value"]}>{`${gate || "N/A"} / ${taskTitle || "N/A"}`}</div>
                  </div>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-value"]}>{`${complete}%`}</div>
                  </div>
                  <div className={styles["task-details-summary-block"]}>
                    <div className={styles["task-details-summary-value"]}>{`(${start || "N/A"} - ${finish || "N/A"})`}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
          <>
          <div className={styles["task-details-inline-header"]}>
            <div className={styles["task-details-kicker"]}>Task Details</div>
            <div className={styles["task-details-subtitle"]}>Edit task data and review its log.</div>
          </div>
          <div className={styles["task-btn-group"]}>
          <div className={styles["task-view-card"]}>
            <button
              type="button"
              className={`${styles["task-button"]} ${columnFocus === 'right' ? styles["task-button-toggle-active"] : ""}`}
              onClick={() => setColumnFocus('right')}
              title="Expand right section"
              aria-label="Expand right section"
              disabled={bodyCollapsed}
            >
              <span className={styles["task-button-label"]}>&lt;</span>
            </button>
            <button
              type="button"
              className={`${styles["task-button"]} ${columnFocus === 'balanced' ? styles["task-button-toggle-active"] : ""}`}
              onClick={() => setColumnFocus('balanced')}
              title="Balanced view"
              aria-label="Balanced view"
              disabled={bodyCollapsed}
            >
              <span className={styles["task-button-label"]}>||</span>
            </button>
            <button
              type="button"
              className={`${styles["task-button"]} ${columnFocus === 'left' ? styles["task-button-toggle-active"] : ""}`}
              onClick={() => setColumnFocus('left')}
              title="Expand left section"
              aria-label="Expand left section"
              disabled={bodyCollapsed}
            >
              <span className={styles["task-button-label"]}>&gt;</span>
            </button>
          </div>
          {false && (
          <button
            type="button"
            className={`${styles["task-button"]} ${styles["task-button-collapse"]} ${bodyCollapsed ? styles["task-button-toggle-active"] : ""}`}
            onClick={() => setBodyCollapsed(prev => !prev)}
            title={bodyCollapsed ? "Expand task card details" : "Collapse task card details"}
            aria-label={bodyCollapsed ? "Expand task card details" : "Collapse task card details"}
          >
            <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {bodyCollapsed ? <path d="M3 10l5-5 5 5" /> : <path d="M3 6l5 5 5-5" />}
            </svg>
          </button>
          )}

          {/* ── Save / Close ── */}
          <button
            type="button"
            className={`${styles["task-button"]} ${styles["task-button-save"]}`}
            onClick={handleSaveClick}
            title="Save"
          >
            <span className={styles["task-button-label"]}>Save</span>
          </button>
          {onClose && (
            <button type="button" className={`${styles["task-button"]} ${styles["task-button-save"]} ${styles["task-button-close"]}`} onClick={onClose} title="Close">
              <span className={styles["task-button-label"]}>Close</span>
            </button>
          )}
          <button
            type="button"
            className={`${styles["task-button"]} ${styles["task-button-collapse"]}`}
            onClick={() => setBodyCollapsed(true)}
            title="Collapse task card details"
            aria-label="Collapse task card details"
          >
            <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10l5-5 5 5" />
            </svg>
          </button>
          </div>
          </>
          )}
        </div>
        {!bodyCollapsed && (
        <div className={styles["task-details-body"]}>
        <div
          className={[
            styles["task-card-row"],
            columnFocus === 'left' ? styles["task-card-row-left-focus"] : "",
            columnFocus === 'right' ? styles["task-card-row-right-focus"] : "",
          ].filter(Boolean).join(" ")}
        >
          <div className={styles["task-card-body"]}>
            <div className={styles["task-form"]}>

            {/* Row 1: Gate */}
            <div className={styles["form-row"]}>
              <label className={`${styles.field} ${styles["field-full"]}`}>
                <span>Gate</span>
                <input
                  type="text"
                  value={gate}
                  onChange={e => { setGate(e.target.value); setRenameAllGateTasks(true); }}
                  className={styles["input-small"]}
                  disabled={!gateEditEnabled}
                />
              </label>
              <label className={styles["gate-edit-toggle"]}>
                <input
                  type="checkbox"
                  checked={gateEditEnabled}
                  onChange={e => setGateEditEnabled(e.target.checked)}
                />
                <span className={styles["gate-edit-track"]}>
                  <span className={styles["gate-edit-thumb"]} />
                </span>
                <span className={styles["gate-edit-label"]}>Edit</span>
              </label>
            </div>

            {/* Gate rename checkbox — always visible when editing */}
            {gateEditEnabled && (
              <div className={styles["gate-rename-toggle"]}>
                <label className={styles["gate-rename-label"]}>
                  <input type="checkbox" checked={renameAllGateTasks} onChange={e => setRenameAllGateTasks(e.target.checked)} />
                  {renameAllGateTasks ? "Rename gate for all tasks in this gate" : "Move only this task to new gate"}
                </label>
              </div>
            )}
 
            {/* Row 2: Task + Release toggle */}
            <div className={styles["form-row"]}>
              <label className={`${styles.field} ${styles["field-full"]}`}>
                <span>Task</span>
                <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} className={styles["input-small"]} />
              </label>
              <label className={styles["gate-edit-toggle"]}>
                <input
                  type="checkbox"
                  checked={isRelease}
                  onChange={e => {
                    const checked = e.target.checked;
                    setIsRelease(checked);
                    if (checked && releaseUnits <= 0) {
                      setReleaseUnits(Math.max(0, remainingReleaseUnits ?? 0));
                    }
                  }}
                />
                <span className={styles["gate-edit-track"]}>
                  <span className={styles["gate-edit-thumb"]} />
                </span>
                <span className={styles["gate-edit-label"]}>Ship</span>
              </label>
            </div>

            {isRelease && (
              <div className={styles["form-row"]}>
                <label className={`${styles.field} ${styles["field-half"]}`}>
                  <span>Release Units</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={releaseUnits}
                    onChange={e => setReleaseUnits(Math.max(0, Number(e.target.value) || 0))}
                    className={`${styles["input-small"]} ${styles["release-units-input"]}`}
                  />
                </label>
              </div>
            )}

            {/* Row 3: Left=% Complete  |  Right=Duration+WBS */}
            <div className={styles["form-row"]}>
              {/* Left half: % Complete label + input */}
              <label className={`${styles.field} ${styles["field-half"]}`}>
                <span>% Complete</span>
                {isPlanner ? (
                  <select value={complete} onChange={e => setComplete(Number(e.target.value) || 0)} className={styles["select-complete"]} onClick={e => e.stopPropagation()}>
                    <option value={0}>0%</option>
                    <option value={50}>50%</option>
                    <option value={100}>100%</option>
                  </select>
                ) : (
                  <input type="number" min={0} max={100} value={complete} onChange={e => setComplete(Number(e.target.value) || 0)} className={styles["input-small"]} onClick={e => e.stopPropagation()} />
                )}
              </label>
              {/* Right half: Duration label + input + WBS label + input */}
              <div className={styles["field-right-group"]}>
                <span className={styles["field-group-label"]}>Duration</span>
                <input
                  type="number" min={0}
                  value={start && finish ? duration : ""}
                  onChange={e => handleDurationChange(Number(e.target.value) || 0)}
                  className={`${styles["input-fixed"]} ${styles["input-fixed-50"]}`}
                  disabled={!start}
                />
                <span className={styles["field-group-label"]}>WBS</span>
                <input
                  type="text"
                  value={wbs}
                  onChange={e => setWbs(e.target.value)}
                  className={styles["input-fixed"]}
                />
              </div>
            </div>

            {/* Row 4: Start · Finish */}
            <div className={styles["form-row"]}>
              <label className={styles.field}>
                <span>Start</span>
                <input
                  type="date" value={start}
                  onChange={e => {
                    const v = e.target.value;
                    if (v && finish) {
                      const [sy,sm,sd] = v.split("-").map(Number);
                      const [fy,fm,fd] = finish.split("-").map(Number);
                      if (Date.UTC(fy,fm-1,fd) < Date.UTC(sy,sm-1,sd)) { alert("Finish date cannot be earlier than Start date."); return; }
                    }
                    setStart(v);
                  }}
                  className={styles["input-small"]}
                />
              </label>
              <label className={styles.field}>
                <span>Finish</span>
                <input
                  type="date" value={finish}
                  onChange={e => {
                    const v = e.target.value;
                    if (start && v) {
                      const [sy,sm,sd] = start.split("-").map(Number);
                      const [fy,fm,fd] = v.split("-").map(Number);
                      if (Date.UTC(fy,fm-1,fd) < Date.UTC(sy,sm-1,sd)) { alert("Finish date cannot be earlier than Start date."); return; }
                    }
                    setFinish(v);
                  }}
                  className={styles["input-small"]}
                />
              </label>
            </div>

            {/* Completion warning */}
            {complete === 100 && !hasCompletionEvidence && (
              <div className={styles["completion-warning"]}>
                No file is marked as Evidence of Completion.
              </div>
            )}

            </div>
          </div>
          <div className={styles["task-card-column"]}>
          {/* Tab bar */}
          <div className={styles["tab-bar"]}>
            <button
              type="button"
              className={`${styles["tab-btn"]} ${activeTab === 'notes' ? styles["tab-active"] : ''}`}
              onClick={() => setActiveTab('notes')}
            >Notes</button>
            <button
              type="button"
              className={`${styles["tab-btn"]} ${activeTab === 'evidence' ? styles["tab-active"] : ''}`}
              onClick={() => setActiveTab('evidence')}
            >Evidence</button>
            <button
              type="button"
              className={`${styles["tab-btn"]} ${activeTab === 'approvals' ? styles["tab-active"] : ''}`}
              onClick={() => setActiveTab('approvals')}
            >Approvals</button>
          </div>

          {/* Tab content */}
          <div className={styles["tab-content"]}>
            {activeTab === 'notes' && (
              <NotesLog
                notes={notesLog}
                currentUserDisplayName={currentUserDisplayName ?? ''}
                onSave={async (entries: INoteEntry[]) => {
                  await saveNotesEntries(entries);
                }}
              />
            )}

            {activeTab === 'evidence' && (
              <EvidenceLog
                evidence={evidenceLog}
                taskTitle={taskTitle || task.Task || 'Task'}
                currentUserDisplayName={currentUserDisplayName ?? ''}
                onSave={async (entries: IEvidenceEntry[], uploadedEntry?: IEvidenceEntry) => {
                  await saveEvidenceEntries(entries, false);

                  if (uploadedEntry) {
                    const uploadNote = uploadedEntry.note
                      ? `File uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}. Note: ${uploadedEntry.note}`
                      : `File uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}`;
                    await saveNotesEntries([
                      ...notesLogRef.current,
                      { date: uploadedEntry.date, user: uploadedEntry.user, note: uploadNote },
                    ], false);
                  }

                  if (uploadedEntry?.isEvidenceOfCompletion) {
                    const nextEvidenceOfCompletion = {
                      Url: uploadedEntry.fileUrl,
                      Description: uploadedEntry.note || uploadedEntry.fileName,
                    };
                    setEvidenceOfCompletion(nextEvidenceOfCompletion);
                    skipNextCompleteEffectRef.current = true;
                    previousCompleteRef.current = 100;
                    setComplete(100);
                    handleSave({
                      complete: 100,
                      evidenceOfCompletion: nextEvidenceOfCompletion,
                    });
                    await appendAuditNote(`Evidence of completion uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}`);
                  } else {
                    handleSave();
                  }
                }}
                onToggleEvidenceOfCompletion={handleToggleEvidenceOfCompletion}
                onUploadFile={onUploadEvidenceFile}
              />
            )}

            {activeTab === 'approvals' && (
              <ApprovalsLog
                taskTitle={taskTitle || task.Task || 'Task'}
                approvals={task.Approvals ?? null}
                currentUserEmail={currentUserEmail ?? ''}
                currentUserDisplayName={currentUserDisplayName ?? ''}
                canManageApprovers={canManageApprovers}
                onSave={async (entries: IApprovalEntry[]) => {
                  await onSaveLogField?.(task.Id, 'Approvals', entries);
                  handleSave();
                }}
                onSendEmail={onSendEmail ?? (async () => undefined)}
                onAllApproved={onTaskCompleted}
                onSearchUsers={onSearchUsers}
                onSaveNote={appendAuditNote}
                buildApprovalEmail={buildApprovalEmail}
              />
            )}
          </div>
        </div>
        </div>
        </div>
        )}
      </div>
        {hasSubprocessWorkspace && (
          <SubprocessCard
            parentWbs={wbs}
            parentStart={start}
            parentFinish={finish}
            value={subprocess}
            onChange={(nextValue) => {
              setSubprocess(nextValue);
              setComplete(deriveTaskComplete(undefined, nextValue));
            }}
            onSaveSubprocess={handleSaveSubprocessOnly}
            onClose={handleToggleSubprocess}
            closeLabel={showSubprocess ? "Collapse" : "Expand"}
            isCollapsed={!showSubprocess}
            currentUserEmail={currentUserEmail}
            currentUserDisplayName={currentUserDisplayName}
            onUploadEvidenceFile={onUploadEvidenceFile}
            onSendEmail={onSendEmail}
            onSearchUsers={onSearchUsers}
            showTaskStepsToggle
            taskStepsToggleActive={showTaskSteps}
            taskStepsToggleHighlighted={hasTaskSteps}
            onToggleTaskSteps={handleToggleTaskSteps}
            taskStepsPanel={taskStepsPanel}
          />
        )}
      </div>
    </div>
  );
};

export default TaskCard;
