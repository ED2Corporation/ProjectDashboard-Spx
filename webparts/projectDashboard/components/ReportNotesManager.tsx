import * as React from 'react';
import { useState, useMemo } from 'react';
import { IReportNote } from '../../../models/IReportNote';
import styles from './ReportNotesManager.module.scss';

interface ReportNotesManagerProps {
  notes: IReportNote[];
  currentUser: string;
  onArchive: (noteIds: string[]) => Promise<void>;
  onUpdate?: (noteId: string, text: string) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
  onClose: () => void;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

const ReportNotesManager: React.FC<ReportNotesManagerProps> = ({ notes, currentUser, onArchive, onUpdate, onDelete, onClose }) => {
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editText,       setEditText]       = useState('');

  // Group notes by section — active first, then archived
  const groups = useMemo(() => {
    const map = new Map<string, { active: IReportNote[]; archived: IReportNote[] }>();
    // Preserve insertion order: general first, then gates in order of first note
    const order: string[] = [];
    for (const n of notes) {
      if (!map.has(n.section)) {
        map.set(n.section, { active: [], archived: [] });
        order.push(n.section);
      }
      const g = map.get(n.section)!;
      if (n.status === 'archived') g.archived.push(n);
      else g.active.push(n);
    }
    // Sort each group by date desc
    map.forEach(g => {
      g.active.sort((a, b) => b.date.localeCompare(a.date));
      g.archived.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
    });
    // General Update always first if present
    const sorted = order.filter(s => s === 'general');
    for (const s of order) { if (s !== 'general') sorted.push(s); }
    return sorted.map(section => ({ section, ...map.get(section)! }));
  }, [notes]);

  const hasActive = groups.some(g => g.active.length > 0);
  const totalActive = groups.reduce((s, g) => s + g.active.length, 0);

  const toggleSelect = (id: string): void => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (): void => {
    const all = ([] as string[]).concat(...groups.map(g => g.active.map(n => n.id)));
    setSelected(new Set(all));
  };

  const deselectAll = (): void => setSelected(new Set());

  const toggleGroupHistory = (section: string): void => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const startEdit = (n: IReportNote): void => {
    setEditingId(n.id);
    setEditText(n.note);
    setError('');
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditText('');
  };

  const commitEdit = async (noteId: string): Promise<void> => {
    const text = editText.trim();
    if (!text) { setError('Note text cannot be empty.'); return; }
    setSaving(true);
    setError('');
    try {
      if (onUpdate) await onUpdate(noteId, text);
      setEditingId(null);
      setEditText('');
    } catch {
      setError('Failed to update note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string): Promise<void> => {
    setSaving(true);
    setError('');
    try {
      if (onDelete) await onDelete(noteId);
      setSelected(prev => { const next = new Set(prev); next.delete(noteId); return next; });
    } catch {
      setError('Failed to delete note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (): Promise<void> => {
    if (selected.size === 0) return;
    setSaving(true);
    setError('');
    try {
      await onArchive([...selected]);
      setSelected(new Set());
    } catch {
      setError('Failed to archive notes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const sectionLabel = (s: string): string => s === 'general' ? 'General Update' : s;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()} role="dialog" aria-label="Manage Report Notes">

        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Manage Report Notes</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
        </div>

        <div className={styles.panelSubtitle}>
          Check active notes to archive — they will be removed from the current report and stored in history.
        </div>

        {hasActive && (
          <div className={styles.selectBar}>
            <button type="button" className={styles.selectLink} onClick={selectAll} disabled={saving}>
              Select all ({totalActive})
            </button>
            {selected.size > 0 && (
              <button type="button" className={styles.selectLink} onClick={deselectAll} disabled={saving}>
                Deselect all
              </button>
            )}
          </div>
        )}

        <div className={styles.groupList}>
          {groups.map(group => (
            <div key={group.section} className={styles.group}>

              {/* Section header */}
              <div className={styles.groupHeader}>
                <span className={styles.groupLabel}>{sectionLabel(group.section)}</span>
                <span className={styles.groupCount}>
                  {group.active.length} active · {group.archived.length} archived
                </span>
              </div>

              {/* Active notes with checkboxes */}
              {group.active.length > 0 ? (
                <ul className={styles.noteList}>
                  {group.active.map(n => (
                    <li
                      key={n.id}
                      className={`${styles.noteRow} ${selected.has(n.id) && editingId !== n.id ? styles.noteRowSelected : ''}`}
                      onClick={() => { if (editingId !== n.id) toggleSelect(n.id); }}
                    >
                      {editingId === n.id ? (
                        <div className={styles.editRow} onClick={e => e.stopPropagation()}>
                          <textarea
                            className={styles.editTextarea}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={3}
                            autoFocus
                          />
                          <div className={styles.editActions}>
                            <button type="button" className={styles.saveEditBtn} onClick={() => commitEdit(n.id)} disabled={saving}>Save</button>
                            <button type="button" className={styles.cancelEditBtn} onClick={cancelEdit} disabled={saving}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <input
                            type="checkbox"
                            className={styles.noteCheckbox}
                            checked={selected.has(n.id)}
                            onChange={() => toggleSelect(n.id)}
                            onClick={e => e.stopPropagation()}
                          />
                          <div className={styles.noteContent}>
                            <span className={styles.noteText}>{n.note}</span>
                            <span className={styles.noteMeta}>{fmtDate(n.date)} · {n.user}</span>
                          </div>
                          <div className={styles.noteActions} onClick={e => e.stopPropagation()}>
                            {onUpdate && (
                              <button type="button" className={styles.editBtn} onClick={() => startEdit(n)} title="Edit" disabled={saving}>✎</button>
                            )}
                            {onDelete && (
                              <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(n.id)} title="Delete" disabled={saving}>✕</button>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.noActive}>No active notes in this section.</div>
              )}

              {/* Archived notes — collapsible */}
              {group.archived.length > 0 && (
                <div className={styles.historySection}>
                  <button
                    type="button"
                    className={styles.historyToggle}
                    onClick={() => toggleGroupHistory(group.section)}
                  >
                    {expandedGroups.has(group.section) ? '▾' : '▸'} {group.archived.length} archived note{group.archived.length !== 1 ? 's' : ''}
                  </button>
                  {expandedGroups.has(group.section) && (
                    <ul className={styles.historyList}>
                      {group.archived.map(n => (
                        <li key={n.id} className={styles.historyRow}>
                          <span className={styles.historyText}>{n.note}</span>
                          <span className={styles.historyMeta}>
                            {fmtDate(n.date)} · archived {n.archivedAt ? fmtDate(n.archivedAt.slice(0, 10)) : ''} by {n.archivedBy ?? '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

            </div>
          ))}

          {groups.length === 0 && (
            <div className={styles.emptyState}>No report notes recorded yet.</div>
          )}
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.panelFooter}>
          <span className={styles.authorTag}>{currentUser}</span>
          <div className={styles.footerActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
              Close
            </button>
            <button
              type="button"
              className={styles.archiveBtn}
              onClick={handleArchive}
              disabled={saving || selected.size === 0}
            >
              {saving ? 'Archiving…' : `Archive Selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReportNotesManager;
