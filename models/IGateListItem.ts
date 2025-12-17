export interface IGateListItem {
    [x: string]: any;
    Id: string;
    Title: string;
    Complete: number;
    Delay: number;
    Count: number;
    Effort: number ;
    Start: Date | null;
    Finish: Date | null;
    ActualFinish: Date | null;
  }