import * as React from 'react';
import { useState } from 'react';
import { IApprovalEntry, ApprovalStatus, ApproverRole, PRIMARY_APPROVER, MANAGER_EMAILS } from '../../../models/ITaskLogFields';
import styles from './ApprovalsLog.module.scss';

interface ApprovalsLogProps {
  taskTitle: string;
  approvals: IApprovalEntry[] | null;
  currentUserEmail: string;
  currentUserDisplayName: string;
  canManageApprovers?: boolean;
  onSave: (entries: IApprovalEntry[]) => Promise<void>;
  onSendEmail: (to: string[], subject: string, body: string) => Promise<void>;
  onAllApproved?: () => void;
  onSearchUsers?: (query: string) => Promise<{ displayName: string; email: string }[]>;
  onSaveNote?: (text: string) => Promise<void>;
  buildApprovalEmail?: (requestedBy: string) => { subject: string; body: string };
}

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const ApprovalsLog: React.FC<ApprovalsLogProps> = ({
  taskTitle, approvals, currentUserEmail, currentUserDisplayName,
  canManageApprovers = false, onSave, onSendEmail, onAllApproved, onSearchUsers, onSaveNote, buildApprovalEmail,
}) => {
  const [comment, setComment]           = useState('');
  const [busy, setBusy]                 = useState(false);
  const [showManage, setShowManage]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<{ displayName: string; email: string }[]>([]);
  const [searching, setSearching]       = useState(false);
  const [reopenRejected, setReopenRejected] = useState(false);

  const entries     = approvals ?? [];
  const isInitiated = entries.length > 0;
  const myPending   = entries.find(
    a => a.email.toLowerCase() === currentUserEmail.toLowerCase() && a.status === 'pending'
  );
  const myRejected = entries.find(
    a => a.email.toLowerCase() === currentUserEmail.toLowerCase() && a.status === 'rejected'
  );
  const activeDecisionEntry = myPending ?? (reopenRejected ? myRejected : undefined);
  const hasPending  = entries.some(a => a.status === 'pending');
  const allApproved = isInitiated && entries.every(a => a.status === 'approved');

  const handleSearch = async (): Promise<void> => {
    if (!searchQuery.trim() || !onSearchUsers) return;
    setSearching(true);
    try {
      const results = await onSearchUsers(searchQuery.trim());
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  const handleRemoveApprover = async (email: string): Promise<void> => {
    setBusy(true);
    try {
      const removed = entries.find(a => a.email.toLowerCase() === email.toLowerCase());
      const updated = entries.filter(a => a.email.toLowerCase() !== email.toLowerCase());
      await onSave(updated);
      if (removed) {
        await onSaveNote?.(`Approver removed: ${removed.user || removed.email} (${removed.email}) — by ${currentUserDisplayName}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAddApprover = async (user: { displayName: string; email: string }): Promise<void> => {
    const alreadyIn = entries.some(a => a.email.toLowerCase() === user.email.toLowerCase());
    if (alreadyIn) return;
    setBusy(true);
    try {
      const role: ApproverRole =
        user.email.toLowerCase() === PRIMARY_APPROVER    ? 'primary'  :
        MANAGER_EMAILS.includes(user.email.toLowerCase() as typeof MANAGER_EMAILS[number]) ? 'delegate' : 'additional';
      const newEntry: IApprovalEntry = {
        date:   new Date().toISOString(),
        user:   user.displayName,
        email:  user.email,
        status: 'pending',
        role,
      };
      await onSave([...entries, newEntry]);
      const addEmail = buildApprovalEmail
        ? buildApprovalEmail(currentUserDisplayName)
        : { subject: `Approval requested: ${taskTitle}`, body: `<p>Task <strong>${taskTitle}</strong> requires your approval.</p><p>Added by: <strong>${currentUserDisplayName}</strong></p>` };
      await onSendEmail([user.email], addEmail.subject, addEmail.body);
      await onSaveNote?.(`Approver added: ${user.displayName} (${user.email}) — by ${currentUserDisplayName}`);
      setSearchResults(prev => prev.filter(r => r.email.toLowerCase() !== user.email.toLowerCase()));
    } finally {
      setBusy(false);
    }
  };

  const handleRequestApproval = async (): Promise<void> => {
    setBusy(true);
    try {
      let recipients: string[] = [];

      if (entries.length === 0) {
        const entry: IApprovalEntry = {
          date:   new Date().toISOString(),
          user:   'Joel',
          email:  PRIMARY_APPROVER,
          status: 'pending',
          role:   'primary',
        };
        await onSave([entry]);
        recipients = [PRIMARY_APPROVER];
      } else {
        recipients = entries.map(a => a.email);
      }

      const email = buildApprovalEmail
        ? buildApprovalEmail(currentUserDisplayName)
        : { subject: `Approval requested: ${taskTitle}`, body: `<p>Task <strong>${taskTitle}</strong> requires your approval.</p><p>Requested by: <strong>${currentUserDisplayName}</strong></p>` };
      await onSendEmail(recipients, email.subject, email.body);
      await onSaveNote?.(`Approval request sent to: ${recipients.join(', ')} by ${currentUserDisplayName}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (decision: 'approved' | 'rejected'): Promise<void> => {
    if (!activeDecisionEntry) return;
    setBusy(true);
    try {
      const updated: IApprovalEntry[] = entries.map(a =>
        a.email.toLowerCase() === activeDecisionEntry.email.toLowerCase() && a.status === activeDecisionEntry.status
          ? { ...a, date: new Date().toISOString(), user: currentUserDisplayName, status: decision, comment: comment.trim() || undefined }
          : a
      );
      await onSave(updated);
      await onSaveNote?.(
        decision === 'approved'
          ? `Approval approved by ${currentUserDisplayName}${comment.trim() ? `. Note: ${comment.trim()}` : ''}`
          : `Approval rejected by ${currentUserDisplayName}${comment.trim() ? `. Note: ${comment.trim()}` : ''}`
      );

      if (updated.every(a => a.status === 'approved')) {
        onAllApproved?.();
      }

      if (decision === 'rejected') {
        const subject = `Approval rejected: ${taskTitle}`;
        const body = `<p>Task <strong>${taskTitle}</strong> was <strong>rejected</strong> by ${currentUserDisplayName}.</p>${comment.trim() ? `<p>Comment: ${comment.trim()}</p>` : ''}`;
        await onSendEmail(entries.map(a => a.email), subject, body);
      }

      setComment('');
      setReopenRejected(false);
    } finally {
      setBusy(false);
    }
  };

  const statusClass = (s: ApprovalStatus): string =>
    s === 'approved' ? styles.badgeApproved : s === 'rejected' ? styles.badgeRejected : styles.badgePending;

  const canReopenDecision = (entry: IApprovalEntry): boolean =>
    entry.status === 'rejected' && entry.email.toLowerCase() === currentUserEmail.toLowerCase();

  const toggleManage = (): void => {
    setShowManage(prev => !prev);
    setSearchQuery('');
    setSearchResults([]);
  };


  return (
    <div className={styles.container}>

      {/* ── Not yet initiated ──────────────────────────────── */}
      {!isInitiated && (
        <div className={styles.initPanel}>
          <p className={styles.empty}>No approval process started.</p>
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
                <button
                  type="button"
                  className={`${statusClass(a.status)} ${canReopenDecision(a) ? styles.statusButton : styles.statusStatic}`}
                  onClick={() => {
                    if (!canReopenDecision(a)) return;
                    setReopenRejected(prev => !prev);
                    setComment(a.comment ?? '');
                  }}
                  disabled={!canReopenDecision(a)}
                >
                  {STATUS_LABELS[a.status]}
                </button>
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
      {activeDecisionEntry && (
        <div className={styles.decisionPanel}>
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add note..."
            className={styles.decisionInput}
          />
          <button type="button" className={styles.approveBtn} onClick={() => handleDecision('approved')} disabled={busy}>
            {busy ? '...' : 'Approve'}
          </button>
          <button type="button" className={styles.rejectBtn} onClick={() => handleDecision('rejected')} disabled={busy}>
            {busy ? '...' : 'Reject'}
          </button>
        </div>
      )}

      {/* ── Manage Approvers ───────────────────────────────── */}
      <div className={styles.manageSection}>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.requestBtn}
            onClick={() => {
              handleRequestApproval().catch(error => {
                console.error('[ApprovalsLog] Failed to request approval', error);
              });
            }}
            disabled={busy}
          >
            {busy ? 'Sending...' : (isInitiated ? 'Resend Request' : 'Request Approval')}
          </button>

          {canManageApprovers && (
            <button
              type="button"
              className={styles.manageBtn}
              onClick={toggleManage}
            >
              {showManage ? 'Close' : 'Manage Approvers'}
            </button>
          )}
        </div>

        {showManage && canManageApprovers && (
          <div className={styles.managePanel}>

            {/* ── Current approvers as removable chips ── */}
            <p className={styles.manageLabel}>Current approvers</p>
            {entries.length === 0 ? (
              <p className={styles.noResults}>No approvers assigned yet.</p>
            ) : (
              <div className={styles.chipList}>
                {entries.map((a, i) => {
                  const initials = (a.user || a.email)
                    .split(/[\s@.]+/)
                    .slice(0, 2)
                    .map(w => w[0]?.toUpperCase() ?? '')
                    .join('');
                  return (
                    <div key={i} className={`${styles.chip} ${styles[`chip-${a.status}`]}`}>
                      <span className={styles.chipAvatar}>{initials}</span>
                      <div className={styles.chipInfo}>
                        <span className={styles.chipName}>{a.user || a.email}</span>
                        <span className={styles.chipStatus}>
                          {a.role ? `${a.role} · ` : ''}{STATUS_LABELS[a.status]}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        title="Remove approver"
                        disabled={busy}
                        onClick={() => {
                          handleRemoveApprover(a.email).catch(error => {
                            console.error('[ApprovalsLog] Failed to remove approver', error);
                          });
                        }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Add new approver via search ── */}
            {onSearchUsers ? (
              <>
                <p className={styles.manageLabel} style={{ marginTop: 8 }}>Add approver</p>
                <div className={styles.searchRow}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search by name or email…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearch().catch(error => {
                          console.error('[ApprovalsLog] User search failed', error);
                        });
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.searchBtn}
                    onClick={() => {
                      handleSearch().catch(error => {
                        console.error('[ApprovalsLog] User search failed', error);
                      });
                    }}
                    disabled={searching || !searchQuery.trim()}
                  >
                    {searching ? '…' : 'Search'}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <ul className={styles.resultList}>
                    {searchResults.map(u => {
                      const alreadyIn = entries.some(a => a.email.toLowerCase() === u.email.toLowerCase());
                      return (
                        <li key={u.email} className={styles.resultItem}>
                          <div className={styles.resultInfo}>
                            <span className={styles.resultName}>{u.displayName}</span>
                            <span className={styles.resultEmail}>{u.email}</span>
                          </div>
                          <button
                            type="button"
                            className={styles.addBtn}
                            disabled={alreadyIn || busy}
                            onClick={() => {
                              handleAddApprover(u).catch(error => {
                                console.error('[ApprovalsLog] Failed to add approver', error);
                              });
                            }}
                          >
                            {alreadyIn ? 'Added' : 'Add'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {searchResults.length === 0 && !searching && searchQuery.trim() && (
                  <p className={styles.noResults}>No users found.</p>
                )}
              </>
            ) : (
              <p className={styles.noResults}>User search not available.</p>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default ApprovalsLog;
