import * as React from "react";
import { useState, useEffect } from "react";
import { ITaskListItem } from "../../../models";
import { GetDelay } from "../utils/GetDelay";
import { GetFormatDate } from "../utils/GetFormatDate";
import { compareWbs } from "../utils/ParseWBS";
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
  onSelectItem: (
    item: ITaskListItem,
    group: string,
    mode?: "list" | "list-edit" | "list-save" | "list-delete" | "list-create",
    payload?: string
  ) => void;
}

type SortCol = "wbs" | "task" | "complete" | "start" | "finish";
type SortDir = "asc" | "desc";

const SortIcon = ({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) => (
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
}: ListGroupProps) => {
  const [editTaskTitle, setEditTaskTitle] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
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

  const handleColSort = (col: SortCol) => {
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

  const sortedTasks = textFiltered.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case "wbs":
        cmp = compareWbs(a.Title || "", b.Title || "");
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

                  {/* ACTIONS */}
                  <td className={`${styles.colActions} ${styles.actionsFixed}`}>
                    {/* Add row */}
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
                    {(() => {
                      const completionEvidence = item.Evidence?.find(e => e.isEvidenceOfCompletion);
                      const isComplete = Math.floor(item.Complete) === 100;
                      if (isComplete && completionEvidence) {
                        return (
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
                        );
                      }
                      if (isComplete && !completionEvidence) {
                        return (
                          <span
                            className={styles.wbsEvidenceAlert}
                            title="Task is 100% complete but has no Evidence of Completion"
                          >
                            !
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <div className={styles.actionContextMenu}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item, "task", "list-create");
                        }}
                        disabled={!!creatingTaskId}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete task "${item.Task}"?`)) {
                            onSelectItem(item, "task", "list-delete");
                          }
                        }}
                        disabled={!!creatingTaskId || !!deletingTaskId}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startQuickEdit(item);
                        }}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(item, "task", "list-edit");
                        }}
                      >
                        Edit
                      </button>
                    </div>
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
                    {/* Delete row */}
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
                  </td>

                  </tr>
                  {item.Id === selectedTaskId && expandedContent && (
                    <tr className={styles["task-card-row"]}>
                      <td colSpan={6} className={styles["task-card-cell"]}>
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
