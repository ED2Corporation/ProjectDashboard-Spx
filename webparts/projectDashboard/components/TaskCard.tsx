import React, { useState, useEffect } from "react";
import { ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";
import styles from "./ProjectDashboard.module.scss";

interface TaskCardProps {
  task: ITaskListItem;
  showDetails: boolean;
  onClose?: () => void;
  onSave?: (updated: Partial<ITaskListItem> & { Id: string }) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, showDetails, onClose, onSave }) => {
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
  const [evidenceDesc, setEvidenceDesc] = useState(
    task.EvidenceOfCompletion?.Description ?? ""
  );

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

  const getCardDelay = (delay: number, completeValue: number) => {
    if (completeValue === 100) return styles.blackFont;
    if (delay === 0) return styles.greenFont;
    if (delay > 0 && delay <= 7) return styles.yellowFont;
    if (delay > 7) return styles.redFont;
    return styles.blackFont;
  };

  const delay = GetDelay(task.Finish, task.ActualFinish);

  const handleSave = () => {
    if (!onSave) return;

    const payload: Partial<ITaskListItem> & { Id: string } = {
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

    onSave(payload);
  };

  return (
    <div className={styles["task-card"]}>
      <div className={styles["task-card-header"]}>
        <h1 className={styles["task-title"]}>{task.Task}</h1>
        <div>
          {onSave && (
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
          )}
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

      <div className={styles["task-card-body"]}>
        <table className={styles["task-table"]}>
          <tbody>
            <tr>
              <td>
                <strong>Deliverable:</strong>
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

            <tr
              className={`${styles["task-alert"]} ${getCardDelay(delay, complete)}`}
            >
              <td>
                <strong>Completion:</strong>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={complete}
                  onChange={e => setComplete(Number(e.target.value) || 0)}
                  className={styles["input-small"]}
                />{" "}
                %
              </td>
            </tr>

            <tr
              className={`${styles["task-alert"]} ${getCardDelay(delay, complete)}`}
            >
              <td>
                <strong>Delay:</strong>
              </td>
              <td>{delay} days</td>
            </tr>

            <tr>
              <td>
                <strong>Start:</strong>
              </td>
              <td>
                <input
                  type="date"
                  value={start}
                  onChange={e => setStart(e.target.value)}
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
                  onChange={e => setFinish(e.target.value)}
                  className={styles["input-small"]}
                />
              </td>
            </tr>

            <tr>
              <td>
                <strong>ActualFinish:</strong>
              </td>
              <td>
                <input
                  type="date"
                  value={actualFinish}
                  onChange={e => setActualFinish(e.target.value)}
                  className={styles["input-small"]}
                />
              </td>
            </tr>

            <tr>
              <td>
                <strong>Effort:</strong>
              </td>
              <td>
                <input
                  type="number"
                  value={effort}
                  onChange={e => setEffort(e.target.value)}
                  className={styles["input-small"]}
                />
              </td>
            </tr>

            {showDetails && (
              <>
                <tr>
                  <td>
                    <strong>Barriers:</strong>
                  </td>
                  <td>
                    <textarea
                      value={barriers}
                      onChange={e => setBarriers(e.target.value)}
                      className={styles["textarea-small"]}
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>ActionableStatus:</strong>
                  </td>
                  <td>
                    <textarea
                      value={actionableStatus}
                      onChange={e => setActionableStatus(e.target.value)}
                      className={styles["textarea-small"]}
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Gate:</strong>
                  </td>
                  <td>{task.Title}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Description:</strong>
                  </td>
                  <td>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className={styles["textarea-small"]}
                    />
                  </td>
                </tr>
              </>
            )}

            <>
              <tr>
                <td>
                  <strong>Responsible:</strong>
                </td>
                <td>
                  <a href={task.Responsible?.Url} target="_blank">
                    {task.Responsible?.Description}
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>EvidenceOfCompletion:</strong>
                </td>
                <td>
                  <input
                    type="text"
                    value={evidenceUrl}
                    onChange={e => setEvidenceUrl(e.target.value)}
                    placeholder="Evidence URL"
                    className={styles["input-small"]}
                  />
                  <input
                    type="text"
                    value={evidenceDesc}
                    onChange={e => setEvidenceDesc(e.target.value)}
                    placeholder="Evidence description"
                    className={styles["input-small"]}
                    style={{ marginTop: 4 }}
                  />
                </td>
              </tr>
            </>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskCard;
