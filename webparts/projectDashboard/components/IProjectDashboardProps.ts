import {
  IProjectListItem,
  ITaskListItem,
  IGateListItem
} from '../../../models';
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { ProjectService } from "../services/ProjectService";

export interface IProjectDashboardProps {
  spTaskListItems: ITaskListItem[];
  spFilteredTaskItems: ITaskListItem[];
  selectedTask?: ITaskListItem;
  spGateListItems: IGateListItem[];

  onReset: () => void;
  onPopulateAttachements?: () => void;
  onSelectItem: (item: string, group: string) => void;
  onNewTask?: (
    Gate: string,
    sourceWbs?: string
  ) => void;
  onDeleteTask?: (
    taskId: string
  ) => void;
  onUpdateTask?: (
    taskName: string,
    action: "quick-complete" | "full-update",
    payloadJson?: string
  ) => void;
  onUploadFile?: UploadEvidenceHandler;

  onCreateNewProject?: (
    projectTitle: string,
    listName: string,
    repositoryName: string,
    firstGate: string,
    mode: "empty" | "from-excel",
    file?: File
  ) => Promise<void>;


  description: string;
  project: IProjectListItem;
  repositoryName: string;
  projectName: string;
  repositoryURL: string;
  evidenceFolderServerRelative: string;
  context: BaseComponentContext;
  projectService: ProjectService;

  isPlanner: boolean;
  showLog: boolean;
  showButtons: boolean;
  onGateFilterChange?: (gate: string) => void;
  currentGate?: string;

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
