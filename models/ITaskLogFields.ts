// ─── Task log field interfaces ────────────────────────────────────────────────
// Each field is stored as JSON.stringify(T[]) in a SharePoint Multiline Text column.
// All three are OPTIONAL — if the column does not exist in a list the app silently
// returns null and renders nothing.

export interface INoteEntry {
  date:  string;   // ISO 8601 — "2026-03-30T13:45:00Z"
  user:  string;   // displayName of the author
  note:  string;
}

export interface IEvidenceEntry {
  date:     string;
  user:     string;
  fileName: string;
  fileUrl:  string;
  note?:    string;   // optional description
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface IApprovalEntry {
  date:     string;
  user:     string;   // displayName of the approver
  email:    string;   // email of the approver
  status:   ApprovalStatus;
  comment?: string;
}

// ─── Authorised approvers ─────────────────────────────────────────────────────
export const APPROVERS_EMAILS = [
  'joel@ed2corp.com',
  'sergio@ed2corp.com',
  'saul@ed2corp.com',
] as const;

export type ApproverEmail = typeof APPROVERS_EMAILS[number];

export function isApprover(email: string): boolean {
  return APPROVERS_EMAILS.includes(email.toLowerCase() as ApproverEmail);
}
