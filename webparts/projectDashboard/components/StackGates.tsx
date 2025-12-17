import * as React from "react";
import { IGateListItem } from "../../../models";
import styles from "./ProjectDashboard.module.scss";

interface GateCardProps {
  gates: IGateListItem[];
  onSelectItem: (item: string, group: string) => void;
}
const StackGates = ({ gates, onSelectItem }: GateCardProps) => {
  //Hook
  const getCardClass = (delay: number, complete: number) => {
    if (complete === 100) return styles.green;
    return styles.white; // Default Class
  };

  const sortedItems = [...gates].sort((a, b) => b.Title.localeCompare(a.Title));
  let compareGate: string = "0";

  const getCardDelay = (delay: number, complete: number) => {
    if (complete === 100) return styles.whiteFont;
    if (delay === 0) return styles.greenFont;
    if (delay > 0 && delay <= 7) return styles.yellowFont;
    if (delay > 7) return styles.redFont;
    return styles.whiteFont; // Default Class
  };
  return (
    <>
      <div className={"rowContainer"}>
        {sortedItems.map((gate, index) => (
          <div
            key={gate.Id}
            className={`${styles["pilaCard"]} ${getCardClass(
              gate.Delay,
              gate.Complete
            )}`}
          >
            {
              <div
                className={`${styles["cardContent"]} ${getCardDelay(
                  gate.Delay,
                  gate.Complete
                )}`}
                onClick={() => {
                  if (compareGate === gate.Title) {
                    onSelectItem(gate.Title, "remove");
                  } else {
                    onSelectItem(gate.Title, "gate");
                  }
                }}
              >
                <h5>
                  <strong>{gate.Title} </strong>
                </h5>
                {gate.Delay > 0 && (
                  <p>
                    <strong>
                      {Math.floor(gate.Complete )} % (- {gate.Delay} days){" "}
                    </strong>
                  </p>
                )}
                {gate.Delay === 0 && (
                  <p>
                    <strong>{Math.floor(gate.Complete )} % </strong>
                  </p>
                )}
              </div>
            }
          </div>
        ))}
      </div>
    </>
  );
};

export default StackGates;
