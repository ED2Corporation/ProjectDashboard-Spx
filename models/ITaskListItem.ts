export interface ITaskListItem {
  Id: string;
  Gate: string;
  Task: string;
  Deliverable: string;
  Complete: number;
  Start?: Date;
  Finish?: Date;
  ActualFinish?: Date;
  Description?: string;
  Responsible?: {
    Url: string,
    Description: string
  };
  EvidenceOfCompletion?: {
    Url: string,
    Description: string
  };
  Barriers?: string;
  Effort?: number;
  ActionableStatus?: string;
  WBS?: string; //Title-WBS
  Checklist?: {
    isChecked: boolean,
    title: string,
    orderHint: string
  };
}