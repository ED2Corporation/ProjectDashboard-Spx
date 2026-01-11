import { ITaskListItem } from "./ITaskListItem";

export interface IProjectDashboardWebPartProps {
  description: string;
  refreshInterval: number;
  projectName: string;
  sourceName: string;
  isPlanner: boolean;
  projectURL: string;
  isDashboard: boolean;
  showButtons: boolean;
  showLog: boolean;

  selectedTask: ITaskListItem;
  filterValue: string;

}