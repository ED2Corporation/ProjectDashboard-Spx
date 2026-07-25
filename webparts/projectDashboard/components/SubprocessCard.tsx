import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IEvidenceEntry, INoteEntry } from "../../../models/ITaskLogFields";
import { ITaskSubprocessData, ISubprocessSubTask } from "../utils/TaskDescriptionBlob";
import { parseSubprocessExcelFile } from "../utils/SubprocessImport";
import SubprocessList from "./SubprocessList";
import SubprocessTaskCard from "./SubprocessTaskCard";
import styles from "./SubprocessCard.module.scss";

interface SubprocessCardProps {
  parentWbs: string;
  parentStart: string;
  parentFinish: string;
  value: ITaskSubprocessData;
  onChange: (nextValue: ITaskSubprocessData) => void;
  onSaveSubprocess?: (nextValue: ITaskSubprocessData) => void;
  onClose?: () => void;
  currentUserEmail?: string;
  currentUserDisplayName?: string;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
  onSendEmail?: (to: string[], subject: string, body: string) => Promise<void>;
  onSearchUsers?: (query: string) => Promise<{ displayName: string; email: string }[]>;
  showTaskStepsToggle?: boolean;
  taskStepsToggleActive?: boolean;
  taskStepsToggleHighlighted?: boolean;
  onToggleTaskSteps?: () => void;
  taskStepsPanel?: React.ReactNode;
  isCollapsed?: boolean;
  closeLabel?: string;
}

type MoveDirection = "first" | "up" | "down" | "last";

const formatSubTaskWbs = (parentWbs: string, index: number): string => {
  const prefix = parentWbs.trim();
  const suffix = String(index + 1).padStart(2, "0");
  return prefix ? `${prefix}.${suffix}` : suffix;
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.floor(value)));

const normalizeSubTasks = (parentWbs: string, subTasks: ISubprocessSubTask[]): ISubprocessSubTask[] =>
  subTasks
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry, index) => ({
      ...entry,
      sortOrder: index,
      wbs: formatSubTaskWbs(parentWbs, index),
      duration: entry.duration,
      complete: clampPercent(entry.complete || 0),
      start: entry.start || "",
      finish: entry.finish || "",
      actualFinish: entry.actualFinish || "",
      notes: entry.notes ?? [],
      evidence: entry.evidence ?? [],
      approvals: entry.approvals ?? [],
    }));

const createEmptySubTask = (
  parentWbs: string,
  parentStart: string,
  parentFinish: string,
  index: number
): ISubprocessSubTask => ({
  id: `sp-${Date.now()}-${index + 1}`,
  wbs: formatSubTaskWbs(parentWbs, index),
  sortOrder: index,
  task: "New subtask...",
  duration: 0,
  complete: 0,
  start: parentStart,
  finish: parentFinish,
  actualFinish: "",
  notes: [],
  evidence: [],
  approvals: [],
});

