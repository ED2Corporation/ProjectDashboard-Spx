export interface ITaskListItem {
  Id: string;
  Gate: string;
  Task: string;
  Deliverable: string;
  Complete: number;
  Description?: string;
  Responsible?: {
    Url: string,
    Description: string
  };
  Start?: Date;
  Finish?: Date;
  Barriers?: string;
  ActualFinish?: Date;
  Effort?: number;
  ActionableStatus?: string;
  WBS?: string;
  EvidenceOfCompletion?: {
    Url: string,
    Description: string
  };
  Checklist?: {
    isChecked: boolean,
    title: string,
    orderHint: string
  };
}