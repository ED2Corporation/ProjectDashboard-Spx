import { IGateListItem, ITaskListItem } from "../../../models";
import styles from "../components/ProjectDashboard.module.scss";

export type GateStatus = "grey" | "white" | "yellow" | "green" | "red";

export function GetGateStatus(
  complete: number,
  start?: string | Date,
  finish?: string | Date,
  actualFinish?: string | Date
  ): GateStatus
{
  const today = new Date();
  const finishDate = finish ? new Date(finish) : null;
  const actualFinishDate = actualFinish ? new Date(actualFinish) : null;

  const isClosed = !!actualFinishDate || complete === 100;
  if (isClosed) return "green";

  const isPastDue = !!finishDate && finishDate < today;

  if (!isPastDue) return "white";

  if (isPastDue && finishDate) {
    const delayDays = Math.ceil(
      (today.getTime() - finishDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (delayDays > 15) return "red";
    if (delayDays >= 1) return "yellow";
  }

  return "white";
}

export function GetBucketStatus(gates: IGateListItem[]): GateStatus {
  if (!gates || gates.length === 0) return "white";

  const statuses = gates.map(g =>
    GetGateStatus(g.Complete, g.Start, g.Finish, g.ActualFinish)
  );

  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";

  const allGreen = statuses.every(s => s === "green");
  if (allGreen) return "green";

  return "white";
}

export function GetBucketStatusFromTasks(tasks: ITaskListItem[]): GateStatus {
  if (!tasks || tasks.length === 0) return "white";

  const statuses = tasks.map(t =>
    GetGateStatus(t.Complete, t.Start, t.Finish, t.ActualFinish)
  );

  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";

  const allGreen = statuses.every(s => s === "green");
  if (allGreen) return "green";

  return "white";
}

export function StatusToColor(status: GateStatus, solid: boolean): string {
  switch (status) {
    case "red":    return solid ? "#FF3B4E" : "#FF3B4ECC";
    case "yellow": return solid ? "#FFCE56" : "#FFCE56CC";
    case "green":  return solid ? "#4CAF50" : "#4CAF50CC";
    case "grey":   return solid ? "#4CAF50" : "#4CAF50CC";
    case "white":
    default:       return solid ? "#FFFFFF" : "#FFFFFFCC";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getBackgroundImageByStatus = (status: GateStatus): any => {
  switch (status) {
    case "grey":   return require("../assets/ArrowGreen.png");
    case "white":  return require("../assets/ArrowWhite.png");
    case "yellow": return require("../assets/ArrowYellow.png");
    case "red":    return require("../assets/ArrowRed.png");
    case "green":
    default:       return require("../assets/ArrowGreen.png");
  }
};

export const getCardClass = (
    complete: number,
    start?: string | Date,
    finish?: string | Date,
    actualFinish?: string | Date
  ): string => {
  const status = GetGateStatus(complete, start, finish, actualFinish);
  switch (status) {
    case "grey":   return styles.grey;
    case "white":  return styles.white;
    case "yellow": return styles.yellow;
    case "red":    return styles.red;
    case "green":  return styles.green;
    default:       return styles.white;
  }
};

export const getCardDelay = (
  complete: number,
  start?: string | Date,
  finish?: string | Date,
  actualFinish?: string | Date
): string => {
  const status = GetGateStatus(complete, start, finish, actualFinish);
  switch (status) {
    case "grey":   return styles.greyFont;
    case "white":  return styles.whiteFont;
    case "yellow": return styles.yellowFont;
    case "red":    return styles.redFont;
    case "green":  return styles.greenFont;
    default:       return styles.whiteFont;
  }
};
