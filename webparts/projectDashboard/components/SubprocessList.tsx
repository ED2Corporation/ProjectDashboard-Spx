import * as React from "react";
import { useMemo, useState } from "react";
import { IEvidenceEntry } from "../../../models/ITaskLogFields";
import { getTodayDateInputValue, ISubprocessSubTask } from "../utils/TaskDescriptionBlob";
import EvidenceUploadButton from "./EvidenceUploadButton";
import dashboardStyles from "./ProjectDashboard.module.scss";
import styles from "./SubprocessCard.module.scss";

type SortCol = "wbs" | "task" | "complete" | "start" | "finish";
type SortDir = "asc" | "desc";
type MoveDirection = "first" | "up" | "down" | "last";

interface ISubprocessListProps {
  subTasks: ISubprocessSubTask[];
  selectedSubTaskId?: string;
  editingSubTaskId?: string;
  movingSubTaskId?: string;
  detailSubTaskId?: string;
  detailCard?: React.ReactNode;
  onSelect: (subTaskId: string) => void;
  onAddBelow: (subTaskId: string) => void;
  onRemove: (subTaskId: string) => void;
  onStartQuickEdit: (subTaskId: string) => void;
  onSaveQuickEdit: (
    subTaskId: string,
    patch: Pick<ISubprocessSubTask, "task" | "duration" | "complete" | "start" | "finish" | "actualFinish">
  ) => void;
  onCancelQuickEdit: () => void;
  onMove: (subTaskId: string, direction: MoveDirection) => void;
  onEditDetail?: (subTaskId: string) => void;
  currentUserDisplayName?: string;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
  onSaveEvidenceEntries?: (subTaskId: string, entries: IEvidenceEntry[]) => Promise<void>;
}

const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }): JSX.Element => (
  <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
    {active ? (dir === "asc" ? "\u25B2" : "\u25BC") : "\u25B2"}
  </span>
);

