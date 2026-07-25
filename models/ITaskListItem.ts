import { INoteEntry, IEvidenceEntry, IApprovalEntry } from './ITaskLogFields';

export interface ITaskListItem {
  Id: string;
  Title: string; //WBS Task Title
  Gate: string;
  Task: string;
  Complete: number;
  Start?: Date;
  Finish?: Date;
  ActualFinish?: Date;
  // Planner-only fields (not used in SP lists)
  /** SP Description column — also used for SP tasks as JSON {"sortOrder":N} */
  Description?: string;
  jsonTable?: string;
  EvidenceOfCompletion?: { Url?: string; Description?: string };
  Barriers?: string;
  Effort?: number;
  ActionableStatus?: string;
  WBS?: string;
  /** Resolved from Description JSON — controls manual display order within a gate */
  sortOrder?: number;
  /** Resolved from Description JSON — when true, completing this task at 100% triggers a Release record */
  isRelease?: boolean;
  /** Resolved from Description JSON — units released when this release task reaches 100% */
  releaseUnits?: number;
  Checklist?: {
    isChecked: boolean,
    title: string,
    orderHint: string
  };

  // ── Log fields (optional — null means the SP column does not exist yet) ──
  Notes?: INoteEntry[];
  Evidence?: IEvidenceEntry[];
  Approvals?: IApprovalEntry[];
}
