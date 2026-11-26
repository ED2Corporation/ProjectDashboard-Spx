import * as React from 'react';
import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { ITaskListItem } from '../../../models/ITaskListItem';
import { IGateListItem } from '../../../models/IGateListItem';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { INoteEntry } from '../../../models/ITaskLogFields';
import { IReportNote } from '../../../models/IReportNote';
import { getTaskSteps, getTaskLot } from '../utils/TaskDescriptionBlob';
import { appToday, toAppDate } from '../utils/DateUtils';
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
  onSaveNote?:   (note: IReportNote) => Promise<void>;
  onUpdateNote?: (noteId: string, text: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseLocalDate(ymd: string): Date {
  const [y, mo, day] = ymd.split('-').map(Number);
  return new Date(y, mo - 1, day);
}

// Snap any date string to the Monday of its ISO week (go back; Sunday → previous Mon)
function snapToMonday(ymd: string): string {
  const d = parseLocalDate(ymd);
  const dow = d.getDay();
  const diff = dow === 1 ? 0 : dow === 0 ? -6 : -(dow - 1);
  if (diff === 0) return ymd;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtWeekRange(mondayYmd: string): string {
  const mon = parseLocalDate(mondayYmd);
  const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
  if (mon.getMonth() === fri.getMonth()) {
    return `${MONTHS[mon.getMonth()]} ${mon.getDate()}–${fri.getDate()}, ${fri.getFullYear()}`;
  }
  return `${MONTHS[mon.getMonth()]} ${mon.getDate()} – ${MONTHS[fri.getMonth()]} ${fri.getDate()}, ${fri.getFullYear()}`;
}

function fmtDate(d?: Date | string): string {
  const ymd = toAppDate(d);
  if (!ymd) return '—';
  const [y, m, day] = ymd.split('-');
  return `${Number(m)}/${Number(day)}/${y.slice(-2)}`;
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

// Default to Monday of the current running week (Sunday → previous Monday)
function currentReportMonday(): string {
  const d = parseLocalDate(appToday());
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow; // Sunday → back 6; else back to Monday
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}

// ─── Component ────────────────────────────────────────────────────────────────

const WOReportView: React.FC<WOReportViewProps> = ({
  tasks, gates, activeGate, onGateClick, project, projectTitle, currentUser, onPrintReady,
  onSaveNote, onUpdateNote, onDeleteNote,
}) => {
  const reportRef      = useRef<HTMLDivElement>(null);
  const dateInputRef   = useRef<HTMLInputElement>(null);
  const historyDateRef = useRef<HTMLInputElement>(null);

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

  const [editingNoteId,       setEditingNoteId]       = useState<string | null>(null);
  const [editText,            setEditText]            = useState('');
  const [addingSection,       setAddingSection]       = useState<string | null>(null);
  const [addingText,          setAddingText]          = useState('');
  const [selectedGateForNote, setSelectedGateForNote] = useState<string | null>(null);
  const [showHistory,         setShowHistory]         = useState(false);
  const [historyWeek,         setHistoryWeek]         = useState<string>('');
  const [historySearch,       setHistorySearch]       = useState('');
  const [expandedLots,        setExpandedLots]        = useState<Set<string>>(new Set());

  const canEdit = !!(onSaveNote || onUpdateNote || onDeleteNote);

  // ── PDF print ─────────────────────────────────────────────────────────────
  // Clone the report directly into <body> so display:none on siblings removes
  // their layout space, preventing blank extra pages.
  const handlePrint = useCallback((): void => {
    const el = reportRef.current;
    if (!el) return;

    const CLONE_ID  = 'wo-report-print-clone';
    const STYLE_ID  = 'wo-report-print-style';

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

  const releaseTasks = useMemo(() => tasks.filter(t => t.isRelease || !!getTaskLot(t.jsonTable)), [tasks]);

  const woLotsTotal = useMemo(() => {
    try {
      const pd = JSON.parse(project?.ProjectDetails ?? '{}');
      if (Array.isArray(pd.lots)) {
        return (pd.lots as Array<{units?: number}>).reduce((s, l) => s + (l.units ?? 0), 0);
      }
    } catch { /* ignore */ }
    return project?.Units ?? 0;
  }, [project]);


  const needByDate = useMemo(() => {
    const last = [...gates].reverse().find(g => g.Finish);
    return last?.Finish;
  }, [gates]);

  const projectedDate = useMemo(() => {
    let latest: Date | undefined;
    for (const t of tasks) {
      if (t.Finish && (!latest || t.Finish > latest)) latest = t.Finish;
    }
    return latest;
  }, [tasks]);

  // Notes for the selected report week — all notes anchored to that Monday.
  const activeNotesBySection = useMemo(() => {
    const map = new Map<string, IReportNote[]>();
    for (const n of localReportNotes) {
      if (n.date !== reportDate) continue;
      const arr = map.get(n.section) ?? [];
      arr.push(n);
      map.set(n.section, arr);
    }
    map.forEach((arr, key) => map.set(key, arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
    return map;
  }, [localReportNotes, reportDate]);

  // All notes from weeks before the current/next Monday
  const pastNotes = useMemo(() => {
    const thisMonday = currentReportMonday();
    return localReportNotes.filter(n => n.date < thisMonday);
  }, [localReportNotes]);

  // Last 2 weeks that actually have at least one note
  const recentWeeks = useMemo(() => {
    const mon = parseLocalDate(currentReportMonday());
    const w1 = new Date(mon); w1.setDate(w1.getDate() - 7);
    const w2 = new Date(mon); w2.setDate(w2.getDate() - 14);
    return [localDateStr(w1), localDateStr(w2)].filter(w => pastNotes.some(n => n.date === w));
  }, [pastNotes]);

  // History panel: filtered notes
  const historyNotes = useMemo(() => {
    let filtered = pastNotes;
    if (historyWeek) filtered = filtered.filter(n => n.date === historyWeek);
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      filtered = filtered.filter(n =>
        n.note.toLowerCase().includes(q) || n.section.toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [pastNotes, historyWeek, historySearch]);

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
    };
    setLocalReportNotes(prev => [...prev, note]);
    cancelAdd();
    if (onSaveNote) await onSaveNote(note);
  };

  const handleDeleteNote = async (noteId: string): Promise<void> => {
    setLocalReportNotes(prev => prev.filter(n => n.id !== noteId));
    if (onDeleteNote) await onDeleteNote(noteId);
  };

  // Copy a past note into the current report week
  const handleCopyNote = async (source: IReportNote): Promise<void> => {
    const note: IReportNote = {
      id: uid(),
      section: source.section,
      note: source.note,
      user: currentUser ?? '',
      date: reportDate,
      createdAt: new Date().toISOString(),
    };
    setLocalReportNotes(prev => [...prev, note]);
    if (onSaveNote) await onSaveNote(note);
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
        {canEdit && onDeleteNote && (
          <div className={styles.noteIconBar} data-no-print>
            <button type="button" className={styles.iconDeleteBtn} onClick={() => handleDeleteNote(n.id)} title="Delete">✕</button>
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

        {/* Row 1: title + report date */}
        <div className={styles.pageHeaderRow1}>
          <div className={styles.pageTitle}>
            Purchase Order: {project?.ProjectNumber ?? projectTitle}
          </div>
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
              title={canEdit ? 'Click to change week' : undefined}
            >{fmtWeekRange(reportDate)}</span>
            {canEdit && (
              <input
                ref={dateInputRef}
                id="wo-report-date"
                type="date"
                className={styles.reportDateInput}
                value={reportDate}
                onChange={e => setReportDate(snapToMonday(e.target.value))}
                data-no-print
              />
            )}
          </div>
        </div>

        {/* Row 2: subtitle + gate badges */}
        <div className={styles.pageHeaderRow2}>
          <div className={styles.pageLabel}>
            Individual Purchase &amp; Work Order Detail Ledgers
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
                className={`${styles.gateBadge} ${showHistory ? styles.gateBadgeActive : ''}`}
                onClick={() => { setShowHistory(prev => !prev); setHistorySearch(''); setHistoryWeek(''); }}
                title="Browse past week notes"
              >History</button>
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

      {/* ── History panel ────────────────────────────────────────────────── */}
      {showHistory && (
        <div className={styles.historyPanel} data-no-print>
          <div className={styles.historyToolbar}>
            <input
              type="text"
              className={styles.historySearch}
              placeholder="Search past notes…"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              autoFocus
            />
            <div className={styles.historyWeekPicker}>
              {historyWeek ? (
                <>
                  <span className={styles.historyWeekDisplay}>{fmtWeekRange(historyWeek)}</span>
                  <button type="button" className={styles.historyClearBtn} onClick={() => setHistoryWeek('')}>✕</button>
                </>
              ) : (
                <span
                  className={`${styles.historyWeekDisplay} ${styles.historyWeekClickable}`}
                  onClick={() => {
                    const inp = historyDateRef.current;
                    if (!inp) return;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (typeof (inp as any).showPicker === 'function') (inp as any).showPicker();
                    else inp.click();
                  }}
                >Select week</span>
              )}
              <input
                ref={historyDateRef}
                type="date"
                className={styles.reportDateInput}
                value={historyWeek}
                onChange={e => setHistoryWeek(snapToMonday(e.target.value))}
              />
            </div>
          </div>

          {/* Empty state: history open but no past notes at all */}
          {!historyWeek && !historySearch.trim() && pastNotes.length === 0 && (
            <span className={styles.notesEmpty}>No past notes recorded.</span>
          )}

          {/* Recent: last 2 weeks with notes (shown when no search/filter) */}
          {!historyWeek && !historySearch.trim() && recentWeeks.length > 0 && (
            <div>
              <div className={styles.historySectionLabel}>Recent</div>
              {recentWeeks.map(w => {
                const wNotes = pastNotes.filter(n => n.date === w);
                return (
                  <div key={w} className={styles.historyWeekBlock}>
                    <div className={styles.historyWeekTitle}>{fmtWeekRange(w)}</div>
                    {wNotes.map(n => (
                      <div key={n.id} className={styles.historyNoteRow}>
                        <span className={styles.historyNoteSection}>{n.section === 'general' ? 'General' : n.section}</span>
                        <span className={styles.historyNoteText}>{n.note}</span>
                        <button type="button" className={styles.historyCopyBtn} onClick={() => handleCopyNote(n)} title="Add to current report">+</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Search / week filter results */}
          {(historyWeek || historySearch.trim()) && (
            <div>
              {historyNotes.length === 0
                ? <span className={styles.notesEmpty}>No notes found.</span>
                : historyNotes.map(n => (
                    <div key={n.id} className={styles.historyNoteRow}>
                      <span className={styles.historyNoteSection}>{fmtWeekRange(n.date)} · {n.section === 'general' ? 'General' : n.section}</span>
                      <span className={styles.historyNoteText}>{n.note}</span>
                      <button type="button" className={styles.historyCopyBtn} onClick={() => handleCopyNote(n)} title="Add to current report">+</button>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      )}

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
              {project.Units && (() => {
                let lotsTotal = 0;
                try {
                  const pd = JSON.parse(project.ProjectDetails ?? '{}');
                  if (Array.isArray(pd.lots)) {
                    lotsTotal = (pd.lots as Array<{units?: number}>).reduce((s, l) => s + (l.units ?? 0), 0);
                  }
                } catch { /* ignore */ }
                const mismatch = lotsTotal > 0 && lotsTotal !== project.Units;
                return (
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Quantity</span>
                    <span className={styles.summaryValue}>
                      {project.Units}
                      {mismatch && (
                        <span
                          className={styles.summaryValueMismatch}
                          title={`SP Units = ${project.Units}, but Σ lots = ${lotsTotal}. PO-Inbounds needs to sync.`}
                        >
                          {` → ${lotsTotal} expected`}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })()}
              <div className={styles.summaryRow}><span className={styles.summaryLabel}>Need by Date</span><span className={styles.summaryValue}>{fmtDate(needByDate)}</span></div>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Projected Date</span>
                {projectedDate ? (
                  <span className={`${styles.summaryValue} ${needByDate && projectedDate > needByDate ? styles.summaryValueLate : ''}`}>
                    {fmtDate(projectedDate)}
                  </span>
                ) : (
                  <span className={`${styles.summaryValue} ${styles.summaryValueTbd}`}>TBD</span>
                )}
              </div>
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
                    <th className={styles.colLotNum}>Task</th>
                    <th className={styles.colShipment}>Shipped</th>
                    <th>Status</th>
                    <th>Projected</th>
                    <th>ETA</th>
                    <th className={styles.colLotUnits}>Total Units</th>
                  </tr>
                </thead>
                <tbody>
                  {releaseTasks.map((t, i) => {
                    const { label, cls } = lotStatus(t.Complete);
                    const steps = getTaskSteps(t.jsonTable).steps;
                    const hasSteps = steps.length > 0;
                    // Task-level Ship is the master gate; batch-level isRelease is a precision override.
                    // A step counts as shipped when: (a) step.isRelease=true, or (b) task.isRelease=true
                    // — both require complete===100. Shipped units = step.releaseUnits ?? step.units.
                    const getStepShipped = (s: (typeof steps)[0]): number | null => {
                      if (s.complete !== 100) return null;
                      if (s.isRelease === true) return s.releaseUnits ?? s.units ?? 0;
                      if (t.isRelease) return s.units ?? 0;
                      return null;
                    };
                    const deliveredUnits = hasSteps
                      ? steps.reduce((acc, s) => { const v = getStepShipped(s); return v !== null ? acc + v : acc; }, 0)
                      : (t.Complete === 100 && t.isRelease ? (t.releaseUnits ?? 0) : 0);
                    const isExpanded = expandedLots.has(t.Id);
                    const toggleExpand = (): void => setExpandedLots(prev => {
                      const next = new Set(prev);
                      if (next.has(t.Id)) { next.delete(t.Id); } else { next.add(t.Id); }
                      return next;
                    });
                    const taskLot = getTaskLot(t.jsonTable);
                    const lotLabel = t.Task ?? (taskLot ? `L${taskLot.lotNo}` : `${i + 1}`);
                    const contractUnits = taskLot?.units;
                    const etaDate = taskLot?.eta ?? t.Finish;
                    // Projected = latest finish among steps (or task.Finish if no steps)
                    const lotProjectedStr = hasSteps
                      ? steps.reduce((mx, s) => (!mx || s.finish > mx) ? s.finish : mx, '' as string) || undefined
                      : (toAppDate(t.Finish) || undefined);
                    const etaStr = toAppDate(etaDate) || undefined;
                    const lotIsLate = !!lotProjectedStr && !!etaStr && lotProjectedStr > etaStr;
                    const lotReleased = (project?.releases ?? [])
                      .filter(r => r.lotNo !== undefined && r.lotNo === taskLot?.lotNo)
                      .reduce((s, r) => s + (r.units ?? 0), 0);
                    return (
                      <React.Fragment key={t.Id}>
                        <tr className={isExpanded ? styles.lotRowExpanded : undefined}>
                          <td className={styles.colLotNum}>
                            {hasSteps ? (
                              <button
                                type="button"
                                className={styles.lotExpandBtn}
                                onClick={toggleExpand}
                                aria-expanded={isExpanded}
                                title={isExpanded ? 'Collapse batches' : 'Expand batches'}
                              >
                                <span className={styles.lotExpandArrow}>{isExpanded ? '▾' : '▸'}</span>
                                <span className={styles.lotExpandNum}>{lotLabel}</span>
                              </button>
                            ) : lotLabel}
                          </td>
                          <td>
                            {deliveredUnits}
                            {lotReleased > 0 && lotReleased !== deliveredUnits && (
                              <span className={styles.lotReleasedNote}>{lotReleased} rec.</span>
                            )}
                          </td>
                          <td><span className={cls}>{label}</span></td>
                          <td className={lotIsLate ? styles.dateLate : undefined}>{fmtDate(lotProjectedStr)}</td>
                          <td>{fmtDate(etaDate)}</td>
                          <td className={styles.colLotUnits}>
                            {contractUnits !== undefined && woLotsTotal > 0
                              ? `${contractUnits} of ${woLotsTotal}`
                              : (contractUnits ?? '—')}
                          </td>
                        </tr>
                        {hasSteps && isExpanded && steps.map((step) => {
                          const { label: sLabel, cls: sCls } = lotStatus(step.complete);
                          const shipped = getStepShipped(step);
                          return (
                            <tr key={step.id} className={styles.lotBatchRow}>
                              <td className={`${styles.colLotNum} ${styles.lotBatchCell}`}>
                                {step.wbs}
                                {step.isRelease && (
                                  <span className={styles.lotBatchShipBadge} title="Ship enabled">▲</span>
                                )}
                              </td>
                              <td className={styles.lotBatchCell}>
                                {shipped !== null ? shipped : '—'}
                              </td>
                              <td><span className={sCls}>{sLabel}</span></td>
                              <td className={`${styles.lotBatchCell} ${etaStr && step.finish > etaStr ? styles.dateLate : ''}`}>{fmtDate(step.finish)}</td>
                              <td className={styles.lotBatchCell}>{fmtDate(etaDate)}</td>
                              <td className={styles.colLotUnits}>
                                {contractUnits !== undefined
                                  ? `${step.units} of ${contractUnits}`
                                  : step.units}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
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
