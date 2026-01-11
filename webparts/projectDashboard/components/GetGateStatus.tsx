// src/webparts/projectDashboard/components/GetGateStatus.ts

import { IGateListItem, ITaskListItem } from "../../../models";
import styles from "./ProjectDashboard.module.scss";

export type GateStatus = "grey" | "white" | "yellow" | "green" | "red";

export function GetGateStatus(
  complete: number,
  start: string | Date | null,
  finish: string | Date | null,
  actualFinish: string | Date | null
  ): GateStatus 
{
  const today = new Date();
  const startDate = start ? new Date(start) : null;
  const finishDate = finish ? new Date(finish) : null;
  const actualFinishDate = actualFinish ? new Date(actualFinish) : null;

  const isClosed = !!actualFinishDate || complete === 100;
  if (isClosed) return "green";

  const hasStarted = !!startDate && startDate <= today;
  const isPastDue = !!finishDate && finishDate < today;

  if (!hasStarted) return "white";

  if (isPastDue && finishDate) {
    const delayDays = Math.ceil(
      (today.getTime() - finishDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (delayDays > 15) return "red";      // más de 15 días de retraso
    if (delayDays >= 1) return "yellow";   // entre 1 y 15 días de retraso
  }

  return "green";
}

export function GetBucketStatus(gates: IGateListItem[]): GateStatus {
  if (!gates || gates.length === 0) return "white";

  const statuses = gates.map(g =>
    GetGateStatus(
      g.Complete,
      g.Start ?? null,
      g.Finish ?? null,
      g.ActualFinish ?? null
    )
  );

  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  if (statuses.includes("green")) return "green";

  const allGrey = statuses.every(s => s === "grey");
  if (allGrey) return "green";
/*  if (allGrey) return "grey";*/

  return "white";
}

export function GetBucketStatusFromTasks(tasks: ITaskListItem[]): GateStatus {
  if (!tasks || tasks.length === 0) return "white";

  const statuses = tasks.map(t => {
    const status = GetGateStatus(
      t.Complete,
      t.Start ?? null,
      t.Finish ?? null,
      t.ActualFinish ?? null
    ); 
    return status;
  });

  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  if (statuses.includes("green")) return "green";

  const allGrey = statuses.every(s => s === "grey");
  if (allGrey) return "green";

  return "white";
}

export function StatusToColor(status: GateStatus, solid: boolean): string {
  switch (status) {
    case "red":
      return solid ? "#FF3B4E" : "#FF3B4ECC";
    case "yellow":
      return solid ? "#FFCE56" : "#FFCE56CC";
    case "green":
      return solid ? "#4CAF50" : "#4CAF50CC";
    case "grey":
      return solid ? "#4CAF50" : "#4CAF50CC";
      /*return solid ? "#9E9E9E" : "#9E9E9ECC";*/
    case "white":
    default:
      return solid ? "#FFFFFF" : "#FFFFFFCC";
  }
}

// ⬇️ util para las flechas de ProgressGates
export const getBackgroundImageByStatus = (status: GateStatus) => {
  switch (status) {
    case "grey":
      return require("../assets/ArrowGreen.png");
      /*return require("../assets/ArrowGrey.png");*/
    case "white":
      return require("../assets/ArrowWhite.png");
    case "yellow":
      return require("../assets/ArrowYellow.png");
    case "red":
      return require("../assets/ArrowRed.png");
    case "green":
    default:
      return require("../assets/ArrowGreen.png");
  }
};

  export const getCardClass = (
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

  // Cerrada
  if (isClosed) return styles.green; // o styles.grey

  const hasStarted = !!startDate && startDate <= today;

  // Blanco: aún no inicia
  if (!hasStarted) return styles.white;

  if (finishDate) {
    const daysDiff = Math.ceil(
      (today.getTime() - finishDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // daysDiff > 0 => ya venció (retraso)
    if (daysDiff > 15) return styles.red;      // más de 15 días de retraso
    if (daysDiff >= 1) return styles.yellow;   // entre 1 y 15 días de retraso
  }

  // En tiempo (no vencida o sin finish)
  return styles.green;
};

/*
export const getCardDelay = (delay: number, complete: number) => {
    if (complete === 100) return styles.whiteFont;
    if (delay === 0) return styles.greenFont;
    if (delay > 0 && delay <= 15) return styles.blackFont;
    if (delay > 15) return styles.blackFont;
    return styles.whiteFont; // Default Class
  };
*/
export const getCardDelay = (
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

  // Cerrada → texto blanco
  if (isClosed) return styles.whiteFont;

  const hasStarted = !!startDate && startDate <= today;

  // Aún no inicia → texto verde
  if (!hasStarted) return styles.greenFont;

  if (finishDate) {
    const daysDiff = Math.ceil(
      (today.getTime() - finishDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Vencida
    if (daysDiff > 15) return styles.whiteFont; // rojo de fondo, texto blanco
    if (daysDiff >= 1) return styles.redFont;   // amarillo de fondo, texto rojo
  }

  // En tiempo
  return styles.whiteFont;
};
