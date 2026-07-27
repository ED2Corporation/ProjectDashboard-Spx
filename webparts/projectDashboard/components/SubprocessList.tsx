import * as React from "react";
import { useMemo, useState } from "react";
import { IEvidenceEntry } from "../../../models/ITaskLogFields";
import { ISubprocessSubTask } from "../utils/TaskDescriptionBlob";
import EvidenceUploadButton from "./EvidenceUploadButton";
import dashboardStyles from "./ProjectDashboard.module.scss";
import styles from "./SubprocessCard.module.scss";

type SortCol = "wbs" | "task" | "complete" | "start" | "finish";
type SortDir = "asc" | "desc";
type MoveDirection = "first" | "up" | "down" | "last";
type ActionMenuStyle = React.CSSProperties & Record<"--menu-notch-offset" | "--menu-short-shift", string>;

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
  const [actionMenuUpKey, setActionMenuUpKey] = useState<string | null>(null);
  const [actionMenuDownKey, setActionMenuDownKey] = useState<string | null>(null);
  const [actionMenuShortKey, setActionMenuShortKey] = useState<string | null>(null);
  const [actionMenuShortOffset, setActionMenuShortOffset] = useState<Record<string, string>>({});
  const [actionMenuShortShift, setActionMenuShortShift] = useState<Record<string, string>>({});
  const [submenuShortKey, setSubmenuShortKey] = useState<string | null>(null);
  const [submenuUpKey, setSubmenuUpKey] = useState<string | null>(null);
  const [submenuDownKey, setSubmenuDownKey] = useState<string | null>(null);

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

  const handleSubmenuEnter = (
    key: string,
    event: React.MouseEvent<HTMLDivElement>
  ): void => {
    const wrap = event.currentTarget;
    const submenu = wrap.querySelector(`.${dashboardStyles.actionSubmenu}`) as HTMLDivElement | null;
    if (!submenu) return;

    const itemId = key.replace(/^move-/, "");
    const hoveredIndex = sortedTasks.findIndex(task => task.id === itemId);
    const shouldOpenDown = !isShortListMode && hoveredIndex >= 0 && hoveredIndex <= 1;
    const shouldOpenUp = !isShortListMode && hoveredIndex >= Math.max(0, sortedTasks.length - 2);

    setSubmenuShortKey(current => (current === key && isShortListMode) ? current : (isShortListMode ? key : null));
    setSubmenuUpKey(current => (current === key && shouldOpenUp) ? current : (shouldOpenUp ? key : null));
    setSubmenuDownKey(current => (current === key && shouldOpenDown) ? current : (shouldOpenDown ? key : null));
  };

  const handleActionMenuEnter = (
    key: string,
    event: React.MouseEvent<HTMLElement>
  ): void => {
    const cell = event.currentTarget.closest(`.${dashboardStyles.colActions}`) as HTMLElement | null;
    const menu = cell?.querySelector(`.${dashboardStyles.actionContextMenu}`) as HTMLDivElement | null;
    if (!cell || !menu) return;

    const itemId = key.replace("actions-", "");
    const hoveredIndex = sortedTasks.findIndex(task => task.id === itemId);
    const shouldOpenDown = !isShortListMode && hoveredIndex >= 0 && hoveredIndex <= 1;
    const shouldOpenUp = !isShortListMode && hoveredIndex >= Math.max(0, sortedTasks.length - 2);
    if (isShortListMode) {
      const notchOffset = `${54 + Math.max(0, hoveredIndex) * 28}px`;
      const shortShift = `${32 + Math.max(0, hoveredIndex) * 28}px`;
      setActionMenuShortOffset(current => ({ ...current, [key]: notchOffset }));
      setActionMenuShortShift(current => ({ ...current, [key]: shortShift }));
    }

    setActionMenuShortKey(current => (current === key && isShortListMode) ? current : (isShortListMode ? key : null));
    setActionMenuUpKey(current => (current === key && shouldOpenUp) ? current : (shouldOpenUp ? key : null));
    setActionMenuDownKey(current => (current === key && shouldOpenDown) ? current : (shouldOpenDown ? key : null));
  };

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
    const actualFinish =
      editPercentComplete === 100
        ? (item.actualFinish || new Date().toISOString().slice(0, 10))
        : "";

    onSaveQuickEdit(item.id, {
      task: editTaskTitle || item.task,
      complete: editPercentComplete,
      start: editStart,
      finish: editFinish,
      actualFinish,
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
        <table className={dashboardStyles.ed2Table}>
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
                className={`${dashboardStyles.colDate} ${dashboardStyles.colSortable}`}
                onClick={() => handleColSort("start")}
                title="Sort by Start"
              >
                Start<SortIcon active={sortCol === "start"} dir={sortDir} />
              </th>
              <th
                className={`${dashboardStyles.colDate} ${dashboardStyles.colSortable}`}
                onClick={() => handleColSort("finish")}
                title="Sort by Finish"
              >
                Finish<SortIcon active={sortCol === "finish"} dir={sortDir} />
              </th>
              <th className={dashboardStyles.colEvidence}>Evidence</th>
              <th className={`${dashboardStyles.colActions} ${dashboardStyles.actionsFixed}`}></th>
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
                  <td className={dashboardStyles.colDate}>
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
                  <td className={dashboardStyles.colDate}>
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
                  <td className={dashboardStyles.colEvidence} onClick={(e) => e.stopPropagation()}>
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
                        className={dashboardStyles.evidenceLink}
                        title={completionEvidence.note || completionEvidence.fileName}
                      >
                        {completionEvidence.fileName}
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
                      <div className={dashboardStyles.actionButtonsRow}>
                        <div
                          className={dashboardStyles.actionMenuArea}
                          onMouseEnter={(e) => handleActionMenuEnter(`actions-${item.id}`, e)}
                        >
                          <button
                            type="button"
                            className={`${dashboardStyles.iconButton} ${dashboardStyles.actionMenuTrigger}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Open actions menu"
                            aria-label="Open actions menu"
                          >
                            <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                              <path d="M3 4h10M3 8h10M3 12h10" />
                            </svg>
                          </button>
                          <div
                            className={[
                              dashboardStyles.actionContextMenu,
                              actionMenuShortKey === `actions-${item.id}` ? dashboardStyles.actionContextMenuShort : "",
                              actionMenuDownKey === `actions-${item.id}` ? dashboardStyles.actionContextMenuDown : "",
                              actionMenuUpKey === `actions-${item.id}` ? dashboardStyles.actionContextMenuUp : "",
                            ].filter(Boolean).join(" ")}
                            style={actionMenuShortKey === `actions-${item.id}`
                              ? ({
                                  "--menu-notch-offset": actionMenuShortOffset[`actions-${item.id}`] ?? "22px",
                                  "--menu-short-shift": actionMenuShortShift[`actions-${item.id}`] ?? "0px",
                                } as ActionMenuStyle)
                              : undefined}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => onAddBelow(item.id)}
                            >
                              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2v8M2 6h8" /></svg>
                              Add
                            </button>
                            <button
                              type="button"
                              className={dashboardStyles.btnDanger}
                              onClick={() => {
                                if (window.confirm(`Delete subtask "${item.task || item.wbs}"?`)) {
                                  onRemove(item.id);
                                }
                              }}
                            >
                              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5h8M4.5 3.5V2.5h3v1M3.5 3.5l.5 6h4l.5-6" /></svg>
                              Remove
                            </button>
                            <div className={dashboardStyles.ctxSeparator} />
                            <button
                              type="button"
                              onClick={() => startQuickEdit(item)}
                            >
                              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 7.5 4.5 10 10 3" /></svg>
                              Complete
                            </button>
                            {onEditDetail && (
                              <button
                                type="button"
                                onClick={() => onEditDetail(item.id)}
                              >
                                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l2 2-6 6H2V8L8 2z" /></svg>
                                Edit
                              </button>
                            )}
                            <div
                              className={dashboardStyles.actionSubmenuWrap}
                              onMouseEnter={(e) => handleSubmenuEnter(`move-${item.id}`, e)}
                            >
                              <button type="button" disabled={moveDisabled}>
                                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v8M3 5l3-3 3 3M3 7l3 3 3-3" /></svg>
                                {moveDisabled ? "Moving..." : "Move"}
                              </button>
                              <div
                                className={[
                                  dashboardStyles.actionSubmenu,
                                  submenuShortKey === `move-${item.id}` ? dashboardStyles.actionSubmenuShort : "",
                                  submenuDownKey === `move-${item.id}` ? dashboardStyles.actionSubmenuDown : "",
                                  submenuUpKey === `move-${item.id}` ? dashboardStyles.actionSubmenuUp : "",
                                ].filter(Boolean).join(" ")}
                              >
                                {(["first", "up", "down", "last"] as const).map((direction) => {
                                  const disabled =
                                    moveDisabled ||
                                    (direction === "first" && visibleIndex === 0) ||
                                    (direction === "up" && visibleIndex === 0) ||
                                    (direction === "down" && visibleIndex === subTasks.length - 1) ||
                                    (direction === "last" && visibleIndex === subTasks.length - 1);
                                  const labels: Record<MoveDirection, string> = {
                                    first: "First",
                                    up: "Up",
                                    down: "Down",
                                    last: "Last",
                                  };
                                  return (
                                    <button
                                      key={direction}
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => onMove(item.id, direction)}
                                    >
                                      {labels[direction]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`${dashboardStyles.iconButton} ${dashboardStyles.actionAddTrigger}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddBelow(item.id);
                          }}
                          title="Add subtask below"
                        >
                          <svg className={dashboardStyles.iconSmall} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M8 3v10M3 8h10" />
                          </svg>
                        </button>
                      </div>
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
