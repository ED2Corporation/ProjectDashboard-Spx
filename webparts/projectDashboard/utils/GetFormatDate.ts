import { toAppDate } from "./DateUtils";

/** Formats a date as MM/DD/YYYY in the business time zone (Arizona). */
export function GetFormatDate(dateString?: Date) : string {
  const ymd = toAppDate(dateString);
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y}`;
}
