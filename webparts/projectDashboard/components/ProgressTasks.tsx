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

const sortedTasks = tasks.slice().sort((a, b) => {
    const gateA = (a.Gate || "").trim().toLowerCase();
    const gateB = (b.Gate || "").trim().toLowerCase();

    if (gateA < gateB) return -1;
    if (gateA > gateB) return 1;

    const taskA = (a.Task || "").trim().toLowerCase();
    const taskB = (b.Task || "").trim().toLowerCase();

    if (taskA < taskB) return -1;
    if (taskA > taskB) return 1;

    // Fallback por Title (WBS) si quieres mantener orden estable dentro del mismo Task
    const ai = Number(a.Title);
    const bi = Number(b.Title);
    if (!isNaN(ai) && !isNaN(bi)) return ai - bi;

    return (a.Title || "").localeCompare(b.Title || "");
  });
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
            {sortedTasks.map((item, index) => (
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
