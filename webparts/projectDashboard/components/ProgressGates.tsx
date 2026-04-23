/* eslint-disable @typescript-eslint/no-var-requires */
import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import { IGateListItem, ITaskListItem } from "../../../models";
import {
  GetBucketStatusFromTasks,
  getBackgroundImageByStatus
} from "../utils/GetGateStatus";

interface GateCardProps {
  gates: IGateListItem[];
  tasks?: ITaskListItem[] | null;
  showDetails?: boolean | true;
  onSelectItem: (item: string, group: string) => void;
}

const ProgressGates = ({ gates, tasks, onSelectItem, showDetails }: GateCardProps): JSX.Element => {
  
  return (
    <>
      {showDetails ? (
        <div className={styles.cardContainer}>
          {gates.map((gate) => {
            const gateTasks = (tasks || []).filter(
              t => t.Gate === gate.Gate // o t.GateId === gate.Id
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
                  // eslint-disable-next-line dot-notation
                  className={styles["iconArrow"]}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "10%",
                    left: "20%",
                  }}
                  className={`${styles.cardContent} `}
                  onClick={() => {
                    onSelectItem(gate.Gate, "gate");
                  }}
                >
                  <h5>
                    <strong>
                      {gate.Gate.length > 7
                        ? gate.Gate.substring(0, 7)
                        : gate.Gate}{" "}
                    </strong>
                  </h5>
                  <p>
                    <strong>{Math.floor(gate.Complete)}% </strong>
                  </p>
                  
                </div>
              </div>
            );
          })}

        </div>
      ) : (
        <div className={styles.cardContainer}>
          {gates.map((gate) => {
            const gateTasks = (tasks || []).filter(
              t => t.Gate === gate.Gate // o t.GateId === gate.Id
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
                  // eslint-disable-next-line dot-notation
                  className={styles["iconArrow"]}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "10%",
                    left: "20%",
                  }}
                  className={`${styles.cardContent} `}
                  onClick={() => {
                    onSelectItem(gate.Gate, "gate");
                  }}
                >
                  <h5>
                    <strong>
                      {gate.Gate.length > 7
                        ? gate.Gate.substring(0, 7)
                        : gate.Gate}{" "}
                    </strong>
                  </h5>
                  <p>
                    <strong>{Math.floor(gate.Complete)}% </strong>
                  </p>
                  
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
