import * as React from "react";
import { ITaskListItem } from "../../../models";
import styles from "./ProjectDashboard.module.scss";

interface GateCardProps {
  tasks: ITaskListItem[];
  showDetails: boolean;
  onSelectItem: (item: string, group: string) => void;
}
const ProgressTasks = ({ onSelectItem, showDetails, tasks }: GateCardProps) => {
  //let _showDetails: boolean = false;
  //Hook
  //const tasks: ITaskListItem[] = [];

  const getCardClass = (
      complete: number,
      start: string | Date | null,
      finish: string | Date | null,
      actualFinish: string | Date | null
    ) => {
      const today = new Date();
      const startDate = start ? new Date(start) : null;
      const finishDate = finish ? new Date(finish) : null;
      const actualFinishDate = actualFinish ? new Date(actualFinish) : null;

      const isClosed = !!actualFinishDate && complete === 100;

      // Gris: cerrada
      if (isClosed) return styles.grey; // define .grey en tu módulo

      const hasStarted = !!startDate && startDate <= today;
      const isPastDue = !!finishDate && finishDate < today;
      const daysToFinish =
        finishDate
          ? Math.ceil(
              (finishDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            )
          : undefined;

      // Blanco: aún no inicia
      if (!hasStarted) return styles.white;

      // Rojo: iniciada y vencida
      if (isPastDue) return styles.red;

      // Amarillo: iniciada y termina en menos de 7 días
      if (daysToFinish !== undefined && daysToFinish <= 7) return styles.yellow;

      // Verde: iniciada y en tiempo
      return styles.green;
    };

  const getCardDelay = (
      complete: number,
      start: string | Date | null,
      finish: string | Date | null,
      actualFinish: string | Date | null
    ) => {
      const today = new Date();
      const startDate = start ? new Date(start) : null;
      const finishDate = finish ? new Date(finish) : null;
      const actualFinishDate = actualFinish ? new Date(actualFinish) : null;

      const isClosed = !!actualFinishDate && complete === 100;

      // Cerrada (gris de fondo, texto blanco por ejemplo)
      if (isClosed) return styles.whiteFont;

      const hasStarted = !!startDate && startDate <= today;
      const isPastDue = !!finishDate && finishDate < today;
      const daysToFinish =
        finishDate
          ? Math.ceil(
              (finishDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            )
          : undefined;

      // Aún no inicia → fondo blanco, texto verde o gris
      if (!hasStarted) return styles.greenFont;

      // Vencida → fondo rojo, texto blanco
      if (isPastDue) return styles.whiteFont;

      // Termina en ≤ 7 días → fondo amarillo, texto rojo
      if (daysToFinish !== undefined && daysToFinish <= 7) return styles.redFont;

      // En tiempo → fondo verde, texto blanco
      return styles.whiteFont;
    };

  
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
