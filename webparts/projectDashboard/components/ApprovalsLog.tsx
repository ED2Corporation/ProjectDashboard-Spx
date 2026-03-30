import * as React from 'react';
import { useState } from 'react';
import { IApprovalEntry, ApprovalStatus, APPROVERS_EMAILS } from '../../../models/ITaskLogFields';
import styles from './ApprovalsLog.module.scss';

interface ApprovalsLogProps {
  taskTitle: string;
  approvals: IApprovalEntry[] | null;
  currentUserEmail: string;
  currentUserDisplayName: string;
  onSave: (entries: IApprovalEntry[]) => Promise<void>;
  onSendEmail: (to: string[], subject: string, body: string) => Promise<void>;
  onAllApproved?: () => void;
}

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const ApprovalsLog: React.FC<ApprovalsLogProps> = ({
  taskTitle, approvals, currentUserEmail, currentUserDisplayName,
  onSave, onSendEmail, onAllApproved,
}) => {
  const [comment, setComment] = useState('');
  const [busy, setBusy]       = useState(false);

  const entries     = approvals ?? [];
  const isInitiated = entries.length > 0;
  const myPending   = entries.find(
    a => a.email.toLowerCase() === currentUserEmail.toLowerCase() && a.status === 'pending'
  );
  const hasPending  = entries.some(a => a.status === 'pending');
  const allApproved = isInitiated && entries.every(a => a.status === 'approved');

  const handleRequestApproval = async (): Promise<void> => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const newEntries: IApprovalEntry[] = [...APPROVERS_EMAILS].map(email => ({
        date:   now,
        user:   email.split('@')[0],
        email,
        status: 'pending',
      }));
      await onSave(newEntries);
      const subject = `Approval requested: ${taskTitle}`;
      const body = `<p>Task <strong>${taskTitle}</strong> requires your approval.</p><p>Requested by: <strong>${currentUserDisplayName}</strong></p>`;
      await onSendEmail([...APPROVERS_EMAILS], subject, body);
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (decision: 'approved' | 'rejected'): Promise<void> => {
    if (!myPending) return;
    setBusy(true);
    try {
      const updated: IApprovalEntry[] = entries.map(a =>
        a.email.toLowerCase() === currentUserEmail.toLowerCase() && a.status === 'pending'
          ? { ...a, date: new Date().toISOString(), user: currentUserDisplayName, status: decision, comment: comment.trim() || undefined }
          : a
      );
      await onSave(updated);

      if (updated.every(a => a.status === 'approved')) {
        onAllApproved?.();
      }

      if (decision === 'rejected') {
        const subject = `Approval rejected: ${taskTitle}`;
        const body = `<p>Task <strong>${taskTitle}</strong> was <strong>rejected</strong> by ${currentUserDisplayName}.</p>${comment.trim() ? `<p>Comment: ${comment.trim()}</p>` : ''}`;
        await onSendEmail([...APPROVERS_EMAILS], subject, body);
      }

      setComment('');
    } finally {
      setBusy(false);
    }
  };

  const statusClass = (s: ApprovalStatus): string =>
    s === 'approved' ? styles.badgeApproved : s === 'rejected' ? styles.badgeRejected : styles.badgePending;

  return (
    <div className={styles.container}>

      {/* ── Not yet initiated ──────────────────────────────── */}
      {!isInitiated && (
        <div className={styles.initPanel}>
          <p className={styles.empty}>No approval process started.</p>
          <button type="button" className={styles.requestBtn} onClick={handleRequestApproval} disabled={busy}>
            {busy ? 'Sending…' : 'Request Approval'}
          </button>
        </div>
      )}

      {/* ── Entry list ─────────────────────────────────────── */}
      {isInitiated && (
        <div className={styles.feed}>
          {entries.map((a, i) => (
            <div key={i} className={styles.entry}>
              <div className={styles.meta}>
                <span className={styles.user}>{a.user || a.email}</span>
                <span className={styles.date}>{new Date(a.date).toLocaleString()}</span>
                <span className={statusClass(a.status)}>{STATUS_LABELS[a.status]}</span>
              </div>
              {a.comment && <p className={styles.commentText}>{a.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── All approved banner ────────────────────────────── */}
      {allApproved && (
        <div className={styles.approvedBanner}>All approvals received ✓</div>
      )}

      {/* ── Waiting notice ─────────────────────────────────── */}
      {isInitiated && !myPending && hasPending && !allApproved && (
        <p className={styles.waitingNote}>Waiting for all approvers to respond.</p>
      )}

      {/* ── Decision panel (for the current approver) ──────── */}
      {myPending && (
        <div className={styles.decisionPanel}>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Optional comment…"
            className={styles.textarea}
            rows={2}
          />
          <div className={styles.decisionBtns}>
            <button type="button" className={styles.approveBtn} onClick={() => handleDecision('approved')} disabled={busy}>
              {busy ? '…' : 'Approve'}
            </button>
            <button type="button" className={styles.rejectBtn} onClick={() => handleDecision('rejected')} disabled={busy}>
              {busy ? '…' : 'Reject'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ApprovalsLog;
