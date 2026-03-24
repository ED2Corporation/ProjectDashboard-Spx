import { ITaskListItem, IGateListItem } from "../../../models";
import { GetDelay } from "./GetDelay";

// Función para agrupar
export function GroupByGate(tasks: ITaskListItem[]): IGateListItem[] {
  const sortedItems = [...tasks].sort((b, a) =>
    b.Gate.substring(0, 1).localeCompare(a.Gate.substring(0, 1))
  );

  const groups = sortedItems.reduce<Record<string, IGateListItem>>(
    (gate, item) => {
      const { Gate, Complete, Start, Finish, ActualFinish, Effort } = item;

      const startDate = Start ? new Date(Start) : null;
      const finishDate = Finish ? new Date(Finish) : null;
      const actualFinishDate = ActualFinish ? new Date(ActualFinish) : null;

      if (!gate[Gate]) {
        gate[Gate] = {
          Gate: Gate,
          Complete: 0,
          Delay: 0,
          Count: 0,
          Effort: 0,
          Start: null,
          Finish: null,
          ActualFinish: null,
          Id: Gate.substring(0, 1),
        };
      }

      const group = gate[Gate];
      group.Id = Gate.substring(0, 1);
      group.Complete += Complete ?? 0;
      group.Count += 1;
      group.Effort += Effort ?? 0;

      group.Delay = Math.max(group.Delay, GetDelay(Finish, ActualFinish));

      if (startDate) {
        if (!group.Start || startDate.getTime() < group.Start.getTime()) {
          group.Start = startDate;
        }
      }

      if (finishDate) {
        if (!group.Finish || finishDate.getTime() > group.Finish.getTime()) {
          group.Finish = finishDate;
        }
      }

      if (actualFinishDate) {
        if (!group.ActualFinish || actualFinishDate.getTime() > group.ActualFinish.getTime()) {
          group.ActualFinish = actualFinishDate;
        }
      }

      return gate;
    },
    {}
  );

  return Object.values(groups).map((group) => ({
    Gate: group.Gate,
    Complete: group.Count > 0 ? group.Complete / group.Count : 0,
    Count: group.Count,
    Delay: group.Delay,
    Id: group.Id,
    Effort: group.Effort,
    Start: group.Start,
    Finish: group.Finish,
    ActualFinish: group.ActualFinish,
  }));
}
