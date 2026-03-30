import { ITaskListItem } from "./ITaskListItem";

export interface IProjectDashboardWebPartProps {
  showLog: boolean;
  selectedTask: ITaskListItem;
  anthropicApiKey?: string;
}