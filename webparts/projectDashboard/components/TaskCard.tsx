import React, { useState, useEffect } from "react";
import { ITaskListItem } from "../../../models";
import styles from "./TaskCard.module.scss";
import EvidenceEditor from "./EvidenceEditor";

interface TaskCardProps {
  task: ITaskListItem;
  isPlanner?: boolean;
  onClose?: () => void;
  onDelete: (id: string) => void;
  onNew: (task: ITaskListItem) => void;
  onSave: (
    item: string,                 
    payload?: string
  ) => void;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, isPlanner, onClose, onSave, onDelete, onNew, onUploadEvidenceFile }) => {
  const [gate, setGate] = useState(task.Gate ?? "");
  const [deliverable, setDeliverable] = useState(task.Deliverable ?? "");
  const [taskTitle, setTaskTitle] = useState(task.Task ?? "");
  const [complete, setComplete] = useState<number>(task.Complete ?? 0);
  const [start, setStart] = useState<string>(
    task.Start ? new Date(task.Start).toISOString().slice(0, 10) : ""
  );
  const [finish, setFinish] = useState<string>(
    task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : ""
  );
  const [effort, setEffort] = useState<string>(
    task.Effort !== undefined ? task.Effort.toString() : ""
  );
  const [barriers, setBarriers] = useState(task.Barriers ?? "");
  const [actionableStatus, setActionableStatus] = useState(task.ActionableStatus ?? "");
  const [description, setDescription] = useState(task.Description ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(task.EvidenceOfCompletion?.Url ?? "");
  const [evidenceDesc, setEvidenceDesc] = useState(task.EvidenceOfCompletion?.Description ?? "");
  //const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setGate(task.Gate ?? "");
    setDeliverable(task.Deliverable ?? "");
    setTaskTitle(task.Task ?? "");
    setComplete(task.Complete ?? 0);
    setStart(task.Start ? new Date(task.Start).toISOString().slice(0, 10) : "");
    setFinish(task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : "");
    setEffort(task.Effort !== undefined ? task.Effort.toString() : "");
    setBarriers(task.Barriers ?? "");
    setActionableStatus(task.ActionableStatus ?? "");
    setDescription(task.Description ?? "");
    setEvidenceUrl(task.EvidenceOfCompletion?.Url ?? "");
    setEvidenceDesc(task.EvidenceOfCompletion?.Description ?? "");
  }, [task]);

  const handleSave = (evidence?: { url: string; description: string }) => {
     let actualFinish: Date | null | undefined;

    if (complete === 100) {
      if (!task.ActualFinish) {
        actualFinish = new Date();          // just completed
      } else {
        actualFinish = new Date(task.ActualFinish); // already had a date, keep it
      }
    } else {
      actualFinish = null;                  // dropped below 100, clear it
    }

    const data = {
      Id: task.Id,
      Deliverable: deliverable,
      Gate: gate,
      Task: taskTitle,
      Complete: complete,
      Effort: effort ? Number(effort) : undefined,
      Barriers: barriers,
      ActionableStatus: actionableStatus,
      Description: description,
      Start: start ? new Date(start) : undefined,
      Finish: finish ? new Date(finish) : undefined,
      ActualFinish: actualFinish,
      EvidenceOfCompletion: evidence
        ? {
            Url: evidence.url,
            Description: evidence.description,
          }
        : evidenceUrl || evidenceDesc
        ? {
            Url: evidenceUrl,
            Description: evidenceDesc,
          }
        : undefined,
    };

    const payload = JSON.stringify(data);

    onSave(task.Id, payload);
    onClose?.();
  };

  const handleSaveClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    handleSave(); // uses current state (no explicit evidence)
  };
  const handleNew = () => onNew(task);
  const handleDelete = () => onDelete(task.Id);

  return (
    <div className={styles["task-card"]}>
      <div className={styles["task-card-header"]}>
        <h1 className={styles["task-title"]}>{task.Task}</h1>
        <div>
          {
            <button
              type="button"
              className={styles["task-button"]}
              onClick={handleSaveClick}
              title="Accept / Update DB"
            >
              <img
                src={require("../assets/Accept.png")}
                alt="send"
                className={styles["icon-small"]}
              />
            </button>            
          }
                   {
            <button
              type="button"
              className={styles["task-button"]}
              onClick={handleNew }
              title="Add / New row"
            >
              <img
                src={require("../assets/Create.png")}
                alt="send"
                className={styles["icon-small"]}
              />
            </button>            
          }
                   {
            <button
              type="button"
              className={styles["task-button"]}
              onClick={handleDelete }
              title="Delete / Remove row"
            >
              <img
                src={require("../assets/Delete.png")}
                alt="send"
                className={styles["icon-small"]}
              />
            </button>            
          }
          {onClose && (
            <button
              type="button"
              className={styles["task-card-close"]}
              onClick={onClose}
              aria-label="Close task card"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className={styles["task-card-row"]}>
        <div className={styles["task-card-body"]}>
          <table className={styles["task-table"]}>
            <tbody>
              <tr>
                <td>
                  <strong>Gate:</strong>
                </td>
                <td>
                  <input
                    type="text"
                    value={gate}
                    onChange={e => setGate(e.target.value)}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>              
              <tr>
                <td>
                  <strong>Task:</strong>
                </td>
                <td>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>% Complete:</strong>
                </td>
                <td >
                  {isPlanner ? (
                    <select
                      value={complete}
                      onChange={(e) => setComplete(Number(e.target.value) || 0)}
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
                      value={complete}
                      onChange={(e) => setComplete(Number(e.target.value) || 0)}
                      className={styles["input-small"]}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}              
                </td>
              </tr>

              <tr>
                <td>
                  <strong>Start:</strong>
                </td>
                <td>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      // Skip validation if start has no value yet
                      if (newStart && finish) {
                        // Convertimos ambas a fechas UTC para comparar correctamente
                        const [sy, sm, sd] = newStart.split("-").map(Number);
                        const [fy, fm, fd] = finish.split("-").map(Number);
                        const startUTC = Date.UTC(sy, sm - 1, sd);
                        const finishUTC = Date.UTC(fy, fm - 1, fd);

                        if (finishUTC < startUTC) {
                          alert("Finish date cannot be earlier than Start date.");
                          return; // Do not update state
                        }
                      }
                      setStart(newStart);
                    }}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>

              <tr>
                <td>
                  <strong>Finish:</strong>
                </td>
                <td>
                  <input
                    type="date"
                    value={finish}
                    onChange={(e) => {
                      const newFinish = e.target.value;
                      // Skip validation if start has no value yet
                      if (start && newFinish) {
                        // Convertimos ambas a fechas UTC para comparar correctamente
                        const [sy, sm, sd] = start.split("-").map(Number);
                        const [fy, fm, fd] = newFinish.split("-").map(Number);
                        const startUTC = Date.UTC(sy, sm - 1, sd);
                        const finishUTC = Date.UTC(fy, fm - 1, fd);

                        if (finishUTC < startUTC) {
                          alert("Finish date cannot be earlier than Start date.");
                          return; // Do not update state
                        }
                      }
                      setFinish(newFinish);
                    }}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>

              {/* EVIDENCE OF COMPLETION */}
              <tr>
                <td>    
                  <strong>Evidence of Completion:</strong>              

                </td>
                <td>              
                  <div className={styles["evidence-edit"]}>
                    <EvidenceEditor
                      evidenceUrl={evidenceUrl}
                      evidenceDesc={evidenceDesc}
                      onChangeUrl={(v) => {
                        const cleanValue = v.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
                        setEvidenceUrl(cleanValue);
                      }}
                      onChangeDesc={setEvidenceDesc}
                      onUploadEvidenceFile={onUploadEvidenceFile}
                      taskId={task.Id}
                      taskTitle={taskTitle || task.Task || "CompletionEvidence"}
                      onEvidenceUpdated={({ taskId, url, description }) => {
                        // Update state so the UI reflects the new file
                        setEvidenceDesc(description);
                        setEvidenceUrl(url);

                        // Save using the new evidence
                        handleSave({ url, description });
                      }}
                      onAfterUpload={(success) => {
                        if (!success) {
                          console.error("Evidence upload failed.");
                          return;
                        }
                      }}
                      stopRowClick={false}
                    />
                
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={styles["task-card-column"]}>
            {/* NOTES / DESCRIPTION */}
            <strong>Status:</strong>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={styles["input-small"]}
              rows={3}
              style={{ width: "100%", resize: "vertical" }}
              placeholder="Add notes or description for this task..."
            />
          
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
