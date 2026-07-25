import { IGateListItem } from "../../../models";

// Función para agrupar
export function GroupByProject(gates: IGateListItem[]): IGateListItem {
 
  let complete: number = 0;
  let delay: number = 0;
  let effort: number = 0;
  let count: number = 0;

  let start: Date | undefined;
  let end: Date | undefined;
  let actualEnd: Date | undefined;


  const data = [...gates].sort((a, b) => b.Gate.localeCompare(a.Gate));

  if (data.length > 0) {
    for (count = 0; count < data.length; count++) {
      const gate = data[count];

      complete += gate.Complete ?? 0;
      effort   += gate.Effort   ?? 0;
      delay = gate.Delay > delay ? gate.Delay : delay;

      if (gate.Start) {
        start = !start || gate.Start.getTime() < start.getTime()
          ? gate.Start
          : start;
      }

      if (gate.Finish) {
        end = !end || gate.Finish.getTime() < end.getTime()
          ? gate.Finish
          : end;
      }

      if (gate.ActualFinish) {
        actualEnd = !actualEnd || gate.ActualFinish.getTime() < actualEnd.getTime()
          ? gate.ActualFinish
          : actualEnd;
      }
    }

  }

 const summary: IGateListItem = {
    Id: "0",
    Gate: "Project",
    Complete: count > 0 ? Math.trunc(complete / count) : 0,
    Delay: Math.trunc(delay),
    Count: count,
    Effort: Math.trunc(effort),
    Start: start,
    Finish: end,
    ActualFinish: actualEnd,
  };

  //console.log("[GetProjectSummary] Complete:", data.length+"-"+summary.Complete, "Count:", summary.Count, "Delay:", summary.Delay);
  return summary;
}
