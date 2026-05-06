import * as React from "react";
import { useState, useEffect } from "react";
import { ITaskListItem } from "../../../models";
import { IEvidenceEntry } from "../../../models/ITaskLogFields";
import { GetDelay } from "../utils/GetDelay";
import { GetFormatDate } from "../utils/GetFormatDate";
import { compareWbs } from "../utils/ParseWBS";
import EvidenceUploadButton from "./EvidenceUploadButton";
import styles from "./ProjectDashboard.module.scss";

interface ListGroupProps {
  tasks: ITaskListItem[];
  heading: string;
  projectSiteURL?: string;
  showDetails?: boolean | true;
  isPlanner?: boolean;
  selectedTaskId?: string;
  expandedContent?: React.ReactNode;
  creatingTaskId?: string;
  deletingTaskId?: string;
  onSortedTasksChange?: (tasks: ITaskListItem[]) => void;
  onReload?: () => void;
  onSave: (itemId: string, payload?: string) => void;
  /** Upload a file to evidence storage — enables the upload button in Complete mode */
  onUploadFile?: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
  /** Persist updated Evidence entries for a task */
  onSaveEvidence?: (taskId: string, entries: IEvidenceEntry[]) => Promise<void>;
  currentUserDisplayName?: string;
  /** Reorder a task within its gate */
  onMoveTask?: (taskId: string, gate: string, direction: 'first' | 'up' | 'down' | 'last') => Promise<void>;
  onSelectItem: (
    item: ITaskListItem,
    group: string,
    mode?: "list" | "list-edit" | "list-save" | "list-delete" | "list-create",
    payload?: string
  ) => void;
}

type SortCol = "wbs" | "task" | "complete" | "start" | "finish";
type SortDir = "asc" | "desc";

