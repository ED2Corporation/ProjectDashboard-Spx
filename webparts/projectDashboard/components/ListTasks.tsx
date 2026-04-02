import * as React from "react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    console.log("[ListTasks] Rendering WBS column", sortedTasks.map(task => ({
      Id: task.Id,
      Gate: task.Gate,
      Task: task.Task,
      Title: task.Title,
    })));
  }, [sortedTasks]);

  const getDelayClassName = (task: ITaskListItem): string => {
    if (Math.floor(task.Complete) >= 100) return "";
    const delayDays = GetDelay(task.Finish);
    if (delayDays > 15) return styles["task-row-delay-critical"];
    if (delayDays > 0) return styles["task-row-delay-warning"];
    return "";
  };

  // handleSave lives inside the component and uses the current editing state
  const handleSave = (task: ITaskListItem) => {
    let actualFinish: Date | null | undefined;

    if (editPercentComplete === 100) {
      if (!task.ActualFinish) {
        actualFinish = new Date();
      } else {
        actualFinish = new Date(task.ActualFinish);
      }
    } else {
      actualFinish = null;
    }
    const data = {
      Id: task.Id,
      Gate: task.Gate,
      Task: editTaskTitle || task.Task,
      Complete: editPercentComplete,
      Start: editStart || null,
      Finish: editFinish || null,
      ActualFinish: actualFinish,
    };

    const payload = JSON.stringify(data);
    onSave(task.Id, payload);
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
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((item) => (
                <React.Fragment key={item.Id}>
                <tr
                  className={[
                    getDelayClassName(item),
                    item.Id === selectedTaskId ? styles["task-row-active"] : "",
                  ].filter(Boolean).join(" ")}
                >
                  {/* WBS */}
                  <td className={styles.colWbs}>{item.Title}</td>

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
                        className={`${styles.taskName} ${item.Id === selectedTaskId ? styles["task-name-active"] : ""}`}
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
                    {/* New in same gate */}
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item, "task", "list-create");
                      }}
                      title="Add / New row"
                    >
                      <img
                        src={require("../assets/Create.png")}
                        alt="new"
                        className={styles["icon-small"]}
                      />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item, "task", "list-delete");
                      }}
                      title="Delete / Remove row"
                    >
                      <img
                        src={require("../assets/Delete.png")}
                        alt="delete"
                        className={styles["icon-small"]}
                      />
                    </button>

                    {editingTaskId === item.Id ? (
                      <>
                        {/* Save/Accept */}
                        <button
                          type="button"
                          className={styles["icon-button"]}
                          onClick={() => {
                            handleSave(item);
                            setEditingTaskId(null);
                          }}
                          title="Accept / Update DB"
                        >
                          <img
                            src={require("../assets/Accept.png")}
                            alt="send"
                            className={styles["icon-small"]}
                          />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Enter edit mode */}
                        <button
                          type="button"
                          className={styles["icon-button"]}
                          onClick={() => {
                            setEditingTaskId(item.Id);
                            setEditTaskTitle(item.Task || "");
                            setEditPercentComplete(item.Complete);
                            setEditStart(toDateInputValue(item.Start));
                            setEditFinish(toDateInputValue(item.Finish));
                          }}
                          title="Edit task"
                        >
                          <img
                            src={require("../assets/EditRow.png")}
                            alt="edit"
                            className={styles["icon-small"]}
                          />
                        </button>
                      </>
                    )}
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
      )}
    </>
  );
};

export default ListTasks;
