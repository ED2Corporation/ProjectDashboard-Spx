import * as React from 'react';
import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { ITaskListItem } from '../../../models/ITaskListItem';
import { IGateListItem } from '../../../models/IGateListItem';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { INoteEntry } from '../../../models/ITaskLogFields';
import { IReportNote } from '../../../models/IReportNote';
import { uid } from './ReportNotesPanel';
import styles from './WOReportView.module.scss';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WOReportViewProps {
  tasks:          ITaskListItem[];
  gates:          IGateListItem[];
  activeGate:     string | undefined;
  onGateClick:    (gate: string | undefined) => void;
  project?:       IProjectCatalogItem;
  projectTitle?:  string;
  currentUser?:   string;
  onPrintReady?:  (fn: () => void) => void;
  onSaveNote?:    (note: IReportNote) => Promise<void>;
  onUpdateNote?:  (noteId: string, text: string) => Promise<void>;
  onDeleteNote?:  (noteId: string) => Promise<void>;
  onArchiveNotes?: (noteIds: string[], archivedBy: string) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return `${dt.getMonth() + 1}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
}

function gateStatus(complete: number): { label: string; cls: string } {
  if (complete >= 100) return { label: 'Completed',   cls: styles.statusCompleted  };
  if (complete > 0)    return { label: 'In Progress', cls: styles.statusInProgress };
  return                      { label: 'Not Started', cls: styles.statusNotStarted };
}

function lotStatus(complete: number): { label: string; cls: string } {
  if (complete >= 100) return { label: 'Delivered',   cls: styles.statusCompleted  };
  if (complete > 0)    return { label: 'In Progress', cls: styles.statusInProgress };
  return                      { label: 'Scheduled',   cls: styles.statusNotStarted };
}

function currentReportMonday(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun, 1=Mon...
  const daysToMon = dow === 1 ? 0 : dow === 0 ? 1 : (8 - dow);
  d.setDate(d.getDate() + daysToMon);
  return d.toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

const WOReportView: React.FC<WOReportViewProps> = ({
  tasks, gates, activeGate, onGateClick, project, projectTitle, currentUser, onPrintReady,
  onSaveNote, onUpdateNote, onDeleteNote, onArchiveNotes,
}) => {
  const reportRef   = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Report date (defaults to current/next Monday) ─────────────────────────
  const [reportDate, setReportDate] = useState(currentReportMonday);

  // ── Notes state ───────────────────────────────────────────────────────────
  const [localReportNotes, setLocalReportNotes] = useState<IReportNote[]>(() => {
    try {
      const details: Record<string, unknown> = JSON.parse(project?.ProjectDetails ?? '{}');
      return (details.reportNotes as IReportNote[] | undefined) ?? [];
    } catch { return []; }
  });

  // Sync when the project prop updates (e.g. after SP re-fetch)
  useEffect(() => {
    try {
      const details: Record<string, unknown> = JSON.parse(project?.ProjectDetails ?? '{}');
      setLocalReportNotes((details.reportNotes as IReportNote[] | undefined) ?? []);
    } catch { setLocalReportNotes([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.ProjectDetails]);

  const [editingNoteId,      setEditingNoteId]      = useState<string | null>(null);
  const [editText,           setEditText]           = useState('');
  const [addingSection,      setAddingSection]      = useState<string | null>(null);
  const [addingText,         setAddingText]         = useState('');
  const [selectedGateForNote, setSelectedGateForNote] = useState<string | null>(null);

  const canEdit = !!(onSaveNote || onUpdateNote || onDeleteNote || onArchiveNotes);

  // ── PDF print ─────────────────────────────────────────────────────────────
  // Clone the report directly into <body> so display:none on siblings removes
  // their layout space, preventing blank extra pages.
  const handlePrint = useCallback((): void => {
    const el = reportRef.current;
    if (!el) return;

    const CLONE_ID  = 'wo-report-print-clone';
    const STYLE_ID  = 'wo-report-print-style';

    // Build clone, strip editing controls
    const clone = el.cloneNode(true) as HTMLElement;
    clone.id = CLONE_ID;
    clone.querySelectorAll<HTMLElement>('[data-no-print]').forEach(n => n.remove());

    document.body.appendChild(clone);

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media print {
        @page { size: landscape; }
        body {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body > *:not(#${CLONE_ID}) { display: none !important; }
        #${CLONE_ID} {
          position: static !important;
          width: 100% !important;
          max-width: none !important;
          background: #fff !important;
          box-sizing: border-box !important;
        }
      }
    `;
    document.head.appendChild(style);

    const title = document.title;
    document.title = projectTitle ? `WO Report — ${projectTitle}` : 'WO Report';
    window.print();
    document.title = title;

    document.head.removeChild(style);
    document.body.removeChild(clone);
  }, [projectTitle]);

  React.useEffect(() => { onPrintReady?.(handlePrint); }, [handlePrint, onPrintReady]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const tasksByGate = useMemo(() => {
    const map: Record<string, ITaskListItem[]> = {};
    for (const t of tasks) {
      if (!map[t.Gate]) map[t.Gate] = [];
      map[t.Gate].push(t);
    }
    return map;
  }, [tasks]);

  const releaseTasks = useMemo(() => tasks.filter(t => t.isRelease), [tasks]);

  const lotsWithCumulative = useMemo(() => {
    let running = 0;
    return releaseTasks.map(t => {
      const delivered = t.Complete >= 100;
      if (delivered) running += (t.releaseUnits ?? 0);
      return { task: t, cumulative: delivered ? running : 0 };
    });
  }, [releaseTasks]);

  const needByDate = useMemo(() => {
    const last = [...gates].reverse().find(g => g.Finish);
    return last?.Finish;
  }, [gates]);

  // Active report notes per section (sorted date desc)
  const activeNotesBySection = useMemo(() => {
    const map = new Map<string, IReportNote[]>();
    for (const n of localReportNotes) {
      if (n.status !== 'active') continue;
      const arr = map.get(n.section) ?? [];
      arr.push(n);
      map.set(n.section, arr);
    }
    map.forEach((arr, key) => map.set(key, arr.sort((a, b) => b.date.localeCompare(a.date))));
    return map;
  }, [localReportNotes]);

  const getActionNotesForGate = (gate: string): INoteEntry[] => {
    const all = tasksByGate[gate] ?? [];
    const entries: INoteEntry[] = ([] as INoteEntry[]).concat(
      ...all.map(t => (t.Notes ?? []).filter(n => n.badge === 'action'))
    );
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  };

  const allActionNotes = useMemo(() => {
    const entries: INoteEntry[] = ([] as INoteEntry[]).concat(
      ...tasks.map(t => (t.Notes ?? []).filter(n => n.badge === 'action'))
    );
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [tasks]);

  const visibleGates = useMemo(
    () => activeGate ? gates.filter(g => g.Gate === activeGate) : gates,
    [gates, activeGate]
  );

  const gatesWithNotes = visibleGates.filter(g => getActionNotesForGate(g.Gate).length > 0);

  // ── Identity strings ──────────────────────────────────────────────────────
  const bannerParts: string[] = [];
  if (project?.poNumberCustomer) {
    const num = project.poNumberCustomer.replace(/\D/g, '');
    bannerParts.push(`PO-${num || project.poNumberCustomer}`);
  }
  if (project?.WorkOrder) bannerParts.push(`WO-${project.WorkOrder}`);

  // ── Note handlers ─────────────────────────────────────────────────────────
  const startEdit = (n: IReportNote): void => {
    setEditingNoteId(n.id);
    setEditText(n.note);
    setAddingSection(null);
  };

  const cancelEdit = (): void => { setEditingNoteId(null); setEditText(''); };

  const commitEdit = async (noteId: string): Promise<void> => {
    const text = editText.trim();
    if (!text) return;
    setLocalReportNotes(prev => prev.map(n => n.id === noteId ? { ...n, note: text } : n));
    setEditingNoteId(null);
    setEditText('');
    if (onUpdateNote) await onUpdateNote(noteId, text);
  };

  const startAdd = (section: string): void => {
    setAddingSection(section);
    setAddingText('');
    setEditingNoteId(null);
  };

  const cancelAdd = (): void => { setAddingSection(null); setAddingText(''); };

  const commitAdd = async (section: string): Promise<void> => {
    const text = addingText.trim();
    if (!text) { cancelAdd(); return; }
    const note: IReportNote = {
      id: uid(),
      section,
      note: text,
      user: currentUser ?? '',
      date: reportDate,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    setLocalReportNotes(prev => [...prev, note]);
    cancelAdd();
    if (onSaveNote) await onSaveNote(note);
  };

  const handleDeleteNote = async (noteId: string): Promise<void> => {
    setLocalReportNotes(prev => prev.filter(n => n.id !== noteId));
    if (onDeleteNote) await onDeleteNote(noteId);
  };

  const handleArchiveSingleNote = async (noteId: string): Promise<void> => {
    const now = new Date().toISOString();
    const user = currentUser ?? '';
    setLocalReportNotes(prev => prev.map(n =>
      n.id === noteId ? { ...n, status: 'archived' as const, archivedAt: now, archivedBy: user } : n
    ));
    if (onArchiveNotes) await onArchiveNotes([noteId], user);
  };

  // ── Per-note row renderer ─────────────────────────────────────────────────
  const renderNoteRow = (n: IReportNote): React.ReactElement => {
    if (editingNoteId === n.id) {
      return (
        <div className={styles.inlineAddRow}>
          <textarea
            className={styles.inlineEditArea}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            autoFocus
            rows={2}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commitEdit(n.id); }
              if (e.key === 'Escape') cancelEdit();
            }}
          />
          <div className={styles.inlineEditActions} data-no-print>
            <button type="button" className={styles.inlineSaveBtn} onClick={() => commitEdit(n.id)}>Save</button>
            <button type="button" className={styles.inlineCancelBtn} onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.noteRowWrap}>
        <span
          className={`${styles.noteTextClickable}${canEdit ? ` ${styles.noteTextEditable}` : ''}`}
          onClick={canEdit ? () => startEdit(n) : undefined}
        >{n.note}</span>
        {canEdit && (
          <div className={styles.noteIconBar} data-no-print>
            {onArchiveNotes && (
              <button type="button" className={styles.iconArchiveBtn} onClick={() => handleArchiveSingleNote(n.id)} title="Archive">⬇</button>
            )}
            {onDeleteNote && (
              <button type="button" className={styles.iconDeleteBtn} onClick={() => handleDeleteNote(n.id)} title="Delete">✕</button>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.report} ref={reportRef}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageTitle}>
            Purchase Order: {project?.ProjectNumber ?? projectTitle}
          </div>
          <div className={styles.pageLabel}>
            Individual Purchase &amp; Work Order Detail Ledgers
          </div>
        </div>
        <div className={styles.pageHeaderRight}>
          <div className={styles.reportDateGroup}>
            <span className={styles.reportDateLabel}>Report</span>
            <span
              className={`${styles.reportDateDisplay}${canEdit ? ` ${styles.reportDateClickable}` : ''}`}
              onClick={canEdit ? () => {
                const inp = dateInputRef.current;
                if (!inp) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (typeof (inp as any).showPicker === 'function') (inp as any).showPicker();
                else inp.click();
              } : undefined}
              title={canEdit ? 'Click to change date' : undefined}
            >{fmtDate(reportDate)}</span>
            {canEdit && (
              <input
                ref={dateInputRef}
                id="wo-report-date"
                type="date"
                className={styles.reportDateInput}
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
                data-no-print
              />
            )}
          </div>
          {canEdit && (
            <div className={styles.gateSelectorRow} data-no-print>
              {gates.filter(g => g.Complete < 100).map(g => (
                <button
                  key={g.Gate}
                  type="button"
                  className={`${styles.gateBadge} ${selectedGateForNote === g.Gate ? styles.gateBadgeActive : ''}`}
                  onClick={() => setSelectedGateForNote(prev => prev === g.Gate ? null : g.Gate)}
                >{g.Gate}</button>
              ))}
              <button
                type="button"
                className={styles.addNoteIconBtn}
                onClick={() => startAdd(selectedGateForNote ?? 'general')}
                title={`Add note to ${selectedGateForNote ?? 'General Update'}`}
              >+</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 1: PO Summary (left, with banner) + Project Notes (right) ── */}
      <div className={styles.row1}>

        {/* Col 1 — Banner + PO Summary */}
        <div className={styles.rowCell}>

          {bannerParts.length > 0 && (
            <div className={styles.identityBanner}>
              {bannerParts.map((part, i) => (
                <React.Fragment key={part}>
                  {i > 0 && <span className={styles.bannerSep}>|</span>}
                  <span>{part}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {project && (
            <div className={styles.poSummary}>
              {project.PartNumber && <div className={styles.summaryRow}><span className={styles.summaryLabel}>Part Number</span><span className={styles.summaryValue}>{project.PartNumber}</span></div>}
              {project.Customer   && <div className={styles.summaryRow}><span className={styles.summaryLabel}>Customer</span><span className={styles.summaryValue}>{project.Customer}</span></div>}
              {project.Units      && <div className={styles.summaryRow}><span className={styles.summaryLabel}>Quantity</span><span className={styles.summaryValue}>{project.Units}</span></div>}
              <div className={styles.summaryRow}><span className={styles.summaryLabel}>Need by Date</span><span className={styles.summaryValue}>{fmtDate(needByDate)}</span></div>
              <div className={styles.summaryRow}><span className={styles.summaryLabel}>Projected Date</span><span className={`${styles.summaryValue} ${styles.summaryValueTbd}`}>TBD</span></div>
            </div>
          )}
        </div>

        {/* Col 2 — Project Notes */}
        <div className={styles.rowCell}>

          {/* Inline add form */}
          {addingSection !== null && (
            <div className={styles.inlineAddRow} data-no-print>
              <div className={styles.inlineAddLabel}>
                Adding note to: <strong>{addingSection === 'general' ? 'General Update' : addingSection}</strong>
              </div>
              <textarea
                className={styles.inlineEditArea}
                value={addingText}
                onChange={e => setAddingText(e.target.value)}
                autoFocus
                rows={2}
                placeholder="Add note…"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commitAdd(addingSection); }
                  if (e.key === 'Escape') cancelAdd();
                }}
              />
              <div className={styles.inlineEditActions}>
                <button type="button" className={styles.inlineSaveBtn} onClick={() => commitAdd(addingSection)}>Save</button>
                <button type="button" className={styles.inlineCancelBtn} onClick={cancelAdd}>Cancel</button>
              </div>
            </div>
          )}

          {/* Notes groups — only sections that have notes */}
          {(() => {
            const groups: Array<{ key: string; label: string; rNotes: IReportNote[]; tNotes: INoteEntry[] }> = [];
            const gRNotes = activeNotesBySection.get('general') ?? [];
            if (gRNotes.length > 0 || allActionNotes.length > 0)
              groups.push({ key: 'general', label: 'General Update:', rNotes: gRNotes, tNotes: allActionNotes });
            for (const gate of visibleGates) {
              const rN = activeNotesBySection.get(gate.Gate) ?? [];
              const tN = getActionNotesForGate(gate.Gate);
              if (rN.length > 0 || tN.length > 0)
                groups.push({ key: gate.Gate, label: gate.Gate, rNotes: rN, tNotes: tN });
            }
            if (groups.length === 0)
              return <span className={styles.notesEmpty}>No notes recorded.</span>;
            return groups.map(({ key, label, rNotes, tNotes }) => (
              <div key={key} className={styles.notesGroup}>
                <div className={styles.notesSectionTitle}>{label}</div>
                <ul className={styles.notesList}>
                  {rNotes.length > 0
                    ? rNotes.map(n => <li key={n.id} className={styles.notesItem}>{renderNoteRow(n)}</li>)
                    : tNotes.map((n, i) => <li key={i} className={styles.notesItem}>{n.note}</li>)
                  }
                </ul>
              </div>
            ));
          })()}

        </div>

      </div>

      {/* ── Row 2: Phases table (left) + LOT table (right) ───────────────── */}
      <div className={styles.row2}>

        {/* Col 1 — Work Order Execution */}
        <div className={styles.rowCell}>
          <div className={styles.sectionHeader}>Work Order Execution</div>
          <table className={styles.phaseTable}>
            <thead>
              <tr>
                <th className={styles.colNum}>#</th>
                <th>Production Phases</th>
                <th>Status</th>
                <th className={styles.colMetric}>Metric</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g, i) => {
                const { label, cls } = gateStatus(g.Complete);
                const isActive = activeGate === g.Gate;
                return (
                  <tr
                    key={g.Gate}
                    className={isActive ? styles.rowActive : ''}
                    onClick={() => onGateClick(isActive ? undefined : g.Gate)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{i + 1}</td>
                    <td>{g.Gate}</td>
                    <td><span className={cls}>{label}</span></td>
                    <td className={styles.colMetric}>{Math.round(g.Complete)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Col 2 — LOT Schedule */}
        <div className={styles.rowCell}>
          {releaseTasks.length > 0 ? (
            <>
              <div className={styles.sectionHeader}>LOT Schedule</div>
              <table className={styles.phaseTable}>
                <thead>
                  <tr>
                    <th className={styles.colLotNum}>LOT #</th>
                    <th className={styles.colShipment}>Shipment</th>
                    <th>Status</th>
                    <th>Target Date</th>
                    <th className={styles.colLotUnits}>Total Units</th>
                  </tr>
                </thead>
                <tbody>
                  {lotsWithCumulative.map(({ task: t, cumulative }, i) => {
                    const { label, cls } = lotStatus(t.Complete);
                    return (
                      <tr key={t.Id}>
                        <td className={styles.colLotNum}>{i + 1}</td>
                        <td>{t.Task}</td>
                        <td><span className={cls}>{label}</span></td>
                        <td>{fmtDate(t.Finish)}</td>
                        <td className={styles.colLotUnits}>
                          {t.Complete >= 100
                            ? `${cumulative} of ${project?.Units ?? '—'}`
                            : `0 of ${project?.Units ?? '—'}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <span className={styles.notesEmpty}>No LOT releases defined.</span>
          )}
        </div>

      </div>

      {/* ── Detailed gate notes (preserved for extended use) ──────────────── */}
      {gatesWithNotes.length > 1 && (
        <div className={styles.detailedNotes}>
          {gatesWithNotes.map(gate => {
            const notes = getActionNotesForGate(gate.Gate);
            return (
              <div key={gate.Gate} className={styles.gateLogBlock}>
                <div className={styles.gateLogGateName}>{gate.Gate}</div>
                <ul className={styles.gateLogList}>
                  {notes.map((n, i) => (
                    <li key={i} className={styles.gateLogItem}>{n.note}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default WOReportView;
