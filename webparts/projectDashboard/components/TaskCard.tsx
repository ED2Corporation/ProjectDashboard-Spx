import React from "react";
import { ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";
import { GetFormatDate } from "./GetFormatDate";
import styles from "./ProjectDashboard.module.scss";

interface TaskCardProps {
  task: ITaskListItem;
  showDetails: boolean;
  onClose?: () => void;
}


const TaskCard: React.FC<TaskCardProps> = ({ task, showDetails, onClose }) => {
  const getCardDelay = (delay: number, complete: number) => {
    if (complete === 100) return styles.blackFont;
    if (delay === 0) return styles.greenFont;
    if (delay > 0 && delay <= 7) return styles.yellowFont;
    if (delay > 7) return styles.redFont;
    return styles.blackFont;
  };
  return (
    <div className={styles["task-card"]}>
      <div className={styles["task-card-header"]}>
        <h1 className={styles["task-title"]}>{task.Task}</h1>
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

      <div className={styles["task-card-body"]}>
        <table className={styles["task-table"]}>
          <tbody>
            <tr>
              <td>
                <strong>Deliverable:</strong>
              </td>
              <td>{task.Deliverable}</td>
            </tr>
            <tr
              className={`${styles["task-alert"]} ${getCardDelay(
                GetDelay(task.Finish, task.ActualFinish),
                task.Complete
              )}`}
            >
              <td>
                <strong>Completion:</strong>
              </td>
              <td>{Math.floor(task.Complete)}%</td>
            </tr>
            <tr
              className={`${styles["task-alert"]} ${getCardDelay(
                GetDelay(task.Finish, task.ActualFinish),
                task.Complete
              )}`}
            >
              <td>
                <strong>Delay:</strong>
              </td>
              <td>{GetDelay(task.Finish, task.ActualFinish)} days</td>
            </tr>
            <tr>
              <td>
                <strong>Start:</strong>
              </td>
              <td>{GetFormatDate(task.Start)}</td>
            </tr>
            <tr>
              <td>
                <strong>Finish:</strong>
              </td>
              <td>{GetFormatDate(task.Finish)}</td>
            </tr>
            <tr>
              <td>
                <strong>ActualFinish:</strong>
              </td>
              <td>{GetFormatDate(task.ActualFinish)}</td>
            </tr>
            <tr>
              <td>
                <strong>Effort:</strong>
              </td>
              <td>{task.Effort}</td>
            </tr>

            {showDetails && (
              <>
                <tr>
                  <td>
                    <strong>Barriers:</strong>
                  </td>
                  <td>{task.Barriers}</td>
                </tr>
                <tr>
                  <td>
                    <strong>ActionableStatus:</strong>
                  </td>
                  <td>{task.ActionableStatus}</td>
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
                  <td>{task.Description}</td>
                </tr>
              </>
            )}
            {true && (
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
                    <a href={task.EvidenceOfCompletion?.Url} target="_blank">
                      {task.EvidenceOfCompletion?.Description}
                    </a>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
    </div>
    </div>
  );
};

export default TaskCard;
