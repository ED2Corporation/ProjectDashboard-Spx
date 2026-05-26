import React, { useState, useEffect, useRef } from "react";
import { ITaskListItem } from "../../../models";
import { INoteEntry, IEvidenceEntry, IApprovalEntry } from "../../../models/ITaskLogFields";
import styles from "./TaskCard.module.scss";
import NotesLog from "./NotesLog";
import EvidenceLog from "./EvidenceLog";
import ApprovalsLog from "./ApprovalsLog";
import SubprocessCard from "./SubprocessCard";
import { buildTaskJsonTable, getTaskReleaseUnits, getTaskSortOrder, getTaskSubprocess, ITaskSubprocessData } from "../utils/TaskDescriptionBlob";

type TaskTab = 'notes' | 'evidence' | 'approvals';
type TaskCardColumnFocus = 'balanced' | 'left' | 'right';

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

const TaskCard: React.FC<TaskCardProps> = ({ task, isPlanner, isCreating, isDeleting, hasPrev, hasNext, onNavigate, isMoveFirst, isMoveLast, isMoving, onMoveFirst, onMoveUp, onMoveDown, onMoveLast, currentUserEmail, currentUserDisplayName, projectInfo, remainingReleaseUnits, onClose, onSave, onDelete, onNew, onUploadEvidenceFile, onSaveLogField, onSendEmail, onSearchUsers, onTaskCompleted }) => {
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
  const initialSubprocess = getTaskSubprocess(task.jsonTable);
  const [showSubprocess, setShowSubprocess] = useState(false);
  const [subprocess, setSubprocess] = useState<ITaskSubprocessData>(initialSubprocess);
  const [columnFocus, setColumnFocus] = useState<TaskCardColumnFocus>('balanced');
  const [bodyCollapsed, setBodyCollapsed] = useState(false);
  const notesLogRef        = useRef<INoteEntry[]>(task.Notes ?? []);
  const previousCompleteRef = useRef<number>(task.Complete ?? 0);
  const skipNextCompleteEffectRef = useRef(false);
  const prevTaskIdRef      = useRef<string>(task.Id);
  const hasSubprocessTasks = subprocess.subTasks.length > 0;

  useEffect(() => {
    prevTaskIdRef.current = task.Id;

    setWbs(task.Title ?? "");
    setGate(task.Gate ?? "");
    setGateEditEnabled(false);
    setRenameAllGateTasks(true);
    // Rehydrate release state from the latest task snapshot so both
    // transitions (false -> true and true -> false) are reflected after reload.
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
    setShowSubprocess(false);
    setSubprocess(getTaskSubprocess(task.jsonTable));
    setColumnFocus('balanced');
    setBodyCollapsed(false);
    previousCompleteRef.current = task.Complete ?? 0;
  }, [task]);

  const handleSave = (overrides?: {
    complete?: number;
    evidenceOfCompletion?: ITaskListItem["EvidenceOfCompletion"];
  }): void => {
    if (isRelease && releaseUnits <= 0) {
      alert("Release Units must be greater than 0 for a release task.");
      return;
    }

    const effectiveComplete = overrides?.complete ?? complete;
    const effectiveEvidence = overrides && Object.prototype.hasOwnProperty.call(overrides, 'evidenceOfCompletion')
      ? overrides.evidenceOfCompletion
      : evidenceOfCompletion;
    const actualFinish: Date | null =
      effectiveComplete === 100
        ? task.ActualFinish ? new Date(task.ActualFinish) : new Date()
        : null;

    const gateChanged = gate !== task.Gate;
    const sortOrder = getTaskSortOrder(task.jsonTable);
    const hasSubprocessData = subprocess.subTasks.length > 0;
    const jsonTable = buildTaskJsonTable(task.jsonTable, {
      sortOrder,
      isRelease: isRelease || undefined,
      releaseUnits: isRelease ? releaseUnits : undefined,
      subprocess: hasSubprocessData ? subprocess : undefined,
      clearSubprocess: !hasSubprocessData,
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

    onSave(task.Id, JSON.stringify(data));
  };

  const handleSaveSubprocessOnly = (nextSubprocess: ITaskSubprocessData): void => {
    const hasSubprocessData = nextSubprocess.subTasks.length > 0;
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
      Complete: task.Complete ?? 0,
      Effort: task.Effort,
      Barriers: task.Barriers ?? "",
      ActionableStatus: task.ActionableStatus ?? "",
      Start: task.Start ?? undefined,
      Finish: task.Finish ?? undefined,
      ActualFinish: task.ActualFinish ?? undefined,
      Description: task.Description ?? "",
      jsonTable: jsonTable ?? "",
      isRelease: task.isRelease ?? false,
      releaseUnits: task.isRelease ? (task.releaseUnits ?? 0) : 0,
      EvidenceOfCompletion: task.EvidenceOfCompletion,
    };

    onSave(task.Id, JSON.stringify(data));
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
        setBodyCollapsed(false);
      }
      return next;
    });
  };

  return (
    <div className={styles["task-card"]}>
      <div className={styles["task-card-header"]}>
        <h1 className={styles["task-title"]}>{task.Task}</h1>
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

          <div className={styles["task-view-card"]}>
            <button
              type="button"
              className={`${styles["task-button"]} ${columnFocus === 'right' ? styles["task-button-toggle-active"] : ""}`}
              onClick={() => setColumnFocus('right')}
              title="Expand right section"
              aria-label="Expand right section"
            >
              <span className={styles["task-button-label"]}>&lt;</span>
            </button>
            <button
              type="button"
              className={`${styles["task-button"]} ${columnFocus === 'balanced' ? styles["task-button-toggle-active"] : ""}`}
              onClick={() => setColumnFocus('balanced')}
              title="Balanced view"
              aria-label="Balanced view"
            >
              <span className={styles["task-button-label"]}>||</span>
            </button>
            <button
              type="button"
              className={`${styles["task-button"]} ${columnFocus === 'left' ? styles["task-button-toggle-active"] : ""}`}
              onClick={() => setColumnFocus('left')}
              title="Expand left section"
              aria-label="Expand left section"
            >
              <span className={styles["task-button-label"]}>&gt;</span>
            </button>
          </div>
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


          {/* ── Save / Close ── */}
          <button
            type="button"
            className={[
              styles["task-button"],
              styles["task-button-save"],
              hasSubprocessTasks ? styles["task-button-subprocess-ready"] : "",
              showSubprocess ? styles["task-button-toggle-active"] : "",
            ].filter(Boolean).join(" ")}
            onClick={handleToggleSubprocess}
            title="Subprocess"
          >
            <span className={styles["task-button-label"]}>Subprocess</span>
          </button>
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
        </div>
      </div>
      {!bodyCollapsed && (
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
      )}
      {showSubprocess && (
        <SubprocessCard
          parentWbs={wbs}
          parentStart={start}
          parentFinish={finish}
          value={subprocess}
          onChange={setSubprocess}
          onSaveSubprocess={handleSaveSubprocessOnly}
          onClose={() => setShowSubprocess(false)}
          currentUserEmail={currentUserEmail}
          currentUserDisplayName={currentUserDisplayName}
          onUploadEvidenceFile={onUploadEvidenceFile}
          onSendEmail={onSendEmail}
          onSearchUsers={onSearchUsers}
        />
      )}
    </div>
  );
};

export default TaskCard;
