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
type TaskStepsMode = 'fixed' | 'weekday';

const TASK_STEP_WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

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
  ) => void | Promise<void>;
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
  mode: 'fixed',
  weekdays: [1],
  steps: [],
});

const createEmptySubprocess = (): ITaskSubprocessData => ({
  subTasks: [],
});


const asPositiveInteger = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.floor(value));
};

const DEFAULT_TASK_STEP_PIECES = 30;

const calculateFixedStepCount = (totalUnitsValue: number, unitsPerStepValue: number): number => {
  const totalUnits = asPositiveInteger(totalUnitsValue);
  const unitsPerStep = asPositiveInteger(unitsPerStepValue);
  if (totalUnits <= 0 || unitsPerStep <= 0) return 0;
  return Math.ceil(totalUnits / unitsPerStep);
};

const clampPercentValue = (value: number): number =>
  Math.max(0, Math.min(100, Math.floor(Number.isFinite(value) ? value : 0)));
const cloneSubprocessTemplateForStep = (
  template: ITaskSubprocessData,
  stepWbs: string
): ITaskSubprocessData => ({
  subTasks: template.subTasks.map((subTask, index) => ({
    ...subTask,
    id: `sp-step-${Date.now()}-${index + 1}`,
    wbs: `${stepWbs}.${String(index + 1).padStart(2, "0")}`,
    sortOrder: index,
    complete: 0,
    actualFinish: "",
    notes: [],
    evidence: [],
    approvals: [],
  })),
});

const hasSubprocessExecutionData = (value?: ITaskSubprocessData): boolean =>
  (value?.subTasks ?? []).some(subTask =>
    clampPercentValue(subTask.complete) > 0 ||
    !!subTask.actualFinish ||
    (subTask.notes?.length ?? 0) > 0 ||
    (subTask.evidence?.length ?? 0) > 0 ||
    (subTask.approvals?.length ?? 0) > 0
  );

const hasTaskStepExecutionData = (value: ITaskStepsData): boolean =>
  value.steps.some(step =>
    clampPercentValue(step.complete) > 0 ||
    !!step.actualFinish ||
    (step.notes?.length ?? 0) > 0 ||
    (step.evidence?.length ?? 0) > 0 ||
    (step.approvals?.length ?? 0) > 0 ||
    hasSubprocessExecutionData(step.subprocess)
  );

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