const toDateInputValue = (value?: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const toMs = (value?: string): number => {
  if (!value) return 0;
  const date = new Date(value);
  return isNaN(date.getTime()) ? 0 : date.getTime();
};

const getCompletionEvidence = (evidence?: IEvidenceEntry[]): IEvidenceEntry | undefined =>
  evidence?.find(entry => entry.isEvidenceOfCompletion);

const SubprocessList: React.FC<ISubprocessListProps> = ({
  subTasks,
  selectedSubTaskId,
  editingSubTaskId,
  movingSubTaskId,
  detailSubTaskId,
  detailCard,
  onSelect,
  onAddBelow,
  onRemove,
  onStartQuickEdit,
  onSaveQuickEdit,
  onCancelQuickEdit,
  onMove,
  onEditDetail,
  currentUserDisplayName,
  onUploadEvidenceFile,
  onSaveEvidenceEntries,
}) => {
  const [sortCol, setSortCol] = useState<SortCol>("wbs");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editPercentComplete, setEditPercentComplete] = useState(0);
  const [editStart, setEditStart] = useState("");
  const [editFinish, setEditFinish] = useState("");
  const [actionsExpanded, setActionsExpanded] = useState<boolean>(false);

  const handleColSort = (col: SortCol): void => {
    if (sortCol === col) {
      setSortDir(current => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const isShortListMode = subTasks.length > 0 && subTasks.length < 4;

  const sortedTasks = useMemo(() => {
    const next = subTasks.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "wbs":
          cmp = a.sortOrder - b.sortOrder;
          break;
        case "task":
          cmp = (a.task || "").localeCompare(b.task || "");
          break;
        case "complete":
          cmp = (a.complete || 0) - (b.complete || 0);
          break;
        case "start":
          cmp = toMs(a.start) - toMs(b.start);
          break;
        case "finish":
          cmp = toMs(a.finish) - toMs(b.finish);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return next;
  }, [subTasks, sortCol, sortDir]);

  const selectedItem = selectedSubTaskId
    ? subTasks.find(item => item.id === selectedSubTaskId)
    : undefined;

  const startQuickEdit = (item: ISubprocessSubTask): void => {
    onSelect(item.id);
    setEditTaskTitle(item.task || "");
    setEditPercentComplete(item.complete || 0);
    setEditStart(toDateInputValue(item.start));
    setEditFinish(toDateInputValue(item.finish));
    onStartQuickEdit(item.id);
  };

  const handleQuickSave = (item: ISubprocessSubTask): void => {
    const complete = Math.max(0, Math.min(100, Math.floor(editPercentComplete || 0)));
    const finish = complete === 100 && !editFinish ? getTodayDateInputValue() : editFinish;
    const actualFinish =
      complete === 100
        ? (item.actualFinish || getTodayDateInputValue())
        : "";

    onSaveQuickEdit(item.id, {
      task: editTaskTitle || item.task,
      complete,
      start: editStart,
      finish,
      actualFinish,
    });
  };

  const handleCompleteActionClick = (item: ISubprocessSubTask): void => {
    if (Math.floor(item.complete || 0) >= 100) {
      startQuickEdit(item);
      return;
    }

    const today = getTodayDateInputValue();
    onSelect(item.id);
    onSaveQuickEdit(item.id, {
      task: item.task,
      duration: item.duration,
      complete: 100,
      start: item.start,
      finish: item.finish || today,
      actualFinish: today,
    });
  };

  return (
    <div className={styles.listShell}>
      <div className={styles.listToolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarBadge}>Subprocess</span>
          <span className={styles.toolbarStat}>{subTasks.length} subtasks</span>
          {selectedItem && (
            <span className={styles.toolbarSelection}>
              Selected: <strong>{selectedItem.wbs}</strong>
            </span>
          )}
        </div>
        <div className={styles.toolbarHint}>
          Click a subtask name to open its detail card.
        </div>
      </div>

      <div className={`${dashboardStyles.tableViewport} ${isShortListMode ? dashboardStyles.tableViewportShort : ""}`}>
        <table className={`${dashboardStyles.ed2Table} ${styles.subprocessTable} ${actionsExpanded ? dashboardStyles.ed2TableActionsExpanded : ""}`}>
          <thead>
            <tr>
              <th
                className={`${dashboardStyles.colWbs} ${styles.subtaskWbs} ${dashboardStyles.colSortable}`}
                onClick={() => handleColSort("wbs")}
                title="Sort by WBS"
              >
                WBS<SortIcon active={sortCol === "wbs"} dir={sortDir} />
              </th>
              <th className={dashboardStyles.colText}>
                <div className={dashboardStyles.colTextHeader}>
                  <span
                    className={dashboardStyles.colSortable}
                    onClick={() => handleColSort("task")}
                    title="Sort by Task"
                  >
                    Task<SortIcon active={sortCol === "task"} dir={sortDir} />
                  </span>
                </div>
              </th>
              <th
                className={`${dashboardStyles.colDate} ${dashboardStyles.colSortable}`}
                onClick={() => handleColSort("complete")}
                title="Sort by Completed"
              >
                Completed<SortIcon active={sortCol === "complete"} dir={sortDir} />
              </th>
              <th
                className={`${dashboardStyles.colDateNarrow} ${dashboardStyles.colSortable}`}
                onClick={() => handleColSort("start")}
                title="Sort by Start"
              >
                Start<SortIcon active={sortCol === "start"} dir={sortDir} />
              </th>
              <th
                className={`${dashboardStyles.colDateNarrow} ${dashboardStyles.colSortable}`}
                onClick={() => handleColSort("finish")}
                title="Sort by Finish"
              >
                Finish<SortIcon active={sortCol === "finish"} dir={sortDir} />
              </th>
              <th className={`${dashboardStyles.colEvidence} ${actionsExpanded ? dashboardStyles.colEvidenceCompact : ""}`}>Evidence</th>
              <th className={`${dashboardStyles.colActions} ${dashboardStyles.actionsFixed}`}>
                <div className={dashboardStyles.actionsHeader}>
                  <span>Actions</span>
                  <button
                    type="button"
                    className={`${dashboardStyles.actionsToggle} ${actionsExpanded ? dashboardStyles.actionsToggleOn : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionsExpanded(current => !current);
                    }}
                    aria-pressed={actionsExpanded}
                    aria-label={actionsExpanded ? "Hide action toolbar" : "Show action toolbar"}
                    title={actionsExpanded ? "Show regular evidence column" : "Show action toolbar"}
                  >
                    <span />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((item) => {
              const completionEvidence = getCompletionEvidence(item.evidence ?? []);
              const isComplete = Math.floor(item.complete) === 100;
              const isEditing = editingSubTaskId === item.id;
              const visibleIndex = subTasks.findIndex(entry => entry.id === item.id);
              const moveDisabled = movingSubTaskId === item.id;

              return (
                <React.Fragment key={item.id}>
                  <tr
                    className={[
                      dashboardStyles.taskRowSubprocess,
                      item.id === selectedSubTaskId ? dashboardStyles.taskRowActive : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => onSelect(item.id)}
                  >
                  <td className={`${dashboardStyles.colWbs} ${styles.subtaskWbs}`}>{item.wbs}</td>
                  <td className={dashboardStyles.colText}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTaskTitle}
                        onChange={(e) => setEditTaskTitle(e.target.value)}
                        className={dashboardStyles.inputSmall}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Subtask title"
                      />
                    ) : (
                      <div className={styles.subtaskNameWrap}>
                        <span
                          className={[
                            dashboardStyles.taskName,
                            dashboardStyles.subprocessTaskName,
                            styles.subtaskName,
                            item.id === selectedSubTaskId ? dashboardStyles.taskNameActive : "",
                            (item.task || "").startsWith("New subtask") ? dashboardStyles.taskNameNew : "",
                          ].filter(Boolean).join(" ")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(item.id);
                            onEditDetail?.(item.id);
                          }}
                        >
                          {item.task || "Untitled subtask"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className={dashboardStyles.cellComplete}>
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          value={editPercentComplete}
                          onChange={(e) => setEditPercentComplete(Number(e.target.value) || 0)}
                          className={dashboardStyles.inputSmall}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="% Complete"
                        />
                        %
                      </>
                    ) : (
                      <span>{Math.floor(item.complete)}%</span>
                    )}
                  </td>
                  <td className={dashboardStyles.colDateNarrow}>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={dashboardStyles.inputSmall}
                      />
                    ) : (
                      item.start || ""
                    )}
                  </td>
                  <td className={dashboardStyles.colDateNarrow}>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editFinish}
                        onChange={(e) => setEditFinish(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={dashboardStyles.inputSmall}
                      />
                    ) : (
                      item.finish || ""
                    )}
                  </td>
                  <td className={`${dashboardStyles.colEvidence} ${actionsExpanded ? dashboardStyles.colEvidenceCompact : ""}`} onClick={(e) => e.stopPropagation()}>
                    {isEditing && onUploadEvidenceFile && onSaveEvidenceEntries ? (
                      <EvidenceUploadButton
                        evidence={item.evidence ?? []}
                        taskTitle={item.task || "Subtask"}
                        currentUser={currentUserDisplayName ?? ""}
                        onUploadFile={onUploadEvidenceFile}
                        onSave={(entries) => onSaveEvidenceEntries(item.id, entries)}
                        isEvidenceOfCompletion={true}
                        label={
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "inherit" }}>
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: "1.1em", height: "1.1em", flexShrink: 0 }} aria-hidden="true">
                              <path d="M8 10V3" />
                              <path d="M5 6l3-3 3 3" />
                              <path d="M3 13h10" />
                            </svg>
                            Upload evidence
                          </span>
                        }
                        className={dashboardStyles.evidenceUploadBtn}
                      />
                    ) : completionEvidence ? (
                      <a
                        href={completionEvidence.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${dashboardStyles.evidenceLink} ${actionsExpanded ? dashboardStyles.evidenceIconLink : ""}`}
                        title={completionEvidence.note || completionEvidence.fileName}
                      >
                        {actionsExpanded ? (
                          <svg viewBox="0 0 16 16" aria-label={completionEvidence.fileName}>
                            <path d="M5 2h4l3 3v9H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                            <path d="M9 2v3h3" />
                          </svg>
                        ) : (
                          completionEvidence.fileName
                        )}
                      </a>
                    ) : isComplete ? (
                      <span
                        className={dashboardStyles.evidenceAlert}
                        title="Subtask is 100% complete but has no Evidence of Completion"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, verticalAlign: "middle" }} aria-hidden="true">
                          <path d="M8 2L1.5 13.5h13L8 2z" />
                          <path d="M8 7v3M8 11.5v.5" />
                        </svg>
                      </span>
                    ) : null}
                  </td>
                  <td className={`${dashboardStyles.colActions} ${dashboardStyles.actionsFixed}`}>
                    {!isEditing && (
                      actionsExpanded ? (
                        <div className={dashboardStyles.actionsToolbar}>
                          <button
                            type="button"
                            className={dashboardStyles.toolbarIconButton}
                            title="Add subtask"
                            aria-label="Add subtask"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddBelow(item.id);
                            }}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
                          </button>
                          <button
                            type="button"
                            className={`${dashboardStyles.toolbarIconButton} ${dashboardStyles.toolbarDangerButton}`}
                            title="Remove subtask"
                            aria-label="Remove subtask"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Delete subtask "${item.task || item.wbs}"?`)) {
                                onRemove(item.id);
                              }
                            }}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M6 4V3h4v1M5 6l.4 7h5.2L11 6" /></svg>
                          </button>
                          <span className={dashboardStyles.toolbarSeparator} />
                          {(["first", "up", "down", "last"] as const).map((direction) => {
                            const disabled =
                              moveDisabled ||
                              (direction === "first" && visibleIndex === 0) ||
                              (direction === "up" && visibleIndex === 0) ||
                              (direction === "down" && visibleIndex === subTasks.length - 1) ||
                              (direction === "last" && visibleIndex === subTasks.length - 1);
                            return (
                              <button
                                key={direction}
                                type="button"
                                className={dashboardStyles.toolbarIconButton}
                                title={`Move ${direction}`}
                                aria-label={`Move ${direction}`}
                                disabled={disabled}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMove(item.id, direction);
                                }}
                              >
                                {direction === "first" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h8M8 5l-4 4h3v4h2V9h3L8 5z" /></svg>}
                                {direction === "up" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4l-4 5h3v4h2V9h3L8 4z" /></svg>}
                                {direction === "down" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12l4-5H9V3H7v4H4l4 5z" /></svg>}
                                {direction === "last" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 13h8M8 11l4-4H9V3H7v4H4l4 4z" /></svg>}
                              </button>
                            );
                          })}
                          <span className={dashboardStyles.toolbarSeparator} />
                          <button
                            type="button"
                            className={[
                              dashboardStyles.toolbarIconButton,
                              dashboardStyles.actionCompleteTrigger,
                              isComplete ? dashboardStyles.actionCompleteTriggerDone : "",
                            ].filter(Boolean).join(" ")}
                            title={isComplete ? "Open quick update" : "Mark complete"}
                            aria-label={isComplete ? "Open quick update" : "Mark complete"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompleteActionClick(item);
                            }}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5a.5.5 0 0 1 .5-.5h7.1c.5 0 .76.6.41.95L10.2 4.75l1.81 1.8a.56.56 0 0 1-.41.95H5v6a.5.5 0 0 1-1 0v-11z" /></svg>
                          </button>
                          <button
                            type="button"
                            className={dashboardStyles.toolbarIconButton}
                            title="Edit subtask"
                            aria-label="Edit subtask"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(item.id);
                              onEditDetail?.(item.id);
                            }}
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5zM3 14h10" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className={dashboardStyles.actionButtonsRow}>
                          {onUploadEvidenceFile && onSaveEvidenceEntries ? (
                            <EvidenceUploadButton
                              evidence={item.evidence ?? []}
                              taskTitle={item.task || "Subtask"}
                              currentUser={currentUserDisplayName ?? ""}
                              onUploadFile={onUploadEvidenceFile}
                              onSave={(entries) => onSaveEvidenceEntries(item.id, entries)}
                              isEvidenceOfCompletion={true}
                              label={
                                <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M8 10V3" />
                                  <path d="M5 6l3-3 3 3" />
                                  <path d="M3 13h10" />
                                </svg>
                              }
                              className={`${dashboardStyles.iconButton} ${dashboardStyles.actionEvidenceUploadTrigger}`}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`${dashboardStyles.iconButton} ${dashboardStyles.actionEvidenceUploadTrigger}`}
                              title="Upload Evidence of Completion"
                              aria-label="Upload Evidence of Completion"
                              disabled
                            >
                              <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M8 10V3" />
                                <path d="M5 6l3-3 3 3" />
                                <path d="M3 13h10" />
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            className={[
                              dashboardStyles.iconButton,
                              dashboardStyles.actionAddTrigger,
                              dashboardStyles.actionCompleteTrigger,
                              isComplete ? dashboardStyles.actionCompleteTriggerDone : "",
                            ].filter(Boolean).join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompleteActionClick(item);
                            }}
                            title={isComplete ? "Open quick update" : "Mark complete"}
                            aria-label={isComplete ? "Open quick update" : "Mark complete"}
                          >
                            <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" aria-hidden="true">
                              <path d="M4 2.5a.5.5 0 0 1 .5-.5h7.1c.5 0 .76.6.41.95L10.2 4.75l1.81 1.8a.56.56 0 0 1-.41.95H5v6a.5.5 0 0 1-1 0v-11z" />
                            </svg>
                          </button>
                        </div>
                      )
                    )}
                    {isEditing && (
                      <div className={dashboardStyles.quickEditActions} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Save quick edit"
                          aria-label="Save quick edit"
                          onClick={() => handleQuickSave(item)}
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M3 8.4 6.4 12 13 4" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Cancel quick edit"
                          aria-label="Cancel quick edit"
                          onClick={onCancelQuickEdit}
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M4 4 12 12M12 4 4 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                  </tr>
                  {detailSubTaskId === item.id && detailCard && (
                    <tr className={styles.subtaskDetailRow}>
                      <td colSpan={7} className={styles.subtaskDetailCell}>
                        {detailCard}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sortedTasks.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.emptyState}>
                  No subtasks defined yet. Use Add to create the first subprocess step.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SubprocessList;
