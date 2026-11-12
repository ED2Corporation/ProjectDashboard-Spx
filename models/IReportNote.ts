export interface IReportNote {
  id: string;
  /** 'general' or the gate name */
  section: string;
  note: string;
  user: string;
  /** Report week — YYYY-MM-DD of the Monday this note belongs to */
  date: string;
  /** ISO timestamp for insertion ordering */
  createdAt: string;
}
