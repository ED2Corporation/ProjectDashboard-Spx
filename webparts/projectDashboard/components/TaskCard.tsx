import React, { useState, useEffect } from "react";
import { ITaskListItem } from "../../../models";
import styles from "./ProjectDashboard.module.scss";

interface TaskCardProps {
  task: ITaskListItem;
  showDetails?: boolean | true;
  onClose?: () => void;
  onSave: (
    item: string,                 
    payload?: string
  ) => void;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, showDetails, onClose, onSave, onUploadEvidenceFile }) => {
  const [deliverable, setDeliverable] = useState(task.Deliverable ?? "");
  const [complete, setComplete] = useState<number>(task.Complete ?? 0);
  const [start, setStart] = useState<string>(
    task.Start ? new Date(task.Start).toISOString().slice(0, 10) : ""
  );
  const [finish, setFinish] = useState<string>(
    task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : ""
  );
  const [actualFinish, setActualFinish] = useState<string>(
    task.ActualFinish ? new Date(task.ActualFinish).toISOString().slice(0, 10) : ""
  );
  const [effort, setEffort] = useState<string>(
    task.Effort !== undefined ? task.Effort.toString() : ""
  );
  const [barriers, setBarriers] = useState(task.Barriers ?? "");
  const [actionableStatus, setActionableStatus] = useState(task.ActionableStatus ?? "");
  const [description, setDescription] = useState(task.Description ?? "");
  const [evidenceUrl, setEvidenceUrl] = useState(task.EvidenceOfCompletion?.Url ?? "");
  const [evidenceDesc, setEvidenceDesc] = useState(task.EvidenceOfCompletion?.Description ?? "");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setDeliverable(task.Deliverable ?? "");
    setComplete(task.Complete ?? 0);
    setStart(task.Start ? new Date(task.Start).toISOString().slice(0, 10) : "");
    setFinish(task.Finish ? new Date(task.Finish).toISOString().slice(0, 10) : "");
    setActualFinish(
      task.ActualFinish ? new Date(task.ActualFinish).toISOString().slice(0, 10) : ""
    );
    setEffort(task.Effort !== undefined ? task.Effort.toString() : "");
    setBarriers(task.Barriers ?? "");
    setActionableStatus(task.ActionableStatus ?? "");
    setDescription(task.Description ?? "");
    setEvidenceUrl(task.EvidenceOfCompletion?.Url ?? "");
    setEvidenceDesc(task.EvidenceOfCompletion?.Description ?? "");
  }, [task]);

  const handleSave = () => {
    // Crear el objeto de datos (sin JSON.stringify aquí)
    const data = {
      Id: task.Id,
      Deliverable: deliverable,
      Complete: complete,
      Effort: effort ? Number(effort) : undefined,
      Barriers: barriers,
      ActionableStatus: actionableStatus,
      Description: description,
      Start: start ? new Date(start) : undefined,
      Finish: finish ? new Date(finish) : undefined,
      ActualFinish: actualFinish ? new Date(actualFinish) : undefined,
      EvidenceOfCompletion:
        evidenceUrl || evidenceDesc
          ? {
              Url: evidenceUrl,
              Description: evidenceDesc,
            }
          : undefined,
    };

    // Convertir a JSON string
    const payload = JSON.stringify(data);
    console.log("TaskCard handleSave called", payload);

    // Llamar el callback con taskId y payload JSON
    onSave(task.Id, payload);

    if (onClose) {
      onClose();
    }
  };

  return (
    <div className={styles["task-card"]}>
      <div className={styles["task-card-header"]}>
        <h1 className={styles["task-title"]}>{task.Task}</h1>
        <div>
          {
            <button
              type="button"
              className={styles["task-button"]}
              onClick={handleSave}
              title="Accept / Update DB"
            >
              <img
                src={require("../assets/Accept.png")}
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
                  <strong>Task:</strong>
                </td>
                <td>
                  <input
                    type="text"
                    value={deliverable}
                    onChange={e => setDeliverable(e.target.value)}
                    className={styles["input-small"]}
                  />
                </td>
              </tr>

              <tr>
                <td>
                  <strong>Completion:</strong>
                </td>
                <td >
                  <select
                    value={complete}
                    onChange={e => setComplete(Number(e.target.value) || 0)}
                    className={styles["select-complete"]}
                  >
                    <option value={0}>0%</option>
                    <option value={50}>50%</option>
                    <option value={100}>100%</option>
                  </select>
                  %
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
                      // No validamos si start no tiene valor aún
                      if (newStart && finish) {
                        // Convertimos ambas a fechas UTC para comparar correctamente
                        const [sy, sm, sd] = newStart.split("-").map(Number);
                        const [fy, fm, fd] = finish.split("-").map(Number);
                        const startUTC = Date.UTC(sy, sm - 1, sd);
                        const finishUTC = Date.UTC(fy, fm - 1, fd);

                        if (finishUTC < startUTC) {
                          alert("Finish date cannot be earlier than Start date.");
                          return; // No actualizamos el estado
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
                      // No validamos si start no tiene valor aún
                      if (start && newFinish) {
                        // Convertimos ambas a fechas UTC para comparar correctamente
                        const [sy, sm, sd] = start.split("-").map(Number);
                        const [fy, fm, fd] = newFinish.split("-").map(Number);
                        const startUTC = Date.UTC(sy, sm - 1, sd);
                        const finishUTC = Date.UTC(fy, fm - 1, fd);

                        if (finishUTC < startUTC) {
                          alert("Finish date cannot be earlier than Start date.");
                          return; // No actualizamos el estado
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
                  {/* Button to open URL */}
                  {evidenceUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        if (/^https?:\/\/\S+/i.test(evidenceUrl)) {
                          window.open(evidenceUrl, "_blank");
                        }
                      }}
                      title="Open evidence link"
                      className={styles["icon-button"]}
                      style={{ padding: 4 }}
                      disabled={!/^https?:\/\/\S+/i.test(evidenceUrl)}
                    >
                      <img
                        src={require("../assets/Document.png")}
                        alt="open"
                        className={styles["icon-small"]}
                      />
                    </button>
                  )}
                  {/* Button to Upload File */}
                  
                    {/* Upload file control */}
                    <label className={styles["icon-button"]} title="Upload file">
                      <input
                        type="file"
                        style={{ display: "none" }}                              
                        
                        onChange={async (ev) => {
                          ev.stopPropagation();
                          const file = ev.target.files?.[0];
                          if (!file) return;

                          try {
                            setIsUploading(true);
                            if (onUploadEvidenceFile) {
                              // 1) Subir archivo y obtener URL/Nombre
                              const result = await onUploadEvidenceFile(file, evidenceDesc || "CompletionEvidence");
                              if (!result) return;

                              const { fileUrl, fileName } = result;

                              // 2) Actualizar campos locales de edición
                              const newUrl = fileUrl;
                              const newDesc = fileName || "EvidenceFile";

                              const data = {
                                Id: task.Id,
                                Deliverable: deliverable,
                                Complete: complete,
                                Effort: effort ? Number(effort) : undefined,
                                Barriers: barriers,
                                ActionableStatus: actionableStatus,
                                Description: description,
                                Start: start ? new Date(start) : undefined,
                                Finish: finish ? new Date(finish) : undefined,
                                ActualFinish: actualFinish ? new Date(actualFinish) : undefined,
                                EvidenceOfCompletion:
                                  newUrl || newDesc
                                    ? {
                                        Url: newUrl,
                                        Description: newDesc,
                                      }
                                    : undefined,
                              };

                              // Convertir a JSON string
                              const payload = JSON.stringify(data);
                              //console.log("TaskCard handleSave called", payload);

                              // Llamar el callback con taskId y payload JSON
                              onSave(task.Id, payload);
                                if (onClose) {
                                  onClose();
                                }
                            }
                          } catch (err) {
                            console.error("Upload failed:", err);
                            alert("[TaskCard] File upload failed. Please try again.");
                          } finally {
                            setIsUploading(false);
                            (ev.target as HTMLInputElement).value = "";
                          }
                        }}

                      />
                      {/* button face */}
                      <img
                        src={require("../assets/Upload.png")}
                        alt="upload"
                        className={styles["icon-small"]}
                      />
                    </label>
                    {/* optional: simple spinner / progress text */}
                    {isUploading && <span style={{ fontSize: 10 }}>Uploading…</span>}

                </td>
                <td>              
                  <div className={styles["evidence-edit"]}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="text"
                        value={evidenceUrl}
                        onChange={e => {
                          // Sanitiza: quita espacios invisibles y recorta
                          const cleanValue = e.target.value.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
                          setEvidenceUrl(cleanValue);
                        }}
                        placeholder="Evidence URL"
                        className={styles["input-small"]}
                        style={{ flex: 1 }}
                      />            
                    </div>

                    {/* Hint visual si la URL no es válida */}
                    {evidenceUrl && !/^https?:\/\/\S+/i.test(evidenceUrl) && (
                      <div style={{ color: "red", fontSize: "12px", marginTop: 4 }}>
                        La URL debe iniciar con <strong>http(s)://</strong>
                      </div>
                    )}
                    <input
                      type="text"
                      value={evidenceDesc}
                      onChange={e => setEvidenceDesc(e.target.value)}
                      placeholder="Evidence description"
                      className={styles["input-small"]}
                      style={{ marginTop: 4, width: "100%" }}
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
              style={{ width: "100%", height: "100%", resize: "vertical" }}
              placeholder="Add notes or description for this task..."
            />
          
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
