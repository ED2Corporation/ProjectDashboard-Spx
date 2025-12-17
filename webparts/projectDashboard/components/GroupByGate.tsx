import { ITaskListItem, IGateListItem } from "../../../models";
import { GetDelay } from "./GetDelay";

// Función para agrupar
export function GroupByGate(tasks: ITaskListItem[]): IGateListItem[] {
  const sortedItems = [...tasks].sort((b, a) =>
    b.Title.substring(0, 1).localeCompare(a.Title.substring(0, 1))
  );

  const groups = sortedItems.reduce<Record<string, IGateListItem>>(
    (gate, item) => {
      const { Title, Complete, Start, Finish, ActualFinish, Effort } = item;

      const startDate = Start ? new Date(Start) : null;
      const finishDate = Finish ? new Date(Finish) : null;
      const actualFinishDate = ActualFinish ? new Date(ActualFinish) : null;

      // Si el grupo no existe, inicialízalo SIN fechas por defecto
      if (!gate[Title]) {
        gate[Title] = {
          Title,
          Complete: 0,
          Delay: 0,
          Count: 0,
          Effort: 0,
          Start: null,
          Finish: null,
          ActualFinish: null,
          Id: Title.substring(0, 1),
        };
      }

      const group = gate[Title];

      // Actualizar métricas del grupo
      group.Id = Title.substring(0, 1);
      group.Complete += Complete ?? 0;
      group.Count += 1;
      group.Effort += Effort ?? 0;

      group.Delay = Math.max(
        group.Delay,
        GetDelay(Finish, ActualFinish)
      );

      // Fechas mínimas / máximas solo si existen
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
        if (
          !group.ActualFinish ||
          actualFinishDate.getTime() > group.ActualFinish.getTime()
        ) {
          group.ActualFinish = actualFinishDate;
        }
      }

      return gate;
    },
    {}
  );

  // Convertir los grupos en un arreglo
  return Object.values(groups).map((group) => ({
    Title: group.Title,
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
