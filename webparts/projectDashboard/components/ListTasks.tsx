import * as React from "react";
import { useState } from "react";
import { ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";
import { GetFormatDate } from "./GetFormatDate";
import styles from "./ProjectDashboard.module.scss";
import EvidenceEditor from "./EvidenceEditor";

interface ListGroupProps {
  tasks: ITaskListItem[];
  heading: string;
  projectSiteURL?: string;
  showDetails?: boolean | true;
  isPlanner?: boolean;
  onSave: (itemId: string, payload?: string) => void;
  onSelectItem: (
    item: ITaskListItem,
    group: string,
    mode?: "list" | "list-edit" | "list-save" | "list-delete" | "list-create",
    payload?: string
  ) => void;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
}

const ListTasks = ({
  tasks,
  heading,
  onSave,
  onSelectItem,
  showDetails,
  isPlanner,
  onUploadEvidenceFile,
}: ListGroupProps) => {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editTaskTitle, setEditTaskTitle] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editEvidenceUrl, setEditEvidenceUrl] = useState<string>("");
  const [editEvidenceDesc, setEditEvidenceDesc] = useState<string>("");
  const [editPercentComplete, setEditPercentComplete] = useState<number>(0);
  const [editFinish, setEditFinish] = useState<string>("");

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

  const filteredTasks = showDetails
    ? tasks
    : tasks.filter(
        (item) =>
          Math.floor(item.Complete) < 100 &&
          GetDelay(item.Finish, item.ActualFinish) > 0
      );

  const sortedTasks = filteredTasks.slice().sort((a, b) => {
    const gateA = (a.Gate || "").trim().toLowerCase();
    const gateB = (b.Gate || "").trim().toLowerCase();
    if (gateA < gateB) return -1;
    if (gateA > gateB) return 1;

    const taskA = (a.Task || "").trim().toLowerCase();
    const taskB = (b.Task || "").trim().toLowerCase();
    if (taskA < taskB) return -1;
    if (taskA > taskB) return 1;

    const ai = Number(a.Title);
    const bi = Number(b.Title);
    if (!isNaN(ai) && !isNaN(bi)) return ai - bi;

    return (a.Title || "").localeCompare(b.Title || "");
  });

  // handleSave AHORA vive dentro del componente y usa el estado de edición
  const handleSave = (
    task: ITaskListItem,
    evidence?: { url: string; description: string }
  ) => {
    let actualFinish: Date | null | undefined;

    if (editPercentComplete === 100) {
      if (!task.ActualFinish) {
        actualFinish = new Date();          // se acaba de completar
      } else {
        actualFinish = new Date(task.ActualFinish); // ya tenía fecha, la conservas
      }
    } else {
      actualFinish = null;                  // se bajó de 100, se limpia
    }
    const data = {
      Id: task.Id,
      Gate: task.Gate,
      Task: editTaskTitle || task.Task,
      Complete: editPercentComplete,
      Finish: editFinish || null,
      ActualFinish: actualFinish,
      EvidenceOfCompletion: evidence
        ? {
            Url: evidence.url,
            Description: evidence.description,
          }
        : undefined,
    };

    const payload = JSON.stringify(data);
    console.log("ListTasks handleSave called with:", payload);
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
          <h1>{heading}</h1>
          <table className={styles.ed2Table}>
            <thead>
              <tr>
                <th className={`${styles.colActions} ${styles.actionsFixed}`}>
                  Action
                </th>
                <th className={styles.colText}>Task</th>
                <th className={styles.colDate}>Completed</th>
                <th className={styles.colDate}>Finish</th>
                <th className={styles.colURL}>Evidence of Completion</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((item, index) => (
                <tr
                  key={item.Id}
                  className={selectedIndex === index ? "table-active" : ""}
                  onClick={() => setSelectedIndex(index)}
                >
                  {/* ACCIONES */}
                  <td className={`${styles.colActions} ${styles.actionsFixed}`}>
                    {/* Open card */}
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItem(item, "task", "list-edit");
                      }}
                      title="Open card"
                    >
                      <img
                        src={require("../assets/View.png")}
                        alt="open"
                        className={styles["icon-small"]}
                      />
                    </button>

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
                            setEditEvidenceUrl(
                              item.EvidenceOfCompletion?.Url ?? ""
                            );
                            setEditEvidenceDesc(
                              item.EvidenceOfCompletion?.Description ?? ""
                            );
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
                      <span>{item.Task}</span>
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

                  {/* Finish */}
                  <td className={styles.colDate}>
                    {editingTaskId === item.Id ? (
                      <input
                        type="date"
                        value={editFinish}
                        onChange={(e) => {
                          const newFinish = e.target.value;
                          if (item.Start && newFinish) {
                            const startUTC = new Date(item.Start).getTime();
                            const [fy, fm, fd] = newFinish
                              .split("-")
                              .map(Number);
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
                  <td className={styles.colURL}>
                    {editingTaskId === item.Id ? (
                      <EvidenceEditor
                        evidenceUrl={editEvidenceUrl}
                        evidenceDesc={editEvidenceDesc}
                        onChangeUrl={(v) => {
                          const cleanValue = v
                            .trim()
                            .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
                          setEditEvidenceUrl(cleanValue);
                        }}
                        onChangeDesc={setEditEvidenceDesc}
                        onUploadEvidenceFile={onUploadEvidenceFile}
                        taskId={editingTaskId}
                        taskTitle={editTaskTitle || "CompletionEvidence"}
                        onEvidenceUpdated={({ taskId, url, description }) => {
                          // éxito: actualiza estado y guarda
                          setEditEvidenceDesc(description);
                          setEditEvidenceUrl(url);

                          handleSave(item, { url, description });           // construye payload con estados de edición
                          setEditingTaskId(null);     // cierra modo edición
                        }}
                        onAfterUpload={(success) => {
                          if (!success) {
                            // sólo manejar error (log, toast...), NO cerrar ni guardar
                            console.log("Evidence upload failed.");
                          }
                        }}
                      />

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