const getTaskStepWeekdayDates = (
  startValue: string,
  finishValue: string,
  weekdays: number[]
): string[] => {
  if (!startValue || !finishValue || weekdays.length <= 0) return [];

  const totalDays = daysBetween(startValue, finishValue);
  const selected = weekdays
    .map(value => Math.floor(value))
    .filter((value, index, array) => value >= 1 && value <= 6 && array.indexOf(value) === index);

  if (selected.length <= 0) return [];

  return Array.from({ length: totalDays + 1 }, (_, offset) => addDaysToDateString(startValue, offset))
    .filter((dateValue) => {
      const date = new Date(`${dateValue}T00:00:00Z`);
      const day = date.getUTCDay();
      return day >= 1 && day <= 6 && selected.includes(day);
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
  const initialSubprocess = rawInitialSubprocess;
  const [showSubprocess, setShowSubprocess] = useState(initialHasSubprocessWorkspace);
  const [subprocess, setSubprocess] = useState<ITaskSubprocessData>(initialSubprocess);
  const [showTaskSteps, setShowTaskSteps] = useState(initialTaskSteps.enabled || initialTaskSteps.steps.length > 0);
  const [isTaskStepsSectionExpanded, setIsTaskStepsSectionExpanded] = useState(initialTaskSteps.enabled || initialTaskSteps.steps.length > 0);
  const [isTaskStepsConfigExpanded, setIsTaskStepsConfigExpanded] = useState(!initialTaskSteps.enabled || initialTaskSteps.steps.length <= 0);
  const [taskSteps, setTaskSteps] = useState<ITaskStepsData>(initialTaskSteps);
  const initialTaskStepsPieces = initialTaskSteps.unitsPerStep > 0 ? initialTaskSteps.unitsPerStep : DEFAULT_TASK_STEP_PIECES;
  const initialTaskStepsLots = initialTaskSteps.stepCount > 0
    ? initialTaskSteps.stepCount
    : calculateFixedStepCount(projectUnits ?? 0, initialTaskStepsPieces);
  const [taskStepsPieces, setTaskStepsPieces] = useState<number>(initialTaskStepsPieces);
  const [taskStepsLots, setTaskStepsLots] = useState<number>(initialTaskStepsLots);
  const [taskStepsMode, setTaskStepsMode] = useState<TaskStepsMode>(initialTaskSteps.mode === 'weekday' ? 'weekday' : 'fixed');
  const [taskStepsWeekdays, setTaskStepsWeekdays] = useState<number[]>(initialTaskSteps.weekdays && initialTaskSteps.weekdays.length > 0 ? initialTaskSteps.weekdays : [1]);
  const [taskStepsSource, setTaskStepsSource] = useState<TaskStepsSource>(
    initialTaskSteps.stepCount > 0 && initialTaskSteps.unitsPerStep <= 0 ? "lots" : "pieces"
  );
  const [isTaskStepsProcessing, setIsTaskStepsProcessing] = useState(false);
  const [selectedTaskStepId, setSelectedTaskStepId] = useState<string | undefined>(initialTaskSteps.steps[0]?.id);
  const [isTaskStepWorkspaceExpanded, setIsTaskStepWorkspaceExpanded] = useState(initialTaskSteps.steps.length > 0);
  const [isTaskStepDetailsExpanded, setIsTaskStepDetailsExpanded] = useState(false);
  const [isTaskStepSubprocessExpanded, setIsTaskStepSubprocessExpanded] = useState(true);
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
        mode: 'fixed',
        weekdays: taskStepsWeekdays,
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
          mode: 'fixed',
          weekdays: taskStepsWeekdays,
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
          mode: 'fixed',
          weekdays: taskStepsWeekdays,
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
      const stepWbs = `${baseWbs}.${String(index + 1).padStart(2, "0")}`;
      const templateSubprocess = subprocess.subTasks.length > 0
        ? cloneSubprocessTemplateForStep(subprocess, stepWbs)
        : createEmptySubprocess();

      return {
        id: `step-${index + 1}`,
        wbs: stepWbs,
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
        subprocess: templateSubprocess,
      };
    });

    return {
      enabled,
      totalUnits,
      unitsPerStep,
      stepCount,
      mode: 'fixed',
      weekdays: taskStepsWeekdays,
      steps,
    };
  };

  const buildTaskStepsDataFromWeekdays = (weekdays: number[], enabled = true): ITaskStepsData => {
    const totalUnits = asPositiveInteger(projectUnits ?? 0);
    const normalizedWeekdays = weekdays
      .map(value => Math.floor(value))
      .filter((value, index, array) => value >= 1 && value <= 6 && array.indexOf(value) === index)
      .sort((a, b) => a - b);

    if (totalUnits <= 0 || normalizedWeekdays.length <= 0) {
      return {
        enabled,
        totalUnits,
        unitsPerStep: 0,
        stepCount: 0,
        mode: 'weekday',
        weekdays: normalizedWeekdays.length > 0 ? normalizedWeekdays : [1],
        steps: [],
      };
    }

    const scheduledDates = getTaskStepWeekdayDates(start, finish, normalizedWeekdays);
    const stepCount = scheduledDates.length;
    if (stepCount <= 0) {
      return {
        enabled,
        totalUnits,
        unitsPerStep: 0,
        stepCount: 0,
        mode: 'weekday',
        weekdays: normalizedWeekdays,
        steps: [],
      };
    }

    const unitsPerStep = Math.max(1, Math.floor(totalUnits / stepCount));
    const baseWbs = wbs || task.Title || "1";
    const baseTitle = taskTitle || task.Task || "Task";
    const previousSteps = taskSteps.steps;
    let remainingUnits = totalUnits;

    const steps = scheduledDates.map((dateValue, index) => {
      const previousStep = previousSteps[index];
      const units = index === stepCount - 1 ? remainingUnits : Math.min(unitsPerStep, remainingUnits);
      remainingUnits -= units;
      const stepWbs = `${baseWbs}.${String(index + 1).padStart(2, "0")}`;
      const templateSubprocess = subprocess.subTasks.length > 0
        ? cloneSubprocessTemplateForStep(subprocess, stepWbs)
        : createEmptySubprocess();

      return {
        id: `step-${index + 1}`,
        wbs: stepWbs,
        sortOrder: index,
        title: `${baseTitle} - Package ${index + 1}`,
        units,
        complete: previousStep?.complete ?? 0,
        start: dateValue,
        finish: dateValue,
        actualFinish: previousStep?.actualFinish ?? "",
        notes: previousStep?.notes ?? [],
        evidence: previousStep?.evidence ?? [],
        approvals: previousStep?.approvals ?? [],
        subprocess: templateSubprocess,
      };
    });

    return {
      enabled,
      totalUnits,
      unitsPerStep,
      stepCount,
      mode: 'weekday',
      weekdays: normalizedWeekdays,
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
    setTaskStepsMode("fixed");
    setTaskStepsSource("pieces");
    setTaskStepsPieces(normalizedPieces || DEFAULT_TASK_STEP_PIECES);
    setTaskStepsLots(nextTaskSteps.stepCount);
    setTaskSteps(nextTaskSteps);
    setComplete(deriveTaskComplete(nextTaskSteps, undefined));
  };

  const applyTaskStepsFromLots = (lotsValue: number, enabled = true): void => {
    const normalizedLots = asPositiveInteger(lotsValue);
    const nextTaskSteps = normalizeTaskStepsAggregation(buildTaskStepsData("lots", normalizedLots, enabled));
    setTaskStepsMode("fixed");
    setTaskStepsSource("lots");
    setTaskStepsLots(normalizedLots);
    setTaskStepsPieces(nextTaskSteps.unitsPerStep);
    setTaskSteps(nextTaskSteps);
    setComplete(deriveTaskComplete(nextTaskSteps, undefined));
  };

  const applyTaskStepsFromWeekdays = (weekdays: number[], enabled = true): void => {
    const normalizedWeekdays = weekdays
      .map(value => Math.floor(value))
      .filter((value, index, array) => value >= 1 && value <= 6 && array.indexOf(value) === index)
      .sort((a, b) => a - b);
    const nextWeekdays = normalizedWeekdays.length > 0 ? normalizedWeekdays : [1];
    const nextTaskSteps = normalizeTaskStepsAggregation(buildTaskStepsDataFromWeekdays(nextWeekdays, enabled));
    setTaskStepsMode("weekday");
    setTaskStepsWeekdays(nextWeekdays);
    setTaskStepsSource("lots");
    setTaskStepsLots(nextTaskSteps.stepCount);
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
    setIsTaskStepsSectionExpanded(nextTaskSteps.enabled || nextTaskSteps.steps.length > 0);
    setIsTaskStepsConfigExpanded(!nextTaskSteps.enabled || nextTaskSteps.steps.length <= 0);
    setTaskSteps(nextTaskSteps);
    const nextTaskStepsPieces = nextTaskSteps.unitsPerStep > 0 ? nextTaskSteps.unitsPerStep : DEFAULT_TASK_STEP_PIECES;
    const nextTaskStepsLots = nextTaskSteps.stepCount > 0
      ? nextTaskSteps.stepCount
      : calculateFixedStepCount(projectUnits ?? 0, nextTaskStepsPieces);
    setTaskStepsPieces(nextTaskStepsPieces);
    setTaskStepsLots(nextTaskStepsLots);
    setTaskStepsMode(nextTaskSteps.mode === "weekday" ? "weekday" : "fixed");
    setTaskStepsWeekdays(nextTaskSteps.weekdays && nextTaskSteps.weekdays.length > 0 ? nextTaskSteps.weekdays : [1]);
    setTaskStepsSource(nextTaskSteps.stepCount > 0 && nextTaskSteps.unitsPerStep <= 0 ? "lots" : "pieces");
    setSelectedTaskStepId(nextTaskSteps.steps[0]?.id);
    setIsTaskStepWorkspaceExpanded(nextTaskSteps.steps.length > 0);
    setIsTaskStepDetailsExpanded(false);
    setIsTaskStepSubprocessExpanded(true);
    setIsTaskStepsProcessing(false);
    skipNextTaskStepsRecalcRef.current = true;
    setColumnFocus('balanced');
    setBodyCollapsed(nextHasSubprocessWorkspace);
    previousCompleteRef.current = task.Complete ?? 0;
  }, [projectUnits, task]);

  useEffect(() => {
    if (skipNextTaskStepsRecalcRef.current) {
      skipNextTaskStepsRecalcRef.current = false;
      return;
    }

    if (!taskSteps.enabled) return;
    if (hasTaskStepExecutionData(taskSteps)) return;

    if (taskStepsMode === "weekday") {
      setTaskSteps(buildTaskStepsDataFromWeekdays(taskStepsWeekdays, true));
      return;
    }

    if (taskStepsSource === "lots" && taskStepsLots > 0) {
      setTaskSteps(buildTaskStepsData("lots", taskStepsLots, true));
      return;
    }

    if (taskStepsPieces > 0) {
      setTaskSteps(buildTaskStepsData("pieces", taskStepsPieces, true));
    }
  }, [projectUnits, start, finish, wbs, taskTitle, taskStepsMode, taskStepsWeekdays, taskStepsLots, taskStepsPieces]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (taskSteps.enabled) return;

    if (taskStepsMode === "weekday") {
      setTaskStepsLots(getTaskStepWeekdayDates(start, finish, taskStepsWeekdays).length);
      return;
    }

    setTaskStepsLots(calculateFixedStepCount(projectUnits ?? 0, taskStepsPieces));
  }, [projectUnits, start, finish, taskSteps.enabled, taskStepsMode, taskStepsPieces, taskStepsWeekdays]);

  useEffect(() => {
    if (!taskSteps.steps.length) {
      setSelectedTaskStepId(undefined);
      setIsTaskStepWorkspaceExpanded(false);
      setIsTaskStepDetailsExpanded(false);
      setIsTaskStepSubprocessExpanded(true);
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
    setIsTaskStepWorkspaceExpanded(true);
    setIsTaskStepDetailsExpanded(false);
    setIsTaskStepSubprocessExpanded(true);
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
    const derivedSubprocess = subprocess;
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
    const hasSubprocessData = subprocess.subTasks.length > 0;
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
    void onSave(task.Id, JSON.stringify(data));
  };

  const handleSaveSubprocessOnly = async (nextSubprocess: ITaskSubprocessData): Promise<void> => {
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
    await Promise.resolve(onSave(task.Id, JSON.stringify(data)));
  };

  const handleSaveTaskStepsOnly = async (nextTaskSteps: ITaskStepsData): Promise<void> => {
    const normalizedTaskSteps = normalizeTaskStepsAggregation(nextTaskSteps);
    const hasTaskStepsData = normalizedTaskSteps.enabled && normalizedTaskSteps.steps.length > 0;
    const aggregatedComplete = hasTaskStepsData ? aggregateTaskStepsComplete(normalizedTaskSteps) : 0;
    const jsonTable = buildTaskJsonTable(task.jsonTable, {
      sortOrder: getTaskSortOrder(task.jsonTable),
      isRelease: task.isRelease || undefined,
      releaseUnits: task.isRelease ? task.releaseUnits : undefined,
      subprocess: subprocess.subTasks.length > 0 ? subprocess : undefined,
      clearSubprocess: subprocess.subTasks.length <= 0,
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
    await Promise.resolve(onSave(task.Id, JSON.stringify(data)));
  };

  const handleSaveTaskStepSubprocessOnly = async (stepId: string, nextSubprocess: ITaskSubprocessData): Promise<void> => {
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
    await handleSaveTaskStepsOnly(normalizedTaskSteps);
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
    void handleSaveTaskStepsOnly(normalizedTaskSteps);
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
        setIsTaskStepsSectionExpanded(true);
        setIsTaskStepsConfigExpanded(true);
        setBodyCollapsed(false);
      }
      return next;
    });
  };

  const handleRegenerateTaskSteps = (source: TaskStepsSource, rawValue: number, enabled = true): void => {
    if (taskSteps.steps.length > 0 && hasTaskStepExecutionData(taskSteps)) {
      const confirmed = window.confirm(
        "Regenerating Step Tasks will replace the current step structure and reset step progress. Continue?"
      );
      if (!confirmed) {
        return;
      }
    }

    if (source === "lots") {
      applyTaskStepsFromLots(rawValue, enabled);
      return;
    }

    applyTaskStepsFromPieces(rawValue, enabled);
  };

  const handleTaskStepsModeChange = (nextMode: TaskStepsMode): void => {
    setTaskStepsMode(nextMode);

    if (nextMode === "weekday") {
      const nextWeekdays = taskStepsWeekdays.length > 0 ? taskStepsWeekdays : [1];
      applyTaskStepsFromWeekdays(nextWeekdays, taskSteps.enabled);
      return;
    }

    if (taskStepsSource === "lots" && taskStepsLots > 0) {
      applyTaskStepsFromLots(taskStepsLots, taskSteps.enabled);
      return;
    }

    applyTaskStepsFromPieces(taskStepsPieces > 0 ? taskStepsPieces : DEFAULT_TASK_STEP_PIECES, taskSteps.enabled);
  };

  const handleToggleTaskStepWeekday = (weekday: number): void => {
    const nextWeekdays = taskStepsWeekdays.includes(weekday)
      ? taskStepsWeekdays.filter(value => value !== weekday)
      : [...taskStepsWeekdays, weekday].sort((a, b) => a - b);

    if (nextWeekdays.length <= 0) {
      return;
    }

    applyTaskStepsFromWeekdays(nextWeekdays, taskSteps.enabled);
  };

  const handleCreateTaskStepsClick = (): void => {
    if (isTaskStepsProcessing) return;

    setIsTaskStepsProcessing(true);
    window.setTimeout(() => {
      if (taskStepsMode === "weekday") {
        applyTaskStepsFromWeekdays(taskStepsWeekdays, true);
      } else if (taskStepsSource === "lots" && taskStepsLots > 0) {
        handleRegenerateTaskSteps("lots", taskStepsLots, true);
      } else {
        handleRegenerateTaskSteps("pieces", taskStepsPieces > 0 ? taskStepsPieces : DEFAULT_TASK_STEP_PIECES, true);
      }

      setIsTaskStepsSectionExpanded(true);
      setIsTaskStepsConfigExpanded(false);
      window.setTimeout(() => setIsTaskStepsProcessing(false), 150);
    }, 0);
  };

  const selectedTaskStep = selectedTaskStepId
    ? taskSteps.steps.find(step => step.id === selectedTaskStepId)
    : undefined;
  const taskStepsGeneratedCount = taskSteps.steps.length;
  const taskStepsCompletedCount = taskSteps.steps.filter(step => clampPercentValue(step.complete) >= 100).length;
  const taskStepsSummaryComplete = taskStepsGeneratedCount > 0
    ? aggregateWeightedComplete(taskSteps.steps.map(step => ({ complete: step.complete, weight: step.units })))
    : 0;
  const taskStepsStartDates = taskSteps.steps.map(step => step.start).filter(Boolean).sort();
  const taskStepsFinishDates = taskSteps.steps.map(step => step.finish).filter(Boolean).sort();
  const taskStepsSummaryStart = taskStepsStartDates[0] || start || "N/A";
  const taskStepsSummaryFinish = taskStepsFinishDates[taskStepsFinishDates.length - 1] || finish || "N/A";
  const taskStepsConfigSummary = taskStepsMode === "weekday"
    ? `${taskStepsLots || 0} packages by weekday`
    : `${taskStepsPieces || DEFAULT_TASK_STEP_PIECES} pieces / ${taskStepsLots || 0} lots`;
  const taskStepsPanel = !showTaskSteps ? null : (
    <div className={styles.taskStepsCard}>
      <div className={styles.taskStepsHeader}>
        <strong>Step Tasks</strong>
        <div className={styles.taskStepsHeaderActions}>
          <button
            type="button"
            className={`${styles.taskButton} ${styles.taskButtonCollapse}`}
            onClick={() => setIsTaskStepsSectionExpanded(prev => !prev)}
            title={isTaskStepsSectionExpanded ? "Collapse Step Tasks" : "Expand Step Tasks"}
            aria-label={isTaskStepsSectionExpanded ? "Collapse Step Tasks" : "Expand Step Tasks"}
          >
            <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isTaskStepsSectionExpanded ? <path d="M3 10l5-5 5 5" /> : <path d="M3 6l5 5 5-5" />}
            </svg>
          </button>
        </div>
      </div>

      {!isTaskStepsSectionExpanded && (
        <div className={styles.taskStepsCollapsedSummary}>
          <div className={styles.taskStepsSummaryGrid}>
            <div className={styles.taskStepsSummaryBlock}>
              <div className={styles.taskStepsSummaryLabel}>Packages</div>
              <div className={styles.taskStepsSummaryValue}>{taskStepsGeneratedCount || taskStepsLots || 0}</div>
            </div>
            <div className={styles.taskStepsSummaryBlock}>
              <div className={styles.taskStepsSummaryLabel}>Units</div>
              <div className={styles.taskStepsSummaryValue}>{totalProjectUnits || taskSteps.totalUnits || 0}</div>
            </div>
            <div className={styles.taskStepsSummaryBlock}>
              <div className={styles.taskStepsSummaryLabel}>Complete</div>
              <div className={styles.taskStepsSummaryValue}>{`${taskStepsSummaryComplete}%`}</div>
            </div>
            <div className={styles.taskStepsSummaryBlock}>
              <div className={styles.taskStepsSummaryLabel}>Status</div>
              <div className={styles.taskStepsSummaryValue}>{`${taskStepsCompletedCount} done / ${Math.max(0, taskStepsGeneratedCount - taskStepsCompletedCount)} open`}</div>
            </div>
            <div className={styles.taskStepsSummaryBlock}>
              <div className={styles.taskStepsSummaryLabel}>Calendar</div>
              <div className={styles.taskStepsSummaryValue}>{`${taskStepsSummaryStart} - ${taskStepsSummaryFinish}`}</div>
            </div>
          </div>
        </div>
      )}

      {isTaskStepsSectionExpanded && (
      <div className={styles.taskStepsSectionBody}>
        <div className={styles.taskStepsConfigCard}>
          <div className={styles.taskStepsConfigHeader}>
            <div className={styles.taskStepsConfigTitleGroup}>
              <strong>Lot Configuration</strong>
              {!isTaskStepsConfigExpanded && (
                <span className={styles.taskStepsConfigSummary}>{taskStepsConfigSummary}</span>
              )}
            </div>
            <div className={styles.taskStepsConfigActions}>
              <button
                type="button"
                className={`${styles.taskButton} ${styles.taskButtonSave}`}
                onClick={handleCreateTaskStepsClick}
                disabled={totalProjectUnits <= 0 || isTaskStepsProcessing}
                title={taskSteps.enabled && taskSteps.steps.length > 0 ? "Recreate Step Tasks" : "Create Step Tasks"}
              >
                <span className={styles.taskButtonLabel}>
                  {isTaskStepsProcessing ? "Processing..." : taskSteps.enabled && taskSteps.steps.length > 0 ? "Recreate Lots" : "Create Lots"}
                </span>
              </button>
              {taskSteps.enabled && taskSteps.steps.length > 0 && (
                <button
                  type="button"
                  className={`${styles.taskButton} ${styles.taskButtonSave}`}
                  onClick={() => {
                    setTaskSteps(createEmptyTaskSteps());
                    setTaskStepsMode('fixed');
                    setTaskStepsWeekdays([1]);
                    setTaskStepsPieces(DEFAULT_TASK_STEP_PIECES);
                    setTaskStepsLots(calculateFixedStepCount(projectUnits ?? 0, DEFAULT_TASK_STEP_PIECES));
                    setSelectedTaskStepId(undefined);
                    setIsTaskStepWorkspaceExpanded(false);
                    setIsTaskStepDetailsExpanded(false);
                    setIsTaskStepSubprocessExpanded(true);
                    setIsTaskStepsConfigExpanded(true);
                  }}
                >
                  <span className={styles.taskButtonLabel}>Reset</span>
                </button>
              )}
              <button
                type="button"
                className={`${styles.taskButton} ${styles.taskButtonCollapse}`}
                onClick={() => setIsTaskStepsConfigExpanded(prev => !prev)}
                title={isTaskStepsConfigExpanded ? "Collapse Lot Configuration" : "Expand Lot Configuration"}
                aria-label={isTaskStepsConfigExpanded ? "Collapse Lot Configuration" : "Expand Lot Configuration"}
              >
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {isTaskStepsConfigExpanded ? <path d="M3 10l5-5 5 5" /> : <path d="M3 6l5 5 5-5" />}
                </svg>
              </button>
            </div>
          </div>
          {isTaskStepsConfigExpanded && (
            <>
              <div className={styles.taskStepsConfigRow}>
                <label className={styles.taskStepsField}>
                  <span>Generation Mode</span>
                  <select
                    className={styles.inputSmall}
                    value={taskStepsMode}
                    onChange={e => handleTaskStepsModeChange(e.target.value === "weekday" ? "weekday" : "fixed")}
                  >
                    <option value="fixed">Fixed packages</option>
                    <option value="weekday">Packages by weekday</option>
                  </select>
                </label>
                <label className={styles.taskStepsField}>
                  <span>Total Units</span>
                  <input type="number" value={totalProjectUnits || ""} className={styles.inputSmall} disabled />
                </label>
                {taskStepsMode === "fixed" ? (
                  <>
                    <label className={styles.taskStepsField}>
                      <span># Pieces</span>
                      <input
                        type="number"
                        min={1}
                        value={taskStepsPieces || ""}
                        className={styles.inputSmall}
                        onChange={e => handleRegenerateTaskSteps("pieces", Number(e.target.value) || 0, taskSteps.enabled)}
                      />
                    </label>
                    <label className={styles.taskStepsField}>
                      <span># Lots</span>
                      <input
                        type="number"
                        min={1}
                        value={taskStepsLots || ""}
                        className={styles.inputSmall}
                        onChange={e => handleRegenerateTaskSteps("lots", Number(e.target.value) || 0, taskSteps.enabled)}
                      />
                    </label>
                  </>
                ) : (
                  <label className={styles.taskStepsField}>
                    <span># Packages</span>
                    <input type="number" value={taskStepsLots || ""} className={styles.inputSmall} disabled />
                  </label>
                )}

                {taskStepsMode === "weekday" && (
                  <div className={styles.taskStepsWeekdayRow}>
                    {TASK_STEP_WEEKDAY_OPTIONS.map(option => (
                      <label key={option.value} className={styles.taskStepsWeekdayOption}>
                        <input
                          type="checkbox"
                          checked={taskStepsWeekdays.includes(option.value)}
                          onChange={() => handleToggleTaskStepWeekday(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {totalProjectUnits <= 0 && (
                <div className={styles.taskStepsHint}>
                  Step Tasks need project Units defined in ED2-Projects.
                </div>
              )}
            </>
          )}
        </div>
        {taskSteps.enabled && taskSteps.steps.length > 0 && (
          <>
            <div className={styles.taskStepsSummary}>
              <span>{taskSteps.steps.length} steps generated</span>
            </div>

          <div className={styles.taskStepsPreview}>
            {taskSteps.steps.map(step => {
              const isSelectedStep = step.id === selectedTaskStepId;

              return (
                <div key={step.id} className={styles.taskStepItem}>
                  <div className={styles.taskStepHeaderLine}>
                    <button
                      type="button"
                      className={[
                        styles.taskStepRow,
                        isSelectedStep ? styles.taskStepRowActive : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => {
                        if (isSelectedStep) {
                          setIsTaskStepWorkspaceExpanded(prev => !prev);
                          return;
                        }

                        setSelectedTaskStepId(step.id);
                        setIsTaskStepWorkspaceExpanded(true);
                        setIsTaskStepDetailsExpanded(false);
                        setIsTaskStepSubprocessExpanded(true);
                      }}
                      title={isSelectedStep && isTaskStepWorkspaceExpanded ? "Collapse step task" : "Expand step task"}
                    >
                      <div className={styles.taskStepHeaderContent}>
                        <div className={styles.taskStepMain}>
                          <span className={styles.taskStepWbs}>{step.wbs}</span>
                          <span className={styles.taskStepTitle}>{step.title}</span>
                        </div>
                      </div>
                      <div className={styles.taskStepMeta}>
                        <span>{step.units} units</span>
                        <span>{step.subprocess?.subTasks?.length ?? 0} subprocess</span>
                        <span>{step.start || "-"} to {step.finish || "-"}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={[
                        styles.taskStepHeaderToggle,
                        isSelectedStep && isTaskStepDetailsExpanded ? styles.taskStepHeaderToggleActive : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => {
                        if (!isSelectedStep) {
                          setSelectedTaskStepId(step.id);
                          setIsTaskStepWorkspaceExpanded(true);
                          setIsTaskStepDetailsExpanded(true);
                          setIsTaskStepSubprocessExpanded(true);
                          return;
                        }

                        setIsTaskStepWorkspaceExpanded(true);
                        setIsTaskStepDetailsExpanded(prev => !prev);
                      }}
                      title={isSelectedStep && isTaskStepDetailsExpanded ? "Collapse step details" : "Expand step details"}
                      aria-label={isSelectedStep && isTaskStepDetailsExpanded ? "Collapse step details" : "Expand step details"}
                    >
                      {isSelectedStep && (
                        <span className={styles.taskStepHeaderChevron}>{isTaskStepDetailsExpanded ? "v" : ">"}</span>
                      )}
                      {!isSelectedStep && (
                        <span className={styles.taskStepHeaderChevron}>{">"}</span>
                      )}
                    </button>
                  </div>

                  {isSelectedStep && selectedTaskStep && isTaskStepWorkspaceExpanded && (
                    <div className={styles.taskStepWorkspace}>
                      <div className={styles.taskStepDetail}>
                        {isTaskStepDetailsExpanded && (
                          <div className={styles.taskStepEditor}>
                            <label className={styles.taskStepEditorField}>
                              <span>Task</span>
                              <input
                                type="text"
                                value={taskStepTitleEdit}
                                className={styles.inputSmall}
                                onChange={e => setTaskStepTitleEdit(e.target.value)}
                              />
                            </label>
                            <label className={styles.taskStepEditorField}>
                              <span>Units</span>
                              <input
                                type="number"
                                min={1}
                                value={taskStepUnitsEdit}
                                className={styles.inputSmall}
                                onChange={e => setTaskStepUnitsEdit(Math.max(1, Number(e.target.value) || 0))}
                              />
                            </label>
                            <label className={styles.taskStepEditorField}>
                              <span>% Complete</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={taskStepCompleteEdit}
                                className={styles.inputSmall}
                                onChange={e => setTaskStepCompleteEdit(Number(e.target.value) || 0)}
                              />
                            </label>
                            <label className={styles.taskStepEditorField}>
                              <span>Start</span>
                              <input
                                type="date"
                                value={taskStepStartEdit}
                                className={styles.inputSmall}
                                onChange={e => setTaskStepStartEdit(e.target.value)}
                              />
                            </label>
                            <label className={styles.taskStepEditorField}>
                              <span>Delivery Date</span>
                              <input
                                type="date"
                                value={taskStepFinishEdit}
                                className={styles.inputSmall}
                                onChange={e => setTaskStepFinishEdit(e.target.value)}
                              />
                            </label>
                            <label className={styles.taskStepEditorField}>
                              <span>Actual Finish</span>
                              <input
                                type="date"
                                value={taskStepActualFinishEdit}
                                className={styles.inputSmall}
                                onChange={e => setTaskStepActualFinishEdit(e.target.value)}
                                disabled={taskStepCompleteEdit < 100}
                              />
                            </label>
                            <div className={styles.taskStepEditorActions}>
                              <button
                                type="button"
                                className={`${styles.taskButton} ${styles.taskButtonSave}`}
                                onClick={handleSaveSelectedTaskStep}
                              >
                                <span className={styles.taskButtonLabel}>Save Step</span>
                              </button>
                            </div>
                          </div>
                        )}

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
                          currentUserEmail={currentUserEmail}
                          currentUserDisplayName={currentUserDisplayName}
                          onUploadEvidenceFile={onUploadEvidenceFile}
                          onSendEmail={onSendEmail}
                          onSearchUsers={onSearchUsers}
                          visualLevel="taskStep"
                          isCollapsed={!isTaskStepSubprocessExpanded}
                          onClose={() => setIsTaskStepSubprocessExpanded(prev => !prev)}
                        />
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
      )}
    </div>
  );

  return (
    <div className={styles.taskCard}>
        <div className={styles.taskCardHeader}>
          <div className={styles.taskDetailsTitleGroup}>
            <h1 className={styles.taskTitle}>{taskTitle || task.Task}</h1>
          </div>
          <div className={styles.taskBtnGroup}>
          {!hasSubprocessWorkspace && (
            <button
              type="button"
              className={`${styles.taskButton} ${styles.taskButtonSave}`}
              onClick={handleToggleSubprocess}
              title="Add subprocess"
            >
              <span className={styles.taskButtonLabel}>Add Subprocess</span>
            </button>
          )}

          {/* Completion warning */}
          <div className={styles.taskNavCard}>
            <button
              type="button"
              className={`${styles.taskButton} ${styles.taskButtonNav}`}
              onClick={() => onNavigate?.('prev')}
              disabled={!hasPrev}
              title={hasPrev ? "Previous task" : "No previous task"}
            >
              <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10l4-5 4 5"/>
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.taskButton} ${styles.taskButtonNav}`}
              onClick={() => onNavigate?.('next')}
              disabled={!hasNext}
              title={hasNext ? "Next task" : "No next task"}
            >
              <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6l4 5 4-5"/>
              </svg>
            </button>
          </div>

          {/* Completion warning */}
          <div className={styles.taskActionsCard}>
            <button type="button" className={styles.taskButton} onClick={handleDelete} title={isDeleting ? "Deleting..." : "Delete task"} disabled={isDeleting}>
              {isDeleting ? (
                <svg className={`${styles.iconSmall} ${styles.spinning}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 15" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 5h10M6 5V3h4v2M4.5 5l.7 8h6.6l.7-8"/>
                </svg>
              )}
            </button>
            <button type="button" className={styles.taskButton} onClick={handleNew} title={isCreating ? "Creating..." : "New task"} disabled={isCreating}>
              {isCreating ? (
                <svg className={`${styles.iconSmall} ${styles.spinning}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 15" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M8 3v10M3 8h10"/>
                </svg>
              )}
            </button>
          </div>

          {/* Completion warning */}
          {(onMoveFirst || onMoveUp || onMoveDown || onMoveLast) && (
            <div className={styles.taskReorderCard}>
              <button type="button" className={styles.taskButton} onClick={onMoveFirst} disabled={!!isMoveFirst || !!isMoving} title="Move First">
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3h10M8 13V6M5 9l3-3 3 3"/>
                </svg>
              </button>
              <button type="button" className={styles.taskButton} onClick={onMoveUp} disabled={!!isMoveFirst || !!isMoving} title="Move Up">
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10l4-5 4 5"/>
                </svg>
              </button>
              <button type="button" className={styles.taskButton} onClick={onMoveDown} disabled={!!isMoveLast || !!isMoving} title="Move Down">
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 6l4 5 4-5"/>
                </svg>
              </button>
              <button type="button" className={styles.taskButton} onClick={onMoveLast} disabled={!!isMoveLast || !!isMoving} title="Move Last">
                <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 13h10M8 3v7M5 7l3 3 3-3"/>
                </svg>
              </button>
            </div>
          )}

          {onClose && (
            <button
              type="button"
              className={`${styles.taskButton} ${styles.taskButtonClose}`}
              onClick={onClose}
              title="Close"
              aria-label="Close task card"
              style={{ marginLeft: 4 }}
            >
              <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4 4 12" />
              </svg>
            </button>
          )}

          </div>
        </div>
      <div className={styles.taskCardPanels}>
        <div className={styles.taskDetailsShell}>
        <div className={styles.taskDetailsToolbar}>
          {bodyCollapsed ? (
            <>
              <div className={styles.taskDetailsSummary}>
                <div className={styles.taskDetailsSummaryTop}>
                  <div className={styles.taskDetailsSummaryHeading}>
                    <div className={styles.taskDetailsSummaryTitle}>Task Details</div>
                    <div className={styles.taskDetailsSummarySubtitle}>Expand to edit task data and review its log.</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.taskButton} ${styles.taskButtonCollapse} ${styles.taskDetailsSummaryToggle}`}
                    onClick={() => setBodyCollapsed(false)}
                    title="Expand task card details"
                    aria-label="Expand task card details"
                  >
                    <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6l5 5 5-5" />
                    </svg>
                  </button>
                </div>
                <div className={styles.taskDetailsSummaryGrid}>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryLabel}>WBS</div>
                  </div>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryLabel}>Gate / Task</div>
                  </div>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryLabel}>% Complete</div>
                  </div>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryLabel}>Calendar</div>
                  </div>
                </div>
                <div className={styles.taskDetailsSummaryGrid}>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryValue}>{wbs || "N/A"}</div>
                  </div>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryValue}>{`${gate || "N/A"} / ${taskTitle || "N/A"}`}</div>
                  </div>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryValue}>{`${complete}%`}</div>
                  </div>
                  <div className={styles.taskDetailsSummaryBlock}>
                    <div className={styles.taskDetailsSummaryValue}>{`(${start || "N/A"} - ${finish || "N/A"})`}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
          <>
          <div className={styles.taskDetailsInlineHeader}>
            <div className={styles.taskDetailsKicker}>Task Details</div>
            <div className={styles.taskDetailsSubtitle}>Edit task data and review its log.</div>
          </div>
          <div className={styles.taskBtnGroup}>
          <div className={styles.taskViewCard}>
            <button
              type="button"
              className={`${styles.taskButton} ${columnFocus === 'right' ? styles.taskButtonToggleActive : ""}`}
              onClick={() => setColumnFocus('right')}
              title="Expand right section"
              aria-label="Expand right section"
              disabled={bodyCollapsed}
            >
              <span className={styles.taskButtonLabel}>&lt;</span>
            </button>
            <button
              type="button"
              className={`${styles.taskButton} ${columnFocus === 'balanced' ? styles.taskButtonToggleActive : ""}`}
              onClick={() => setColumnFocus('balanced')}
              title="Balanced view"
              aria-label="Balanced view"
              disabled={bodyCollapsed}
            >
              <span className={styles.taskButtonLabel}>||</span>
            </button>
            <button
              type="button"
              className={`${styles.taskButton} ${columnFocus === 'left' ? styles.taskButtonToggleActive : ""}`}
              onClick={() => setColumnFocus('left')}
              title="Expand left section"
              aria-label="Expand left section"
              disabled={bodyCollapsed}
            >
              <span className={styles.taskButtonLabel}>&gt;</span>
            </button>
          </div>

          {/* Completion warning */}
          <button
            type="button"
            className={`${styles.taskButton} ${styles.taskButtonSave}`}
            onClick={handleSaveClick}
            title="Save"
          >
            <span className={styles.taskButtonLabel}>Save</span>
          </button>
          <button
            type="button"
            className={`${styles.taskButton} ${styles.taskButtonCollapse}`}
            onClick={() => setBodyCollapsed(true)}
            title="Collapse task card details"
            aria-label="Collapse task card details"
          >
            <svg className={styles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10l5-5 5 5" />
            </svg>
          </button>
          </div>
          </>
          )}
        </div>
        {!bodyCollapsed && (
        <div className={styles.taskDetailsBody}>
        <div
          className={[
            styles.taskCardRow,
            columnFocus === 'left' ? styles.taskCardRowLeftFocus : "",
            columnFocus === 'right' ? styles.taskCardRowRightFocus : "",
          ].filter(Boolean).join(" ")}
        >
          <div className={styles.taskCardBody}>
            <div className={styles.taskForm}>

            {/* Row 1: Gate */}
            <div className={styles.formRow}>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Gate</span>
                <input
                  type="text"
                  value={gate}
                  onChange={e => { setGate(e.target.value); setRenameAllGateTasks(true); }}
                  className={styles.inputSmall}
                  disabled={!gateEditEnabled}
                />
              </label>
              <label className={styles.gateEditToggle}>
                <input
                  type="checkbox"
                  checked={gateEditEnabled}
                  onChange={e => setGateEditEnabled(e.target.checked)}
                />
                <span className={styles.gateEditTrack}>
                  <span className={styles.gateEditThumb} />
                </span>
                <span className={styles.gateEditLabel}>Edit</span>
              </label>
            </div>

            {/* Gate rename checkbox */}
            {gateEditEnabled && (
              <div className={styles.gateRenameToggle}>
                <label className={styles.gateRenameLabel}>
                  <input type="checkbox" checked={renameAllGateTasks} onChange={e => setRenameAllGateTasks(e.target.checked)} />
                  {renameAllGateTasks ? "Rename gate for all tasks in this gate" : "Move only this task to new gate"}
                </label>
              </div>
            )}
 
            {/* Row 2: Task + Release toggle */}
            <div className={styles.formRow}>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span>Task</span>
                <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} className={styles.inputSmall} />
              </label>
              <label className={styles.gateEditToggle}>
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
                <span className={styles.gateEditTrack}>
                  <span className={styles.gateEditThumb} />
                </span>
                <span className={styles.gateEditLabel}>Ship</span>
              </label>
            </div>

            {isRelease && (
              <div className={styles.formRow}>
                <label className={`${styles.field} ${styles.fieldHalf}`}>
                  <span>Release Units</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={releaseUnits}
                    onChange={e => setReleaseUnits(Math.max(0, Number(e.target.value) || 0))}
                    className={`${styles.inputSmall} ${styles.releaseUnitsInput}`}
                  />
                </label>
              </div>
            )}

            {/* Row 3: Left=% Complete  |  Right=Duration+WBS */}
            <div className={styles.formRow}>
              {/* Left half: % Complete label + input */}
              <label className={`${styles.field} ${styles.fieldHalf}`}>
                <span>% Complete</span>
                {isPlanner ? (
                  <select value={complete} onChange={e => setComplete(Number(e.target.value) || 0)} className={styles.selectComplete} onClick={e => e.stopPropagation()}>
                    <option value={0}>0%</option>
                    <option value={50}>50%</option>
                    <option value={100}>100%</option>
                  </select>
                ) : (
                  <input type="number" min={0} max={100} value={complete} onChange={e => setComplete(Number(e.target.value) || 0)} className={styles.inputSmall} onClick={e => e.stopPropagation()} />
                )}
              </label>
              {/* Right half: Duration label + input + WBS label + input */}
              <div className={styles.fieldRightGroup}>
                <span className={styles.fieldGroupLabel}>Duration</span>
                <input
                  type="number" min={0}
                  value={start && finish ? duration : ""}
                  onChange={e => handleDurationChange(Number(e.target.value) || 0)}
                  className={`${styles.inputFixed} ${styles.inputFixed50}`}
                  disabled={!start}
                />
                <span className={styles.fieldGroupLabel}>WBS</span>
                <input
                  type="text"
                  value={wbs}
                  onChange={e => setWbs(e.target.value)}
                  className={styles.inputFixed}
                />
              </div>
            </div>

            {/* Row 4: Start and finish */}
            <div className={styles.formRow}>
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
                  className={styles.inputSmall}
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
                  className={styles.inputSmall}
                />
              </label>
            </div>

            {/* Completion warning */}
            {complete === 100 && !hasCompletionEvidence && (
              <div className={styles.completionWarning}>
                No file is marked as Evidence of Completion.
              </div>
            )}

            </div>
          </div>
          <div className={styles.taskCardColumn}>
          {/* Tab bar */}
          <div className={styles.tabBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'notes' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('notes')}
            >Notes</button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'evidence' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('evidence')}
            >Evidence</button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'approvals' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('approvals')}
            >Approvals</button>
          </div>

          {/* Tab content */}
          <div className={styles.tabContent}>
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
                approvals={task.Approvals}
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
        {hasTaskSteps && taskStepsPanel}
        {hasSubprocessWorkspace && !hasTaskSteps && (
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