const SortIcon = ({ col, active, dir }: { col: string; active: boolean; dir: SortDir }): JSX.Element => (
  <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
    {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
  </span>
);

const ListTasks = ({
  tasks,
  heading,
  onSave,
  onSelectItem,
  showDetails,
  isPlanner,
  selectedTaskId,
  expandedContent,
  creatingTaskId,
  deletingTaskId,
  onSortedTasksChange,
  onReload,
  onUploadFile,
  onSaveEvidence,
  currentUserDisplayName,
  onMoveTask,
}: ListGroupProps): JSX.Element => {
  const [editTaskTitle, setEditTaskTitle] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId]   = useState<string | null>(null);
  const [editPercentComplete, setEditPercentComplete] = useState<number>(0);
  const [editStart, setEditStart] = useState<string>("");
  const [editFinish, setEditFinish] = useState<string>("");
  const [sortCol, setSortCol] = useState<SortCol>("wbs");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [taskFilter, setTaskFilter] = useState<string>("");

  // Helper: Date/ISO/string -> YYYY-MM-DD
  const toDateInputValue = (value: any): string => {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const toMs = (value: any): number => {
    if (!value) return 0;
    const d = new Date(value);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const handleColSort = (col: SortCol): void => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const visibilityFiltered = showDetails
    ? tasks
    : tasks.filter(
        (item) =>
          Math.floor(item.Complete) < 100 &&
          GetDelay(item.Finish, item.ActualFinish) > 0
      );

  const textFiltered = taskFilter.trim()
    ? visibilityFiltered.filter((item) =>
        (item.Task || "").toLowerCase().includes(taskFilter.trim().toLowerCase())
      )
    : visibilityFiltered;

  // Use sortOrder when available (manual order), fall back to WBS
  const gateHasSortOrder = textFiltered.some(t => t.sortOrder !== undefined);

  const sortedTasks = textFiltered.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case "wbs":
        if (gateHasSortOrder) {
          cmp = (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity);
        } else {
          cmp = compareWbs(a.Title || "", b.Title || "");
        }
        break;
      case "task":
        cmp = (a.Task || "").localeCompare(b.Task || "");
        break;
      case "complete":
        cmp = (a.Complete || 0) - (b.Complete || 0);
        break;
      case "start":
        cmp = toMs(a.Start) - toMs(b.Start);
        break;
      case "finish":
        cmp = toMs(a.Finish) - toMs(b.Finish);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Report sorted order to parent for navigation (prev/next)
  const sortedTaskIds = sortedTasks.map(t => t.Id).join(',');
  useEffect(() => {
    onSortedTasksChange?.(sortedTasks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTaskIds]);

  const getDelayClassName = (task: ITaskListItem): string => {
    if (Math.floor(task.Complete) >= 100) return "";
    const delayDays = GetDelay(task.Finish);
    if (delayDays > 15) return styles["task-row-delay-critical"];
    if (delayDays > 0) return styles["task-row-delay-warning"];
    return "";
  };

  const startQuickEdit = (task: ITaskListItem): void => {
    setEditingTaskId(task.Id);
    setEditTaskTitle(task.Task || "");
    setEditPercentComplete(task.Complete || 0);
    setEditStart(toDateInputValue(task.Start));
    setEditFinish(toDateInputValue(task.Finish));
  };

  const cancelQuickEdit = (): void => {
    setEditingTaskId(null);
    setEditTaskTitle("");
    setEditPercentComplete(0);
    setEditStart("");
    setEditFinish("");
  };

  const handleQuickSave = (task: ITaskListItem): void => {
    let actualFinish: Date | null | undefined;

    if (editPercentComplete === 100) {
      actualFinish = task.ActualFinish ? new Date(task.ActualFinish) : new Date();
    } else {
      actualFinish = null;
    }

    const payload = JSON.stringify({
      Id: task.Id,
      Gate: task.Gate,
      Task: editTaskTitle || task.Task,
      Complete: editPercentComplete,
      Start: editStart || null,
      Finish: editFinish || null,
      ActualFinish: actualFinish,
    });

    onSave(task.Id, payload);
    cancelQuickEdit();
  };

  return (
    <>
      {(showDetails
        ? tasks.length
        : tasks.filter(
            (item) =>
              Math.floor(item.Complete) < 100 &&
              Math.floor(item.Complete) > 0
          ).length) > 0 && (
        <div>
          <div className={styles.taskSectionHeadingRow}>
            {onReload && (
              <button
                type="button"
                className={styles.taskSectionReloadBtn}
                onClick={onReload}
              >
                Reload Job
              </button>
            )}
            <p className={styles.taskSectionHeading}>{heading}</p>
          </div>
          <div className={styles.tableViewport}>
            <table className={styles.ed2Table}>
              <thead>
                <tr>
                  <th
                    className={`${styles.colWbs} ${styles.colSortable}`}
                    onClick={() => handleColSort("wbs")}
                    title="Sort by WBS"
                  >
                    WBS<SortIcon col="wbs" active={sortCol === "wbs"} dir={sortDir} />
                  </th>
                  <th className={styles.colText}>
                    <div className={styles.colTextHeader}>
                      <span
                        className={styles.colSortable}
                        onClick={() => handleColSort("task")}
                        title="Sort by Task"
                      >
                        Task<SortIcon col="task" active={sortCol === "task"} dir={sortDir} />
                      </span>
                      <input
                        type="text"
                        value={taskFilter}
                        onChange={(e) => setTaskFilter(e.target.value)}
                        placeholder="Filter..."
                        className={styles["input-filter"]}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </th>
                  <th
                    className={`${styles.colDate} ${styles.colSortable}`}
                    onClick={() => handleColSort("complete")}
                    title="Sort by Completed"
                  >
                    Completed<SortIcon col="complete" active={sortCol === "complete"} dir={sortDir} />
                  </th>
                  <th
                    className={`${styles.colDate} ${styles.colSortable}`}
                    onClick={() => handleColSort("start")}
                    title="Sort by Start"
                  >
                    Start<SortIcon col="start" active={sortCol === "start"} dir={sortDir} />
                  </th>
                  <th
                    className={`${styles.colDate} ${styles.colSortable}`}
                    onClick={() => handleColSort("finish")}
                    title="Sort by Finish"
                  >
                    Finish<SortIcon col="finish" active={sortCol === "finish"} dir={sortDir} />
                  </th>
                  <th className={styles.colEvidence}>
                    Evidence
                  </th>
                  <th className={`${styles.colActions} ${styles.actionsFixed}`}>

                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((item) => (
                  <React.Fragment key={item.Id}>
                  <tr
                    data-task-id={item.Id}
                    className={[
                      getDelayClassName(item),
                      item.Id === selectedTaskId ? styles["task-row-active"] : "",
                    ].filter(Boolean).join(" ")}
                  >
                  {/* WBS */}
                  <td className={styles.colWbs}>
                    {(() => {
                      const completionEvidence = item.Evidence?.find(e => e.isEvidenceOfCompletion) || {
                        fileUrl: "",
                        fileName: "",
                        note: "",
                        isEvidenceOfCompletion: false,
                      };
                      const isComplete = Math.floor(item.Complete) === 100;
                      return (
                        <span className={styles.wbsCell}>
                          {item.Title}
                          {false && isComplete && completionEvidence && (
                            <a
                              href={completionEvidence.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={completionEvidence.note || completionEvidence.fileName || "Evidence of Completion"}
                              onClick={(e) => e.stopPropagation()}
                              className={styles.wbsEvidenceLink}
                            >
                              <img
                                src={require("../assets/Document.png")}
                                alt="Evidence"
                                className={styles["icon-small"]}
                              />
                            </a>
                          )}
                          {false && isComplete && !completionEvidence && (
                            <span
                              className={styles.wbsEvidenceAlert}
                              title="Task is 100% complete but has no Evidence of Completion"
                            >
                              ⚠
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Task */}
                  <td className={styles.colText}>
                    {editingTaskId === item.Id ? (
                      <input
                        type="text"
                        value={editTaskTitle}
                        onChange={(e) => setEditTaskTitle(e.target.value)}
                        className={styles["input-small"]}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Task title"
                      />
                    ) : (
                      <span
                        className={[
                          styles.taskName,
                          item.Id === selectedTaskId ? styles["task-name-active"] : "",
                          (item.Task || "").startsWith("New task...") ? styles["task-name-new"] : "",
                        ].filter(Boolean).join(" ")}
                        onClick={(e) => { e.stopPropagation(); onSelectItem(item, "task", "list-edit"); }}
                      >{item.Task}</span>
                    )}
                  </td>

                  {/* % Completed */}
                  <td className={styles["cell-complete"]}>
                    {editingTaskId === item.Id ? (
                      <>
                        {isPlanner ? (
                          <select
                            value={editPercentComplete}
                            onChange={(e) =>
                              setEditPercentComplete(
                                Number(e.target.value) || 0
                              )
                            }
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
                            value={editPercentComplete}
                            onChange={(e) =>
                              setEditPercentComplete(
                                Number(e.target.value) || 0
                              )
                            }
                            className={styles["input-small"]}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="% Complete"
                          />
                        )}
                        %
                      </>
                    ) : (
                      <span>{Math.floor(item.Complete)}%</span>
                    )}
                  </td>

                  {/* Start */}
                  <td className={styles.colDate}>
                    {editingTaskId === item.Id ? (
                      <input
                        type="date"
                        value={editStart}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          if (editFinish && newStart) {
                            const [sy, sm, sd] = newStart.split("-").map(Number);
                            const [fy, fm, fd] = editFinish.split("-").map(Number);
                            const startUTC = Date.UTC(sy, sm - 1, sd);
                            const finishUTC = Date.UTC(fy, fm - 1, fd);

                            if (startUTC > finishUTC) {
                              alert(
                                "Start date cannot be later than Finish date."
                              );
                              return;
                            }
                          }
                          setEditStart(newStart);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={styles["input-small"]}
                      />
                    ) : (
                      GetFormatDate(item.Start)
                    )}
                  </td>

                  {/* Finish */}
                  <td className={styles.colDate}>
                    {editingTaskId === item.Id ? (
                      <input
                        type="date"
                        value={editFinish}
                        onChange={(e) => {
                          const newFinish = e.target.value;
                          if ((editStart || item.Start) && newFinish) {
                            const startValue = editStart || toDateInputValue(item.Start);
                            const [sy, sm, sd] = startValue.split("-").map(Number);
                            const [fy, fm, fd] = newFinish.split("-").map(Number);
                            const startUTC = Date.UTC(sy, sm - 1, sd);
                            const finishUTC = Date.UTC(fy, fm - 1, fd);

                            if (finishUTC < startUTC) {
                              alert(
                                "Finish date cannot be earlier than Start date."
                              );
                              return;
                            }
                          }
                          setEditFinish(newFinish);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={styles["input-small"]}
                      />
                    ) : (
                      GetFormatDate(item.Finish)
                    )}
                  </td>

                  {/* Evidence of Completion */}
                  {(() => {
                    const completionEvidence = item.Evidence?.find(e => e.isEvidenceOfCompletion);
                    const isComplete = Math.floor(item.Complete) === 100;
                    const isEditing  = editingTaskId === item.Id;

                    return (
                      <td className={styles.colEvidence} onClick={e => e.stopPropagation()}>
                        {isEditing && onUploadFile && onSaveEvidence ? (
                          <EvidenceUploadButton
                            evidence={item.Evidence ?? null}
                            taskTitle={item.Task ?? ''}
                            currentUser={currentUserDisplayName ?? ''}
                            onUploadFile={onUploadFile}
                            onSave={(entries) => onSaveEvidence(item.Id, entries)}
                            isEvidenceOfCompletion={true}
                            label={
                              <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:'inherit'}}>
                                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:'1.1em',height:'1.1em',flexShrink:0}} aria-hidden="true">
                                  <path d="M8 10V3"/>
                                  <path d="M5 6l3-3 3 3"/>
                                  <path d="M3 13h10"/>
                                </svg>
                                Upload evidence
                              </span>
                            }
                            className={styles.evidenceUploadBtn}
                          />
                        ) : completionEvidence ? (
                          <a
                            href={completionEvidence.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.evidenceLink}
                            title={completionEvidence.note || completionEvidence.fileName}
                          >
                            {completionEvidence.fileName}
                          </a>
                        ) : isComplete ? (
                          <span
                            className={styles.evidenceAlert}
                            title="Task is 100% complete but has no Evidence of Completion"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,verticalAlign:'middle'}} aria-hidden="true">
                              <path d="M8 2L1.5 13.5h13L8 2z"/>
                              <path d="M8 7v3M8 11.5v.5"/>
                            </svg>
                          </span>
                        ) : null}
                      </td>
                    );
                  })()}

                  {/* ACTIONS */}
                  <td className={`${styles.colActions} ${styles.actionsFixed}`}>
                    {editingTaskId !== item.Id && (
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item, "task", "list-create");
                      }}
                      title={creatingTaskId === item.Id ? "Creating…" : "Add / New row"}
                      disabled={!!creatingTaskId}
                    >
                      {creatingTaskId === item.Id ? (
                        <svg className={`${styles["icon-small"]} ${styles.spinning}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 15" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M8 3v10M3 8h10"/>
                        </svg>
                      )}
                    </button>
                    )}
                    {editingTaskId !== item.Id && <div className={styles.actionContextMenu}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item, "task", "list-create");
                        }}
                        disabled={!!creatingTaskId}
                      >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2v8M2 6h8"/></svg>
                        Add
                      </button>
                      <button
                        type="button"
                        className={styles["btn-danger"]}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete task "${item.Task}"?`)) {
                            onSelectItem(item, "task", "list-delete");
                          }
                        }}
                        disabled={!!creatingTaskId || !!deletingTaskId}
                      >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5h8M4.5 3.5V2.5h3v1M3.5 3.5l.5 6h4l.5-6"/></svg>
                        Remove
                      </button>
                      <div className={styles["ctx-separator"]} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startQuickEdit(item);
                        }}
                      >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 7.5 4.5 10 10 3"/></svg>
                        Complete
                      </button>
                      {(() => {
                        const files = item.Evidence?.filter(file => !!file.fileUrl) ?? [];
                        const completionEvidence = files.find(file => file.isEvidenceOfCompletion);
                        return (
                          <>
                            {completionEvidence && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(completionEvidence.fileUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
                                Evidence
                              </button>
                            )}
                            {files.length > 0 && (
                              <div className={styles.actionSubmenuWrap}>
                                <button type="button" onClick={(e) => e.stopPropagation()}>
                                  Files
                                </button>
                                <div className={styles.actionSubmenu}>
                                  {files.map((file, index) => (
                                    <button
                                      key={`${file.fileUrl}-${index}`}
                                      type="button"
                                      title={file.fileName || file.fileUrl}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(file.fileUrl, "_blank", "noopener,noreferrer");
                                      }}
                                    >
                                      {file.isEvidenceOfCompletion ? "Evidence: " : ""}
                                      {file.fileName || `File ${index + 1}`}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {onMoveTask && (
                        <div className={styles.actionSubmenuWrap}>
                          <button type="button" onClick={(e) => e.stopPropagation()} disabled={movingTaskId === item.Id}>
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v8M3 5l3-3 3 3M3 7l3 3 3-3"/></svg>
                            {movingTaskId === item.Id ? 'Moving…' : 'Move'}
                          </button>
                          <div className={styles.actionSubmenu}>
                            {(['first','up','down','last'] as const).map(dir => {
                              const gateItems = sortedTasks.filter(t => t.Gate === item.Gate);
                              const idx = gateItems.findIndex(t => t.Id === item.Id);
                              const disabled = movingTaskId === item.Id
                                || (dir === 'first' && idx === 0)
                                || (dir === 'up'    && idx === 0)
                                || (dir === 'down'  && idx === gateItems.length - 1)
                                || (dir === 'last'  && idx === gateItems.length - 1);
                              const labels: Record<string, string> = { first:'⏫ First', up:'▲ Up', down:'▼ Down', last:'⏬ Last' };
                              return (
                                <button
                                  key={dir}
                                  type="button"
                                  disabled={disabled}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMovingTaskId(item.Id);
                                    onMoveTask(item.Id, item.Gate, dir)
                                      .finally(() => setMovingTaskId(null));
                                  }}
                                >
                                  {labels[dir]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className={styles["ctx-separator"]} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item, "task", "list-edit");
                        }}
                      >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l2 2-6 6H2V8L8 2z"/></svg>
                        Edit
                      </button>
                    </div>}
                    {editingTaskId === item.Id && (
                      <div className={styles.quickEditActions}>
                        <button
                          type="button"
                          title="Save quick edit"
                          aria-label="Save quick edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickSave(item);
                          }}
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M3 8.4 6.4 12 13 4" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Cancel quick edit"
                          aria-label="Cancel quick edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelQuickEdit();
                          }}
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M4 4 12 12M12 4 4 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {/* Delete row — hidden in edit mode */}
                    {editingTaskId !== item.Id && (
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete task "${item.Task}"?`)) {
                          onSelectItem(item, "task", "list-delete");
                        }
                      }}
                      title={deletingTaskId === item.Id ? "Deleting…" : "Delete task"}
                      disabled={!!creatingTaskId || !!deletingTaskId}
                    >
                      {deletingTaskId === item.Id ? (
                        <svg className={`${styles["icon-small"]} ${styles.spinning}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 15" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <svg className={styles["icon-small"]} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 5h10M6 5V3h4v2M4.5 5l.7 8h6.6l.7-8"/>
                        </svg>
                      )}
                    </button>
                    )}
                  </td>

                  </tr>
                  {item.Id === selectedTaskId && expandedContent && (
                    <tr className={styles["task-card-row"]}>
                      <td colSpan={7} className={styles["task-card-cell"]}>
                        <div className={styles["task-card-shell"]}>
                          {expandedContent}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default ListTasks;