const SubprocessCard: React.FC<SubprocessCardProps> = ({
  parentWbs,
  parentStart,
  parentFinish,
  value,
  onChange,
  onSaveSubprocess,
  onClose,
  currentUserEmail,
  currentUserDisplayName,
  onUploadEvidenceFile,
  onSendEmail,
  onSearchUsers,
  showTaskStepsToggle,
  taskStepsToggleActive,
  taskStepsToggleHighlighted,
  onToggleTaskSteps,
  taskStepsPanel,
  isCollapsed = false,
  closeLabel,
}) => {
  const [selectedSubTaskId, setSelectedSubTaskId] = useState<string | undefined>(undefined);
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | undefined>(undefined);
  const [movingSubTaskId, setMovingSubTaskId] = useState<string | undefined>(undefined);
  const [detailSubTaskId, setDetailSubTaskId] = useState<string | undefined>(undefined);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSubTasks = useMemo(
    () => normalizeSubTasks(parentWbs, value.subTasks),
    [parentWbs, value.subTasks]
  );

  useEffect(() => {
    const changed = normalizedSubTasks.some((entry, index) => {
      const current = value.subTasks[index];
      return (
        current?.id !== entry.id ||
        current?.wbs !== entry.wbs ||
        current?.sortOrder !== entry.sortOrder
      );
    }) || normalizedSubTasks.length !== value.subTasks.length;

    if (changed) {
      onChange({ ...value, subTasks: normalizedSubTasks });
    }
  }, [normalizedSubTasks, onChange, value]);

  useEffect(() => {
    if (!normalizedSubTasks.length) {
      setSelectedSubTaskId(undefined);
      setEditingSubTaskId(undefined);
      setDetailSubTaskId(undefined);
      return;
    }

    if (selectedSubTaskId && normalizedSubTasks.some(entry => entry.id === selectedSubTaskId)) {
      return;
    }

    setSelectedSubTaskId(normalizedSubTasks[0].id);
  }, [normalizedSubTasks, selectedSubTaskId]);

  const commitSubTasks = (subTasks: ISubprocessSubTask[]): ITaskSubprocessData => {
    const nextValue = {
      ...value,
      subTasks: normalizeSubTasks(parentWbs, subTasks),
    };
    onChange(nextValue);
    return nextValue;
  };

  const handleAddBelow = (subTaskId: string): void => {
    const base = normalizedSubTasks.slice();
    const currentIndex = base.findIndex(entry => entry.id === subTaskId);
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : base.length;
    const nextSubTask = createEmptySubTask(parentWbs, parentStart, parentFinish, insertIndex);
    base.splice(insertIndex, 0, nextSubTask);
    commitSubTasks(base);
    setSelectedSubTaskId(nextSubTask.id);
    setEditingSubTaskId(nextSubTask.id);
  };

  const handleRemove = (subTaskId: string): void => {
    const currentIndex = normalizedSubTasks.findIndex(entry => entry.id === subTaskId);
    const next = normalizedSubTasks.filter(entry => entry.id !== subTaskId);
    commitSubTasks(next);

    const fallback = next[currentIndex] || next[currentIndex - 1];
    setSelectedSubTaskId(fallback?.id);
    if (editingSubTaskId === subTaskId) {
      setEditingSubTaskId(undefined);
    }
    if (detailSubTaskId === subTaskId) {
      setDetailSubTaskId(undefined);
    }
  };

  const handleStartQuickEdit = (subTaskId: string): void => {
    setSelectedSubTaskId(subTaskId);
    setEditingSubTaskId(subTaskId);
  };

  const handleSaveQuickEdit = (
    subTaskId: string,
    patch: Pick<ISubprocessSubTask, "task" | "duration" | "complete" | "start" | "finish" | "actualFinish">
  ): void => {
    const nextValue = commitSubTasks(
      normalizedSubTasks.map(entry =>
        entry.id === subTaskId
          ? {
              ...entry,
              ...patch,
              complete: clampPercent(patch.complete),
              actualFinish: patch.complete === 100 ? patch.actualFinish : "",
            }
          : entry
      )
    );
    setEditingSubTaskId(undefined);
    onSaveSubprocess?.(nextValue);
  };

  const handleMove = (subTaskId: string, direction: MoveDirection): void => {
    const currentIndex = normalizedSubTasks.findIndex(entry => entry.id === subTaskId);
    if (currentIndex < 0) return;

    const next = normalizedSubTasks.slice();
    const [current] = next.splice(currentIndex, 1);
    let targetIndex = currentIndex;

    switch (direction) {
      case "first":
        targetIndex = 0;
        break;
      case "up":
        targetIndex = Math.max(0, currentIndex - 1);
        break;
      case "down":
        targetIndex = Math.min(next.length, currentIndex + 1);
        break;
      case "last":
        targetIndex = next.length;
        break;
    }

    next.splice(targetIndex, 0, current);
    setMovingSubTaskId(subTaskId);
    commitSubTasks(next);
    setSelectedSubTaskId(subTaskId);
    window.setTimeout(() => setMovingSubTaskId(undefined), 0);
  };

  const handleSaveEvidenceEntries = async (
    subTaskId: string,
    entries: IEvidenceEntry[]
  ): Promise<void> => {
    const uploadedEntry = entries[entries.length - 1];
    const today = new Date().toISOString().slice(0, 10);

    commitSubTasks(
      normalizedSubTasks.map(entry => {
        if (entry.id !== subTaskId) return entry;

        const nextNotes = [...(entry.notes ?? [])];

        if (uploadedEntry) {
          const uploadNote: INoteEntry = {
            date: uploadedEntry.date,
            user: uploadedEntry.user,
            note: uploadedEntry.note
              ? `File uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}. Note: ${uploadedEntry.note}`
              : `File uploaded by ${uploadedEntry.user}: ${uploadedEntry.fileName}`,
          };
          nextNotes.push(uploadNote);
        }

        return {
          ...entry,
          complete: 100,
          actualFinish: today,
          evidence: entries,
          notes: nextNotes,
        };
      })
    );
  };

  const handleSaveDetail = (nextSubTask: ISubprocessSubTask): void => {
    const nextValue = commitSubTasks(
      normalizedSubTasks.map(entry => (
        entry.id === nextSubTask.id
          ? {
              ...entry,
              ...nextSubTask,
            }
          : entry
      ))
    );
    setSelectedSubTaskId(nextSubTask.id);
    onSaveSubprocess?.(nextValue);
  };

  const handleImportClick = (): void => {
    if (isImporting) return;
    importInputRef.current?.click();
  };

  const handleImportFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setIsImporting(true);
      const importedSubTasks = await parseSubprocessExcelFile(file, parentWbs, parentStart, parentFinish);
      const nextValue = commitSubTasks(importedSubTasks);
      setSelectedSubTaskId(importedSubTasks[0]?.id);
      setEditingSubTaskId(undefined);
      setDetailSubTaskId(undefined);
      onSaveSubprocess?.(nextValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import subprocess template.";
      alert(message);
    } finally {
      setIsImporting(false);
    }
  };

  const detailSubTask = detailSubTaskId
    ? normalizedSubTasks.find(entry => entry.id === detailSubTaskId)
    : undefined;

  return (
    <div className={styles.card} data-testid="subprocess-workspace">
      <div className={styles.header}>
        <div>
          <div className={styles.kicker}>Subprocess Workspace</div>
          <h3 className={styles.title}>Subprocess</h3>
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.contextActions}>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFileChange}
              style={{ display: "none" }}
            />
            <button
              type="button"
              className={styles.contextActionBtn}
              onClick={handleImportClick}
              title="Import subtasks from Excel"
              disabled={isImporting}
            >
              <span>{isImporting ? "Importing..." : "Import Subtasks"}</span>
            </button>
            {showTaskStepsToggle && (
              <button
                type="button"
                className={[
                  styles.contextActionBtn,
                  taskStepsToggleHighlighted ? styles.contextActionBtnHighlighted : "",
                  taskStepsToggleActive ? styles.contextActionBtnActive : "",
                ].filter(Boolean).join(" ")}
                onClick={onToggleTaskSteps}
                title="TaskSteps"
              >
                <span>Step Tasks</span>
              </button>
            )}
            <div className={styles.contextChip}>Embedded in task {parentWbs || "N/A"}</div>
            {onClose && (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                title={isCollapsed ? "Expand subprocess workspace" : "Collapse subprocess workspace"}
                aria-label={isCollapsed ? "Expand subprocess workspace" : "Collapse subprocess workspace"}
              >
                <svg className={styles.closeIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {isCollapsed ? <path d="M3 6l5 5 5-5" /> : <path d="M3 10l5-5 5 5" />}
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {taskStepsPanel}

          <SubprocessList
            subTasks={normalizedSubTasks}
            selectedSubTaskId={selectedSubTaskId}
            editingSubTaskId={editingSubTaskId}
            movingSubTaskId={movingSubTaskId}
            onSelect={setSelectedSubTaskId}
            onAddBelow={handleAddBelow}
            onRemove={handleRemove}
            onStartQuickEdit={handleStartQuickEdit}
            onSaveQuickEdit={handleSaveQuickEdit}
            onCancelQuickEdit={() => setEditingSubTaskId(undefined)}
            onMove={handleMove}
            currentUserDisplayName={currentUserDisplayName}
            onUploadEvidenceFile={onUploadEvidenceFile}
            onSaveEvidenceEntries={handleSaveEvidenceEntries}
            onEditDetail={(subTaskId) => {
              setSelectedSubTaskId(subTaskId);
              setEditingSubTaskId(undefined);
              setDetailSubTaskId(subTaskId);
            }}
          />

          {detailSubTask && (
            <SubprocessTaskCard
              subTask={detailSubTask}
              currentUserEmail={currentUserEmail}
              currentUserDisplayName={currentUserDisplayName}
              onUploadEvidenceFile={onUploadEvidenceFile}
              onSendEmail={onSendEmail}
              onSearchUsers={onSearchUsers}
              onSave={handleSaveDetail}
              onClose={() => setDetailSubTaskId(undefined)}
            />
          )}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => {
                if (selectedSubTaskId) {
                  handleAddBelow(selectedSubTaskId);
                } else {
                  const nextSubTask = createEmptySubTask(parentWbs, parentStart, parentFinish, normalizedSubTasks.length);
                  commitSubTasks([...normalizedSubTasks, nextSubTask]);
                  setSelectedSubTaskId(nextSubTask.id);
                  setEditingSubTaskId(nextSubTask.id);
                }
              }}
            >
              + Add Subtask
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SubprocessCard;
