export interface ITaskListItem {
    Id: string;
    Title: string;
    Complete: number;
    Deliverable: string;
    Task: string;
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
    Checklist?:{
      isChecked: boolean,
      title: string,
      orderHint: string
    };
  }