
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
  onSave: (
    item: string,                 
    payload?: string
  ) => void;
  onSelectItem: (
    item: ITaskListItem,                 // Task selected
    group: string,                // Bucket / gate (as today)
    mode?: "list" | "list-edit" | "list-save" | "list-delete"| "list-create",  // new optional parameter
    payload?: string
  ) => void;
  onUploadEvidenceFile?: (file: File, taskTitle: string) => Promise<{fileUrl: string; fileName: string;}>;
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
  // UI state
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editTaskTitle, setEditTaskTitle] = useState<string>("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editEvidenceUrl, setEditEvidenceUrl] = useState<string>("");
  const [editEvidenceDesc, setEditEvidenceDesc] = useState<string>("");
  const [editPercentComplete, setEditPercentComplete] = useState<number>(0);
  const [editFinish, setEditFinish] = useState<string>("");
  //const [isUploading, setIsUploading] = useState(false);

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
        ? tasks.length
        : tasks.filter(
            (item) =>
              Math.floor(item.Complete) < 100 && Math.floor(item.Complete) > 0
          ).length) > 0 && (
        <div>
          <h1>{heading}</h1>
          <table className={styles["ed2Table"]}>
            <thead>
              <tr>
                <th className={styles.colActions}>Action</th> 
                <th className={styles.colText}>Task</th>
                <th className={styles.colDate}>Completed</th>
                <th className={styles.colDate}>Finish</th>
                <th className={styles.colURL}>Evidence of Completion</th>
              </tr>
            </thead>
            <tbody>
              {(showDetails
                ? tasks
                : tasks.filter(
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
                  {/* Columna de acciones CRUD */}
                  <td className={styles.colActions}>
                    {/* Abrir TaskCard (equivalente a "openCard") */}
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

                    {/* Nueva tarea en el mismo gate */}
                    <button
                      type="button"
                      className={styles["icon-button"]}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Mandato equivalente a TaskCard.onNew -> WebPart.onNewTask(gate)
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

                    {/* Borrar tarea */}
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
                        {/* Save/Accept button */}
                        <button
                          type="button"
                          className={styles["icon-button"]}
                          onClick={() => {

                          console.log("item.Task:", item.Task);
                          console.log("editTaskTitle:", editTaskTitle);
                          
                            const payload = JSON.stringify({
                              Id: item.Id,
                              Gate: item.Gate,
                              Task: editTaskTitle, 
                              Complete: editPercentComplete,
                              Finish: editFinish || null,   // "YYYY-MM-DD"                                                       
                              EvidenceOfCompletion: {
                                Url: editEvidenceUrl,
                                Description: editEvidenceDesc,
                              },
                            });

                            onSave(item.Id, payload);

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
                      </>
                    )}
                  </td>
                  {/* Task column */}
                  <td className={styles.colText}>
                    {editingTaskId === item.Id ? (
                      <input
                        type="text"
                        value={editTaskTitle}
                        onChange={(e) => {
                          setEditTaskTitle(e.target.value);
                        }}
                        className={styles["input-small"]}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Task title"
                      />
                    ) : (
                      <span>{item.Task}</span>
                    )}
                  </td>

                  {/* % Completed column with edit/save actions */}
                  <td className={styles["cell-complete"]}>
                    {editingTaskId === item.Id ? (
                      <>
                        {/* Progress selector shown only in edit mode */}
                        {isPlanner ? (
                          <select
                            value={editPercentComplete}
                            onChange={(e) => setEditPercentComplete(Number(e.target.value) || 0)}
                            className={styles["select-complete"]}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="% Complete"
                          >
                            <option value={0}>0%</option>
                            <option value={50}>50%</option>
                            <option value={100}>100%</option>
                          </select>
                        ) : (
                          <input
                            type="number"
                            value={editPercentComplete}
                            onChange={(e) => setEditPercentComplete(Number(e.target.value) || 0)}
                            className={styles["input-small"]}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="% Complete"
                          />
                        )}
                        %                        
                      </> 
                    ) : (
                      <>                        
                        <span>{Math.floor(item.Complete)}%</span>
                      </>
                    )}
                  </td>

                  {/* Finish column: editable in edit mode, otherwise read-only */}
                  <td className={styles.colDate}>
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
                  <td className={styles.colURL}>
                    {editingTaskId === item.Id ? (
                      <EvidenceEditor
                        evidenceUrl={editEvidenceUrl}
                        evidenceDesc={editEvidenceDesc}
                        onChangeUrl={setEditEvidenceUrl}
                        onChangeDesc={setEditEvidenceDesc}
                        onUploadEvidenceFile={onUploadEvidenceFile}
                        taskId={editingTaskId}
                        taskTitle={editTaskTitle || "CompletionEvidence"}
                        complete={editPercentComplete}
                        finish={editFinish || null}
                        onQuickSave={(payloadJson) => {
                          onSave(editingTaskId, payloadJson);
                          setEditingTaskId(null);
                        }}
                        onAfterUpload={() => {
                          setEditingTaskId(null);
                        }}
                      />
                    ) : item.EvidenceOfCompletion?.Url ? (
                      <a
                        href={item.EvidenceOfCompletion.Url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.EvidenceOfCompletion.Description || item.EvidenceOfCompletion.Url}
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
