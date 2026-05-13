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
  note?:    string;
  isEvidenceOfCompletion?: boolean;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApproverRole   = 'primary' | 'delegate' | 'additional';

export interface IApprovalEntry {
  date:     string;
  user:     string;   // displayName of the approver
  email:    string;   // email of the approver
  status:   ApprovalStatus;
  role?:    ApproverRole;
  comment?: string;
  /** When true this approval represents a shipping/release event */
  isReleaseEvent?: boolean;
  /** Units being released — required when isReleaseEvent is true */
  releaseUnits?: number;
  /** Stable UUID used to deduplicate the release record in ProjectDetails.releases */
  releaseId?: string;
}

// ─── Roles ────────────────────────────────────────────────────────────────────
/** Default approver — receives approval request automatically */
export const PRIMARY_APPROVER = 'joel@ed2corp.com';

/** Managers — can add/remove approvers on any task */
export const MANAGER_EMAILS = [
  'joel@ed2corp.com',
  'sergio@ed2corp.com',
  'saul@ed2corp.com',
] as const;

export type ManagerEmail = typeof MANAGER_EMAILS[number];

export function isManager(email: string): boolean {
  return MANAGER_EMAILS.includes(email.toLowerCase() as ManagerEmail);
}

/** @deprecated use isManager */
export const isApprover = isManager;
