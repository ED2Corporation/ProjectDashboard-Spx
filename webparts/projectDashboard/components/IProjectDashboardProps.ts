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
  onUploadFile?: UploadEvidenceHandler;

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

export type UploadEvidenceHandler = (
  file: File,
  taskTitle: string
) => Promise<{ fileUrl: string; fileName: string }>;