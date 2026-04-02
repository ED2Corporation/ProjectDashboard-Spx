import { INoteEntry, IEvidenceEntry, IApprovalEntry } from './ITaskLogFields';

export interface ITaskListItem {
  Id: string;
  Title: string; //WBS Task Title
  Gate: string;
  Task: string;
  Deliverable: string;
  Complete: number;
  Start?: Date;
  Finish?: Date;
  ActualFinish?: Date;
  // Planner-only fields (not used in SP lists)
  Description?: string;
  EvidenceOfCompletion?: { Url: string; Description: string };
  Barriers?: string;
  Effort?: number;
  ActionableStatus?: string;
  WBS?: string;
  Checklist?: {
    isChecked: boolean,
    title: string,
    orderHint: string
  };

  // ── Log fields (optional — null means the SP column does not exist yet) ──
  Notes?:     INoteEntry[]     | null;
  Evidence?:  IEvidenceEntry[] | null;
  Approvals?: IApprovalEntry[] | null;
}