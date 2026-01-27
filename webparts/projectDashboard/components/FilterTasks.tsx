import { ITaskListItem } from "../../../models";
import { GetDelay } from "./GetDelay";

// Función para agrupar
export function FilterTasks(
  data: ITaskListItem[],
  grouper: string,
  filter: string
): ITaskListItem[] {
  //default
  let filteredArray = data.filter((row) => row.Gate === filter);

  if (grouper === "gate" && filter === "actual" && data.length > 0) {
    //const gate = data[0].Title;
    filteredArray = data.filter(
      (row) => row.Complete < 100 && GetDelay(row.Finish, row.ActualFinish) > 0
    );
  }

  //console.log("[FilterTasks] grouper: "+grouper+" filter: "+filter+" items: "+ data.length + " filter: "+filteredArray.length)

  return filteredArray;
}
