import * as React from "react";
import { useState } from "react";
import { ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";
import { GetFormatDate } from "./GetFormatDate";
import styles from "./ProjectDashboard.module.scss";

interface ListGroupProps {
  items: ITaskListItem[];
  heading: string;
  showDetails: boolean;
  onSelectItem: (
    item: string,                 // Task (como hoy)
    group: string,                // Bucket / gate (como hoy)
    mode?: "details" | "list" |"quick-complete",  // nuevo parámetro opcional
    payload?: string
  ) => void;
}
const ListTasks = ({
  items,
  heading,
  onSelectItem,
  showDetails,
}: ListGroupProps) => {
  //Hook
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [editEffort, setEditEffort] = useState<string>("");
  const [editActualFinish, setEditActualFinish] = useState<string>("");
  const [editEvidenceUrl, setEditEvidenceUrl] = useState<string>("");
  const [editEvidenceDesc, setEditEvidenceDesc] = useState<string>("");


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
                <th>Finish</th>
                <th>Actual Finish</th>
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
                  {/* ...td Task name... */}
                  <td >
                      <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={e => {
                        e.stopPropagation(); // que no dispare el onClick del <tr>
                        onSelectItem(item.Task, "task", "details");
                      }}
                      title="View detail..."
                    >
                      <img
                        src={require("../assets/View.png")}
                        alt="View"
                        className={styles["icon-small"]}
                      />
                    </button>
                  
                    <span>{item.Task}</span>
                  </td>

                  {/* ...td de Completed con iconos... */}
                  <td className={styles["cell-complete"]}>                    
                   {/* Icono SEND solo en modo edición */}
                    {editingTaskId === item.Id ? (
                      <button
                        type="button"
                        className={styles["icon-button"]}
                        onClick={() => {
                          const payload = JSON.stringify({
                            taskId: item.Id,
                            effort: editEffort,
                            actualFinish: editActualFinish,
                            evidenceUrl: editEvidenceUrl,
                            evidenceDesc: editEvidenceDesc,
                          });

                          onSelectItem(
                            item.Task,      // item
                            item.Title,     // group (bucket/gate)
                            "quick-complete", // mode
                            payload         // json
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
                      ) : (
                      <button
                        type="button"
                        className={styles["icon-button"]}
                        onClick={() => {
                          setEditingTaskId(item.Id);
                          setEditEffort(item.Effort?.toString() ?? "");
                          setEditActualFinish(
                            item.ActualFinish
                              ? new Date(item.ActualFinish).toISOString().slice(0, 10)
                              : new Date().toISOString().slice(0, 10) // sugiere hoy
                          );
                          setEditEvidenceUrl(item.EvidenceOfCompletion?.Url ?? "");
                          setEditEvidenceDesc(item.EvidenceOfCompletion?.Description ?? "");
                        }}
                        title="Complete task..."
                      >
                        <img
                          src={require("../assets/EditRow.png")}
                          alt="accept"
                          className={styles["icon-small"]}
                        />
                      </button>
                      )
                    }

                    <span>{Math.floor(item.Complete)}%</span>

                  </td>                  

                  {/* Columna Finish (solo lectura) */}
                  <td>{GetFormatDate(item.Finish)}</td>

                  {/* Columna Actual Finish */}
                  <td>
                    {editingTaskId === item.Id ? (
                      <input
                        type="date"
                        value={editActualFinish}
                        onChange={e => setEditActualFinish(e.target.value)}
                        className={styles["input-small"]}
                      />
                    ) : (
                      GetFormatDate(item.ActualFinish)
                    )}
                  </td>
                  
                 {/* Columna Evidence of Completion */}
                  <td >
                    {editingTaskId === item.Id ? (
                      <div className={styles["evidence-edit"]}>
                        <input
                          type="text"
                          value={editEvidenceUrl}
                          onChange={e => setEditEvidenceUrl(e.target.value)}
                          placeholder="URL evidence"
                          className={styles["input-small"]}
                        />
                        <input
                          type="text"
                          value={editEvidenceDesc}
                          onChange={e => setEditEvidenceDesc(e.target.value)}
                          placeholder="Description"
                          className={styles["input-small"]}
                        />
                      </div>
                    ) : (
                      <a href={item.EvidenceOfCompletion?.Url} target="_blank">
                        {item.EvidenceOfCompletion?.Description}
                      </a>
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
