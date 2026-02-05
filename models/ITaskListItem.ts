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
  WBS?: string;
  Checklist?: {
    isChecked: boolean,
    title: string,
    orderHint: string
  };
}