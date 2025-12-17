// src/webparts/projectDashboard/components/GetGateStatus.ts

import { IGateListItem, ITaskListItem } from "../../../models";

export type GateStatus = "grey" | "white" | "yellow" | "green" | "red";

export function GetGateStatus(
  complete: number,
  start: string | Date | null,
  finish: string | Date | null,
  actualFinish: string | Date | null
): GateStatus {
  const today = new Date();
  const startDate = start ? new Date(start) : null;
  const finishDate = finish ? new Date(finish) : null;
  const actualFinishDate = actualFinish ? new Date(actualFinish) : null;

  const isClosed = !!actualFinishDate || complete === 100;
  if (isClosed) return "grey";

  const hasStarted = !!startDate && startDate <= today;
  const isPastDue = !!finishDate && finishDate < today;
  const daysToFinish =
    finishDate
      ? Math.ceil(
          (finishDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )
      : undefined;

  if (!hasStarted) return "white";
  if (isPastDue) return "red";
  if (daysToFinish !== undefined && daysToFinish <= 7) return "yellow";
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
  if (allGrey) return "grey";

  return "white";
}

export function GetBucketStatusFromTasks(tasks: ITaskListItem[]): GateStatus {
  if (!tasks || tasks.length === 0) return "white";

  const statuses = tasks.map(t =>
    GetGateStatus(
      t.Complete,
      t.Start ?? null,
      t.Finish ?? null,
      t.ActualFinish ?? null
    )
  );

  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  if (statuses.includes("green")) return "green";

  const allGrey = statuses.every(s => s === "grey");
  if (allGrey) return "grey";

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
      return solid ? "#9E9E9E" : "#9E9E9ECC";
    case "white":
    default:
      return solid ? "#FFFFFF" : "#FFFFFFCC";
  }
}

// ⬇️ util para las flechas de ProgressGates
export const getBackgroundImageByStatus = (status: GateStatus) => {
  switch (status) {
    case "grey":
      return require("../assets/ArrowGrey.png");
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
