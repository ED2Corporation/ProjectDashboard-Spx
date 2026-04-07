import React, { useState, useEffect, useRef } from "react";
import { ITaskListItem } from "../../../models";
import { INoteEntry, IEvidenceEntry, IApprovalEntry, PRIMARY_APPROVER } from "../../../models/ITaskLogFields";
import styles from "./TaskCard.module.scss";
import NotesLog from "./NotesLog";
import EvidenceLog from "./EvidenceLog";
import ApprovalsLog from "./ApprovalsLog";

type TaskTab = 'notes' | 'evidence' | 'approvals';

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
  onSaveLogField?: (taskId: string, field: 'Notes' | 'Evidence' | 'Approvals', entries: unknown[]) => Promise<void>;
  onSendEmail?: (to: string[], subject: string, body: string) => Promise<void>;
  onSearchUsers?: (query: string) => Promise<{ displayName: string; email: string }[]>;
  onTaskCompleted?: () => void;
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

const TaskCard: React.FC<TaskCardProps> = ({ task, isPlanner, currentUserEmail, currentUserDisplayName, projectInfo, onClose, onSave, onDelete, onNew, onUploadEvidenceFile, onSaveLogField, onSendEmail, onSearchUsers, onTaskCompleted }) => {
  const [activeTab, setActiveTab] = useState<TaskTab>('notes');
  const canManageApprovers = true; // All users can manage approvers
  const [gate, setGate] = useState(task.Gate ?? "");
  const [renameAllGateTasks, setRenameAllGateTasks] = useState(true);
  const [deliverable, setDeliverable] = useState(task.Deliverable ?? "");
  const [taskTitle, setTaskTitle] = useState(task.Task ?? "");
  const [complete, setComplete] = useState<number>(task.Complete ?? 0);
  const [start, setStart] = useState<string>(
    task.Start ? new Date(task.Start).toISOString().slice(0, 10) : ""
  );
  const [finish, setFinish] = useState<string>(
    task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : ""
  );
  const [effort, setEffort] = useState<string>(
    task.Effort !== undefined ? task.Effort.toString() : ""
  );
  const [barriers, setBarriers] = useState(task.Barriers ?? "");
  const [actionableStatus, setActionableStatus] = useState(task.ActionableStatus ?? "");
  const [evidenceOfCompletion, setEvidenceOfCompletion] = useState<ITaskListItem["EvidenceOfCompletion"]>(task.EvidenceOfCompletion);
  const [notesLog, setNotesLog] = useState<INoteEntry[]>(task.Notes ?? []);
  const [evidenceLog, setEvidenceLog] = useState<IEvidenceEntry[]>(task.Evidence ?? []);
  const notesLogRef        = useRef<INoteEntry[]>(task.Notes ?? []);
  const approvalPendingRef = useRef(false);
  const previousCompleteRef = useRef<number>(task.Complete ?? 0);
  const skipNextCompleteEffectRef = useRef(false);

  useEffect(() => {
    setGate(task.Gate ?? "");
    setRenameAllGateTasks(true);
    setDeliverable(task.Deliverable ?? "");
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
    previousCompleteRef.current = task.Complete ?? 0;
  }, [task]);

  const handleSave = (overrides?: {
    complete?: number;
    evidenceOfCompletion?: ITaskListItem["EvidenceOfCompletion"];
  }): void => {
    const effectiveComplete = overrides?.complete ?? complete;
    const effectiveEvidence = overrides && Object.prototype.hasOwnProperty.call(overrides, 'evidenceOfCompletion')
      ? overrides.evidenceOfCompletion
      : evidenceOfCompletion;
    const actualFinish: Date | null =
      effectiveComplete === 100
        ? task.ActualFinish ? new Date(task.ActualFinish) : new Date()
        : null;

    const gateChanged = gate !== task.Gate;
    const data = {
      Id: task.Id,
      Deliverable: deliverable,
      Gate: gate,
      Task: taskTitle,
      Complete: effectiveComplete,
      Effort: effort ? Number(effort) : undefined,
      Barriers: barriers,
      ActionableStatus: actionableStatus,
      Start: start ? new Date(start) : undefined,
      Finish: finish ? new Date(finish) : undefined,
      ActualFinish: actualFinish,
      EvidenceOfCompletion: effectiveEvidence,
      ...(gateChanged && { originalGate: task.Gate, renameGate: renameAllGateTasks }),
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

  const triggerApprovalRequest = async (): Promise<void> => {
    if (approvalPendingRef.current) return;
    approvalPendingRef.current = true;
    try {
      const currentApprovals = task.Approvals ?? [];
      const nextApprovals = currentApprovals.length > 0
        ? currentApprovals
        : [{
            date:   new Date().toISOString(),
            user:   'Joel',
            email:  PRIMARY_APPROVER,
            status: 'pending',
            role:   'primary',
          } as IApprovalEntry];

      if (currentApprovals.length === 0) {
        await onSaveLogField?.(task.Id, 'Approvals', nextApprovals);
      }

      const recipients = nextApprovals.map(approval => approval.email);
      const { subject, body } = buildApprovalEmail(currentUserDisplayName ?? '');
      await onSendEmail?.(recipients, subject, body);
      await appendAuditNote(`Approval request sent to: ${recipients.join(', ')} by ${currentUserDisplayName ?? 'system'}`);
    } finally {
      approvalPendingRef.current = false;
    }
  };

  const saveNotesEntries = async (entries: INoteEntry[], shouldSaveTask = false): Promise<void> => {
    setNotesLog(entries);
    notesLogRef.current = entries;
    console.log("[TaskCard] Saving Notes log", {
      taskId: task.Id,
      nextCount: entries.length,
      entries,
    });
    await onSaveLogField?.(task.Id, 'Notes', entries);
    console.log("[TaskCard] onSaveLogField for Notes resolved", {
      taskId: task.Id,
      nextCount: entries.length,
    });
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
    if (complete === 100) {
      triggerApprovalRequest().catch(error => {
        console.error("[TaskCard] Failed to trigger approval request", error);
      });
    }
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
    appendAuditNote(`Task marked as 100% complete by ${currentUserDisplayName ?? 'system'}`).catch(error => {
      console.error("[TaskCard] Failed to append completion note", error);
    });
    triggerApprovalRequest().catch(error => {
      console.error("[TaskCard] Failed to trigger approval request", error);
    });
  }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasCompletionEvidence = evidenceLog.some(entry => entry.isEvidenceOfCompletion);
  const handleNew = (): void => onNew(task);
  const handleDelete = (): void => onDelete(task.Id);

  return (
    <div className={styles["task-card"]}>
      <div className={styles["task-card-header"]}>
        <h1 className={styles["task-title"]}>{task.Task}</h1>
        <div className={styles["task-btn-group"]}>
          <button type="button" className={styles["task-button"]} onClick={handleSaveClick} title="Save">
            <img src={require("../assets/Accept.png")} alt="save" className={styles["icon-small"]} />
          </button>
          <button type="button" className={styles["task-button"]} onClick={handleNew} title="Add new task">
            <img src={require("../assets/Create.png")} alt="new" className={styles["icon-small"]} />
          </button>
          <button type="button" className={styles["task-button"]} onClick={handleDelete} title="Delete task">
            <img src={require("../assets/Delete.png")} alt="delete" className={styles["icon-small"]} />
          </button>
          {onClose && (
            <button type="button" className={styles["task-card-close"]} onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
      </div>
      <div className={styles["task-card-row"]}>
        <div className={styles["task-card-body"]}>
          <table className={styles["task-table"]}>
            <tbody>
              <tr>
                <td>
                  <strong>Gate:</strong>
                </td>
                <td>
                  <input
                    type="text"
                    value={gate}
                    onChange={e => { setGate(e.target.value); setRenameAllGateTasks(true); }}
                    className={styles["input-small"]}
                  />
                  {gate !== task.Gate && (
                    <div className={styles["gate-rename-toggle"]}>
                      <label className={styles["gate-rename-label"]}>
                        <input
                          type="checkbox"
                          checked={renameAllGateTasks}
                          onChange={e => setRenameAllGateTasks(e.target.checked)}
                        />
                        {renameAllGateTasks
                          ? "Rename gate for all tasks in this gate"
                          : "Move only this task to new gate"}
                      </label>
                    </div>
                  )}
                </td>
              </tr>              
              <tr>
                <td>
                  <strong>Task:</strong>
                </td>
                <td>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>% Complete:</strong>
                </td>
                <td >
                  {isPlanner ? (
                    <select
                      value={complete}
                      onChange={(e) => setComplete(Number(e.target.value) || 0)}
                      className={styles["select-complete"]}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value={0}>0%</option>
                      <option value={50}>50%</option>
                      <option value={100}>100%</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={complete}
                      onChange={(e) => setComplete(Number(e.target.value) || 0)}
                      className={styles["input-small"]}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}              
                  {complete === 100 && !hasCompletionEvidence && (
                    <div className={styles["completion-warning"]}>
                      No file is marked as Evidence of Completion.
                    </div>
                  )}
                </td>
              </tr>

              <tr>
                <td>
                  <strong>Start:</strong>
                </td>
                <td>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      // Skip validation if start has no value yet
                      if (newStart && finish) {
                        // Convertimos ambas a fechas UTC para comparar correctamente
                        const [sy, sm, sd] = newStart.split("-").map(Number);
                        const [fy, fm, fd] = finish.split("-").map(Number);
                        const startUTC = Date.UTC(sy, sm - 1, sd);
                        const finishUTC = Date.UTC(fy, fm - 1, fd);

                        if (finishUTC < startUTC) {
                          alert("Finish date cannot be earlier than Start date.");
                          return; // Do not update state
                        }
                      }
                      setStart(newStart);
                    }}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>

              <tr>
                <td>
                  <strong>Finish:</strong>
                </td>
                <td>
                  <input
                    type="date"
                    value={finish}
                    onChange={(e) => {
                      const newFinish = e.target.value;
                      // Skip validation if start has no value yet
                      if (start && newFinish) {
                        // Convertimos ambas a fechas UTC para comparar correctamente
                        const [sy, sm, sd] = start.split("-").map(Number);
                        const [fy, fm, fd] = newFinish.split("-").map(Number);
                        const startUTC = Date.UTC(sy, sm - 1, sd);
                        const finishUTC = Date.UTC(fy, fm - 1, fd);

                        if (finishUTC < startUTC) {
                          alert("Finish date cannot be earlier than Start date.");
                          return; // Do not update state
                        }
                      }
                      setFinish(newFinish);
                    }}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>

            </tbody>
          </table>
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
                    await triggerApprovalRequest();
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
  );
};

export default TaskCard;
