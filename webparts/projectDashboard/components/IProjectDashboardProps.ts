import {
  ButtonClickedCallback,
  IProjectListItem,
  ITaskListItem,
  IGateListItem
} from '../../../models';

export interface IProjectDashboardProps {
  spTaskListItems: ITaskListItem[];
  spFilteredTaskItems: ITaskListItem[];
  selectedTask: ITaskListItem;
  spGateListItems: IGateListItem[];

  onGetTaskListItems?: ButtonClickedCallback;
  onGetGateListItems?: ButtonClickedCallback;
  onReset?: ButtonClickedCallback;
  onPopulateAttachements?: ButtonClickedCallback;
  onSelectItem: (item: string, group: string) => void;
  onUpdateTask?: (
    taskName: string,
    action: "quick-complete" | "full-update",
    payloadJson?: string
  ) => void;
  onUploadFile?: (file: File, taskTitle: string) => void;

  description: string;
  project: IProjectListItem;
  repositoryURL: string;

  showLog: boolean;
  showButtons: boolean;

  refreshInterval: number;
  filterValue: string;
  isDashboard: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
}
