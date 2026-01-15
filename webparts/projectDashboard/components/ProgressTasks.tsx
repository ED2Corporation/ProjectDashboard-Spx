import * as React from "react";
import { ITaskListItem } from "../../../models";
import styles from "./ProjectDashboard.module.scss";
import { getCardClass, getCardDelay } from "./GetGateStatus";

interface GateCardProps {
  tasks: ITaskListItem[];
  showDetails?: boolean | true;
  onSelectItem: (item: string, group: string) => void;
}
const ProgressTasks = ({ onSelectItem, showDetails, tasks }: GateCardProps) => {

  return (
    <>
      {showDetails ? (
        <div className={styles["cardContainer"]}>
          {tasks.map((item, index) => (
            <div
              key={item.Id}
              className={`${styles["ed2Card"]} ${getCardClass(
                item.Complete,
                item.Start ?? null,
                item.Finish ?? null,
                item.ActualFinish ?? null
              )}`}
            >
              <div
                className={`${styles["cardContent"]} ${getCardDelay(
                  item.Complete,
                  item.Start ?? null,
                  item.Finish ?? null,
                  item.ActualFinish ?? null
                )}`}
                onClick={() => {
                  onSelectItem(item.Task, "task");
                }}
              >
                <p>{item.WBS}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles["progressContainer"]}>
          {tasks.map((item, index) => (
            <div
              key={item.Id}
              className={`${styles["progressCard"]} ${getCardClass(
                item.Complete,
                item.Start ?? null,
                item.Finish ?? null,
                item.ActualFinish ?? null
              )}`}
              onClick={() => {
                onSelectItem(item.Task, "task");
              }}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default ProgressTasks;
