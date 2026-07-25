export interface IGateListItem {
  Id: string;
  Title?: string;
  Gate: string;
  Complete: number;
  Delay: number;
  Count: number;
  Effort: number;
  Start?: Date;
  Finish?: Date;
  ActualFinish?: Date;
}
