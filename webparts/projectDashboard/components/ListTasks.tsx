
import * as React from "react";
import { useState } from "react";
import { ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";
import { GetFormatDate } from "./GetFormatDate";
import styles from "./ProjectDashboard.module.scss";

interface ListGroupProps {
  items: ITaskListItem[];
  heading: string;
  showDetails?: boolean | true;
  onSelectItem: (
    item: string,                 // Task (as today)
    group: string,                // Bucket / gate (as today)
    mode?: "details" | "list" | "quick-complete",  // new optional parameter
    payload?: string
  ) => void;
}

const ListTasks = ({
  items,
  heading,
  onSelectItem,
  showDetails,
}: ListGroupProps) => {
  // UI state
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editEvidenceUrl, setEditEvidenceUrl] = useState<string>("");
  const [editEvidenceDesc, setEditEvidenceDesc] = useState<string>("");
  const [editPercentComplete, setEditPercentComplete] = useState<number>(0);
  const [editFinish, setEditFinish] = useState<string>("");

  // Helper: convert Date/ISO/string -> YYYY-MM-DD (local time) for the date input
  const toDateInputValue = (value: any): string => {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return (
    <>
      {(showDetails
        ? items.length
        : items.filter(
            (item) =>
              Math.floor(item.Complete) < 100 && Math.floor(item.Complete) > 0
          ).length) > 0 && (
        <div>
          <h1>{heading}</h1>
          <table className={styles["ed2Table"]}>
            <thead>
              <tr>
                <th className={styles.colText}>Task</th>
                <th className={styles.colNumber}>Completed</th>
                <th className={styles.colNumber}>Finish</th>
                <th className={styles.colURL}>Evidence of Completion</th>
              </tr>
            </thead>
            <tbody>
              {(showDetails
                ? items
                : items.filter(
                    (item) =>
                      Math.floor(item.Complete) < 100 &&
                      GetDelay(item.Finish, item.ActualFinish) > 0
                  )
              ).map((item, index) => (
                <tr
                  key={item.Id}
                  className={selectedIndex === index ? "table-active" : ""}
                  onClick={() => {
                    setSelectedIndex(index);
                  }}
                >
                  {/* Task column */}
                  <td>
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation(); // prevent row onClick
                        onSelectItem(item.Task, "task", "details");
                      }}
                      title="View details"
                    >
                      <img
                        src={require("../assets/View.png")}
                        alt="View"
                        className={styles["icon-small"]}
                      />
                    </button>
                    <span>{item.Task}</span>
                  </td>

                  {/* Completed column with edit/save actions */}
                  <td className={styles["cell-complete"]}>
                    {editingTaskId === item.Id ? (
                      <>
                        {/* Progress selector shown only in edit mode */}
                        <select
                          value={editPercentComplete}
                          onChange={(e) =>
                            setEditPercentComplete(parseInt(e.target.value, 10))
                          }
                          className={styles["select-complete"]}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value={0}>0%</option>
                          <option value={50}>50%</option>
                          <option value={100}>100%</option>
                        </select>

                        {/* Save/Accept button */}
                        <button
                          type="button"
                          className={styles["icon-button"]}
                          onClick={() => {

                            const payload = JSON.stringify({
                              Id: item.Id,
                              Complete: editPercentComplete,
                              // Include both formats so the caller can choose
                              Finish: editFinish || null,   // "YYYY-MM-DD"
                              EvidenceOfCompletion: {
                                Url: editEvidenceUrl,
                                Description: editEvidenceDesc,
                              },
                            });

                            onSelectItem(
                              item.Task,
                              item.Title,
                              "quick-complete",
                              payload
                            );

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
                            setEditPercentComplete(item.Complete);
                            setEditEvidenceUrl(item.EvidenceOfCompletion?.Url ?? "");
                            setEditEvidenceDesc(item.EvidenceOfCompletion?.Description ?? "");
                            // Initialize Finish date input from current value
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
                        <span>{Math.floor(item.Complete)}%</span>
                      </>
                    )}
                  </td>

                  {/* Finish column: editable in edit mode, otherwise read-only */}
                  <td>
                    {editingTaskId === item.Id ? (
                      <input
                        type="date"
                        value={editFinish}
                        onChange={(e) => {                                                    
                          const newFinish = e.target.value;
                          // No validamos si start no tiene valor aún
                          if (item.Start && newFinish) {
                            const startUTC = new Date(item.Start).getTime();
                            // Convertimos ambas a fechas UTC para comparar correctamente
                            const [fy, fm, fd] = newFinish.split("-").map(Number);
                            const finishUTC = Date.UTC(fy, fm - 1, fd);

                            if (finishUTC < startUTC) {
                              alert("Finish date cannot be earlier than Start date.");
                              return; // No actualizamos el estado
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

                  {/* Evidence of Completion column */}
                  <td>
                    {editingTaskId === item.Id ? (
                      <div className={styles["evidence-edit"]}>
                        <input
                          type="text"
                          value={editEvidenceUrl}
                          onChange={(e) => setEditEvidenceUrl(e.target.value)}
                          placeholder="Evidence URL"
                          className={styles["input-small"]}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <input
                          type="text"
                          value={editEvidenceDesc}
                          onChange={(e) => setEditEvidenceDesc(e.target.value)}
                          placeholder="Description"
                          className={styles["input-small"]}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : item.EvidenceOfCompletion?.Url ? (
                      <a
                        href={item.EvidenceOfCompletion.Url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.EvidenceOfCompletion.Description ||
                          item.EvidenceOfCompletion.Url}
                      </a>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default ListTasks;
