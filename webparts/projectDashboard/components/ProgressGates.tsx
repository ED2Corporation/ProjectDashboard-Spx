/* eslint-disable @typescript-eslint/no-var-requires */
import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import { IGateListItem, ITaskListItem } from "../../../models";
import {
  GetBucketStatusFromTasks,
  getBackgroundImageByStatus
} from "./GetGateStatus";

interface GateCardProps {
  gates: IGateListItem[];
  tasks?: ITaskListItem[] | null;
  showDetails: boolean;
  onSelectItem: (item: string, group: string) => void;
}

const ProgressGates = ({ gates, tasks, onSelectItem, showDetails }: GateCardProps) => {
  
  const getCardDelay = (delay: number, complete: number) => {
    if (complete === 100) return styles.whiteFont;
    if (delay === 0) return styles.greenFont;
    if (delay > 0 && delay <= 7) return styles.redFont;
    if (delay > 7) return styles.whiteFont;
    return styles.whiteFont; // Default Class
  };

  return (
    <>
      {showDetails ? (
        <div className={styles["cardContainer"]}>
          {gates.map((gate) => {
            const gateTasks = (tasks || []).filter(
              t => t.Title === gate.Title // o t.GateId === gate.Id
            );
            const status = GetBucketStatusFromTasks(gateTasks);
            const arrowSrc = getBackgroundImageByStatus(status);

            return (
              <div
                style={{ position: "relative", width: "80px", height: "80px" }}
                key={gate.Id}
              >
                <img
                  alt=""
                  src={arrowSrc}
                  className={styles["iconArrow"]}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "10%",
                    left: "20%",
                  }}
                  className={`${styles["cardContent"]} ${getCardDelay(
                    gate.Delay,
                    gate.Complete
                  )}`}
                  onClick={() => {
                    onSelectItem(gate.Title, "gate");
                  }}
                >
                  <h5>
                    <strong>
                      {gate.Title.length > 7
                        ? gate.Title.substring(0, 7)
                        : gate.Title}{" "}
                    </strong>
                  </h5>
                  <p>
                    <strong>{Math.floor(gate.Complete)}% </strong>
                  </p>
                  {gate.Delay > 0 && (
                    <p>
                      <strong>(- {gate.Delay} days) </strong>
                    </p>
                  )}
                </div>
              </div>
            );
          })}

        </div>
      ) : (
        <div className={styles["cardContainer"]}>
          {gates.map((gate) => {
            const gateTasks = (tasks || []).filter(
              t => t.Title === gate.Title // o t.GateId === gate.Id
            );
            const status = GetBucketStatusFromTasks(gateTasks);
            const arrowSrc = getBackgroundImageByStatus(status);

            return (
              <div
                style={{ position: "relative", width: "80px", height: "80px" }}
                key={gate.Id}
              >
                <img
                  alt=""
                  src={arrowSrc}
                  className={styles["iconArrow"]}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "10%",
                    left: "20%",
                  }}
                  className={`${styles["cardContent"]} ${getCardDelay(
                    gate.Delay,
                    gate.Complete
                  )}`}
                  onClick={() => {
                    onSelectItem(gate.Title, "gate");
                  }}
                >
                  <h5>
                    <strong>
                      {gate.Title.length > 7
                        ? gate.Title.substring(0, 7)
                        : gate.Title}{" "}
                    </strong>
                  </h5>
                  <p>
                    <strong>{Math.floor(gate.Complete)}% </strong>
                  </p>
                  {gate.Delay > 0 && (
                    <p>
                      <strong>(- {gate.Delay} days) </strong>
                    </p>
                  )}
                </div>
              </div>
            );
          })}

        </div>
      )}
    </>
  );
};

export default ProgressGates;
