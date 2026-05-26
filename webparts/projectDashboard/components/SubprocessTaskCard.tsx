import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { IApprovalEntry, IEvidenceEntry, INoteEntry } from "../../../models/ITaskLogFields";
import { ISubprocessSubTask } from "../utils/TaskDescriptionBlob";
import ApprovalsLog from "./ApprovalsLog";
import EvidenceLog from "./EvidenceLog";
import NotesLog from "./NotesLog";
import styles from "./SubprocessCard.module.scss";

type SubprocessTaskTab = "notes" | "evidence" | "approvals";
type SubprocessColumnFocus = "balanced" | "left" | "right";

interface ISubprocessTaskCardProps {
  subTask: ISubprocessSubTask;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  onClose: () => void;
  onSave: (nextSubTask: ISubprocessSubTask) => void;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
  onSendEmail?: (to: string[], subject: string, body: string) => Promise<void>;
  onSearchUsers?: (query: string) => Promise<{ displayName: string; email: string }[]>;
}

const toDateInputValue = (value?: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.floor(Number.isFinite(value) ? value : 0)));

const deriveDuration = (value?: number, start?: string, finish?: string): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!start || !finish) return 0;
  const startDate = new Date(start);
  const finishDate = new Date(finish);
  if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime()) || finishDate < startDate) return 0;
  const days = Math.ceil((finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

const hasCompletionEvidence = (entries: IEvidenceEntry[]): boolean =>
  entries.some(entry => entry.isEvidenceOfCompletion);

const SubprocessTaskCard: React.FC<ISubprocessTaskCardProps> = ({
  subTask,
  currentUserEmail,
  currentUserDisplayName,
  onClose,
  onSave,
  onUploadEvidenceFile,
  onSendEmail,
  onSearchUsers,
}) => {
  const [activeTab, setActiveTab] = useState<SubprocessTaskTab>("notes");
  const [taskTitle, setTaskTitle] = useState(subTask.task || "");
  const [duration, setDuration] = useState<number>(deriveDuration(subTask.duration, subTask.start, subTask.finish));
  const [complete, setComplete] = useState<number>(subTask.complete || 0);
  const [start, setStart] = useState<string>(toDateInputValue(subTask.start));
  const [finish, setFinish] = useState<string>(toDateInputValue(subTask.finish));
  const [actualFinish, setActualFinish] = useState<string>(toDateInputValue(subTask.actualFinish));
  const [notes, setNotes] = useState<INoteEntry[]>(subTask.notes ?? []);
  const [evidence, setEvidence] = useState<IEvidenceEntry[]>(subTask.evidence ?? []);
  const [approvals, setApprovals] = useState<IApprovalEntry[]>(subTask.approvals ?? []);
  const [columnFocus, setColumnFocus] = useState<SubprocessColumnFocus>("balanced");
  const notesRef = useRef<INoteEntry[]>(subTask.notes ?? []);

  useEffect(() => {
    setTaskTitle(subTask.task || "");
    setDuration(deriveDuration(subTask.duration, subTask.start, subTask.finish));
    setComplete(subTask.complete || 0);
    setStart(toDateInputValue(subTask.start));
    setFinish(toDateInputValue(subTask.finish));
    setActualFinish(toDateInputValue(subTask.actualFinish));
    setNotes(subTask.notes ?? []);
    notesRef.current = subTask.notes ?? [];
    setEvidence(subTask.evidence ?? []);
    setApprovals(subTask.approvals ?? []);
    setActiveTab("notes");
    setColumnFocus("balanced");
  }, [subTask]);

  const appendAuditNote = async (text: string): Promise<void> => {
    const entry: INoteEntry = {
      date: new Date().toISOString(),
      user: currentUserDisplayName ?? "",
      note: text,
    };
    const nextEntries = [...notesRef.current, entry];
    notesRef.current = nextEntries;
    setNotes(nextEntries);
  };

  const buildNextSubTask = (overrides?: {
    complete?: number;
    actualFinish?: string;
    evidence?: IEvidenceEntry[];
    notes?: INoteEntry[];
    approvals?: IApprovalEntry[];
  }): ISubprocessSubTask => {
    const nextComplete = overrides?.complete ?? complete;
    const nextActualFinish =
      overrides && Object.prototype.hasOwnProperty.call(overrides, "actualFinish")
        ? overrides.actualFinish
        : (nextComplete === 100
            ? actualFinish || new Date().toISOString().slice(0, 10)
            : "");

    return {
      ...subTask,
      task: taskTitle,
      duration,
      complete: clampPercent(nextComplete),
      start,
      finish,
      actualFinish: nextActualFinish,
      notes: overrides?.notes ?? notes,
      evidence: overrides?.evidence ?? evidence,
      approvals: overrides?.approvals ?? approvals,
    };
  };

  const handleSave = (): void => {
    onSave(buildNextSubTask());
    onClose();
  };

  const handleToggleEvidenceOfCompletion = async (entry: IEvidenceEntry): Promise<void> => {
    const nextEntries = evidence.map(current => {
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

    setEvidence(nextEntries);
    await appendAuditNote(
      nextEntries.some(current => current.fileUrl === entry.fileUrl && current.date === entry.date && current.isEvidenceOfCompletion)
        ? `Evidence of completion marked for file ${entry.fileName} by ${currentUserDisplayName ?? "system"}`
        : `Evidence of completion removed for file ${entry.fileName} by ${currentUserDisplayName ?? "system"}`
    );
  };

  const buildApprovalEmail = (requestedBy: string): { subject: string; body: string } => ({
    subject: `Approval requested: ${taskTitle || subTask.task || subTask.wbs}`,
    body: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
  <h2 style="color:#0f766e;margin-bottom:4px;">Subprocess Approval Required</h2>
  <p style="margin:0 0 16px;">Subtask <strong>${taskTitle || subTask.task || subTask.wbs}</strong> requires your approval.</p>
  <div style="background:#f1fbf9;border-left:4px solid #0f766e;border-radius:4px;padding:16px 20px;margin-bottom:16px;">
    <p style="margin:0 0 8px;font-weight:600;color:#0f766e;">Reference</p>
    <p style="margin:0;line-height:1.8;"><strong>WBS:</strong> ${subTask.wbs}</p>
  </div>
  <p style="color:#444;">Please review the subtask and respond in the approvals section.</p>
  <p style="color:#999;font-size:12px;margin-top:20px;">Requested by: <strong>${requestedBy}</strong></p>
</div>`.trim(),
  });

  const completionEvidenceMissing = complete === 100 && !hasCompletionEvidence(evidence);

  return (
    <div className={styles.detailCard} data-testid="subprocess-detail-card">
      <div className={styles.detailHeader}>
        <div>
          <div className={styles.kicker}>Subprocess Detail</div>
          <h3 className={styles.detailTitle}>{subTask.wbs} · {taskTitle || "Untitled subtask"}</h3>
        </div>
        <div className={styles.detailActions}>
          <div className={styles.detailViewCard}>
            <button
              type="button"
              className={`${styles.detailViewBtn} ${columnFocus === "right" ? styles.detailViewBtnActive : ""}`}
              onClick={() => setColumnFocus("right")}
              title="Expand right section"
              aria-label="Expand right section"
            >
              &lt;
            </button>
            <button
              type="button"
              className={`${styles.detailViewBtn} ${columnFocus === "balanced" ? styles.detailViewBtnActive : ""}`}
              onClick={() => setColumnFocus("balanced")}
              title="Balanced view"
              aria-label="Balanced view"
            >
              ||
            </button>
            <button
              type="button"
              className={`${styles.detailViewBtn} ${columnFocus === "left" ? styles.detailViewBtnActive : ""}`}
              onClick={() => setColumnFocus("left")}
              title="Expand left section"
              aria-label="Expand left section"
            >
              &gt;
            </button>
          </div>
          <button type="button" className={styles.detailActionBtn} onClick={handleSave}>
            Save
          </button>
          <button type="button" className={styles.detailActionBtnSecondary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div
        className={[
          styles.detailBody,
          columnFocus === "left" ? styles.detailBodyLeftFocus : "",
          columnFocus === "right" ? styles.detailBodyRightFocus : "",
        ].filter(Boolean).join(" ")}
      >
        <div className={styles.detailForm}>
          <div className={styles.detailRow}>
            <label className={styles.detailFieldFull}>
              <span>Task</span>
              <input
                type="text"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                className={styles.detailInput}
              />
            </label>
          </div>

          <div className={styles.detailRow}>
            <label className={styles.detailField}>
              <span>% Complete</span>
              <input
                type="number"
                min={0}
                max={100}
                value={complete}
                onChange={(event) => setComplete(clampPercent(Number(event.target.value) || 0))}
                className={styles.detailInput}
              />
            </label>
            <label className={styles.detailField}>
              <span>WBS</span>
              <input
                type="text"
                value={subTask.wbs}
                className={styles.detailInputReadonly}
                readOnly
              />
            </label>
          </div>

          <div className={styles.detailRow}>
            <label className={styles.detailField}>
              <span>Start</span>
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className={styles.detailInput}
              />
            </label>
            <label className={styles.detailField}>
              <span>Duration</span>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value) || 0)}
                className={styles.detailInput}
              />
            </label>
          </div>

          <div className={styles.detailRow}>
            <label className={styles.detailField}>
              <span>Finish</span>
              <input
                type="date"
                value={finish}
                onChange={(event) => setFinish(event.target.value)}
                className={styles.detailInput}
              />
            </label>
            <label className={styles.detailField}>
              <span>Actual Finish</span>
              <input
                type="date"
                value={actualFinish}
                onChange={(event) => setActualFinish(event.target.value)}
                className={styles.detailInput}
              />
            </label>
          </div>

          {completionEvidenceMissing && (
            <div className={styles.detailWarning}>
              No file is marked as Evidence of Completion.
            </div>
          )}
        </div>

        <div className={styles.detailColumn}>
          <div className={styles.detailTabs}>
            <button
              type="button"
              className={`${styles.detailTabBtn} ${activeTab === "notes" ? styles.detailTabActive : ""}`}
              onClick={() => setActiveTab("notes")}
            >
              Notes
            </button>
            <button
              type="button"
              className={`${styles.detailTabBtn} ${activeTab === "evidence" ? styles.detailTabActive : ""}`}
              onClick={() => setActiveTab("evidence")}
            >
              Evidence
            </button>
            <button
              type="button"
              className={`${styles.detailTabBtn} ${activeTab === "approvals" ? styles.detailTabActive : ""}`}
              onClick={() => setActiveTab("approvals")}
            >
              Approvals
            </button>
          </div>

          <div className={styles.detailTabContent}>
            {activeTab === "notes" && (
              <NotesLog
                notes={notes}
                currentUserDisplayName={currentUserDisplayName ?? ""}
                onSave={async (entries: INoteEntry[]) => {
                  notesRef.current = entries;
                  setNotes(entries);
                }}
              />
            )}

            {activeTab === "evidence" && (
              <EvidenceLog
                evidence={evidence}
                taskTitle={taskTitle || subTask.task || "Subtask"}
                currentUserDisplayName={currentUserDisplayName ?? ""}
                onSave={async (entries: IEvidenceEntry[], uploadedEntry?: IEvidenceEntry) => {
                  setEvidence(entries);

                  if (uploadedEntry) {
                    const uploadNote = uploadedEntry.note
                      ? `File uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}. Note: ${uploadedEntry.note}`
                      : `File uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}`;
                    const nextNotes = [
                      ...notesRef.current,
                      { date: uploadedEntry.date, user: uploadedEntry.user, note: uploadNote },
                    ];
                    notesRef.current = nextNotes;
                    setNotes(nextNotes);
                  }
                }}
                onToggleEvidenceOfCompletion={handleToggleEvidenceOfCompletion}
                onUploadFile={onUploadEvidenceFile}
              />
            )}

            {activeTab === "approvals" && (
              <ApprovalsLog
                taskTitle={taskTitle || subTask.task || "Subtask"}
                approvals={approvals}
                currentUserEmail={currentUserEmail ?? ""}
                currentUserDisplayName={currentUserDisplayName ?? ""}
                canManageApprovers={true}
                onSave={async (entries: IApprovalEntry[]) => {
                  setApprovals(entries);
                }}
                onSendEmail={onSendEmail ?? (async () => undefined)}
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

export default SubprocessTaskCard;
