export interface IReportNote {
  id: string;
  /** 'general' or the gate name */
  section: string;
  note: string;
  user: string;
  /** Report date — YYYY-MM-DD, represents the week/period this note belongs to */
  date: string;
  /** ISO timestamp for insertion ordering */
  createdAt: string;
  /** Active notes appear in the current report; archived ones go to history */
  status: 'active' | 'archived';
  /** Set when status changes to 'archived' */
  archivedAt?: string;
  archivedBy?: string;
}
