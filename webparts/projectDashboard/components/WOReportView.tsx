import * as React from 'react';
import { useState, useMemo, useRef, useCallback } from 'react';
import { ITaskListItem } from '../../../models/ITaskListItem';
import { IGateListItem } from '../../../models/IGateListItem';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { NoteBadge, INoteEntry } from '../../../models/ITaskLogFields';
import styles from './WOReportView.module.scss';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WOReportViewProps {
  tasks:        ITaskListItem[];
  gates:        IGateListItem[];
  activeGate:   string | undefined;
  onGateClick:  (gate: string | undefined) => void;
  project?:     IProjectCatalogItem;
  projectTitle?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return `${dt.getMonth() + 1}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
}

function gateStatusLabel(complete: number): { label: string; cls: string } {
  if (complete >= 100) return { label: 'Completed',   cls: styles.statusCompleted  };
  if (complete > 0)    return { label: 'In Progress', cls: styles.statusInProgress };
  return                      { label: 'Not Started', cls: styles.statusNotStarted };
}

const NOTE_BADGE_CLS: Record<NoteBadge, string> = {
  issue:  styles.pillIssue,
  fix:    styles.pillFix,
  action: styles.pillAction,
};

// ─── Component ────────────────────────────────────────────────────────────────

const WOReportView: React.FC<WOReportViewProps> = ({ tasks, gates, activeGate, onGateClick, project, projectTitle }) => {

  const reportRef = useRef<HTMLDivElement>(null);

  // ── PDF print ─────────────────────────────────────────────────────────────
  const handlePrint = useCallback((): void => {
    const el = reportRef.current;
    if (!el) return;

    const STYLE_ID = 'wo-report-print-style';
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    // Mark the report container, then inject a print rule that isolates it
    el.setAttribute('data-wo-report', 'true');

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media print {
        @page { margin: 12mm 14mm; }
        body * { visibility: hidden !important; }
        [data-wo-report], [data-wo-report] * { visibility: visible !important; }
        [data-wo-report] {
          position: fixed !important;
          inset: 0 !important;
          overflow: visible !important;
          background: #fff !important;
          padding: 0 !important;
        }
        /* hide the badge bar and gate tabs in print */
        [data-wo-report] [data-no-print] { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    const title = document.title;
    document.title = projectTitle ? `WO Report — ${projectTitle}` : 'WO Report';

    window.print();

    document.title = title;
    document.head.removeChild(style);
    el.removeAttribute('data-wo-report');
  }, [projectTitle]);

  // ── Badge state (all inclusive toggles) ───────────────────────────────────
  const [isDetailed,   setIsDetailed]   = useState(false);
  const [showTasks,    setShowTasks]    = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [noteFilters,  setNoteFilters]  = useState<Set<NoteBadge>>(new Set());
  const [showEvidence, setShowEvidence] = useState(false);
  const [showApprovals,setShowApprovals]= useState(false);

  const hasNoteFilter  = noteFilters.size > 0;
  const logColCount    = (hasNoteFilter ? 1 : 0) + (showEvidence ? 1 : 0) + (showApprovals ? 1 : 0);
  const hasAnyLogBadge = hasNoteFilter || showEvidence || showApprovals;

  const toggleNote = (type: NoteBadge): void =>
    setNoteFilters(prev => {
      const n = new Set(prev);
      if (n.has(type)) { n.delete(type); } else { n.add(type); }
      return n;
    });

  const handleToggleTasks = (): void => {
    if (showTasks) { setShowTasks(false); setShowAllTasks(false); }
    else           { setShowTasks(true); }
  };

  // ── Gate / task helpers ───────────────────────────────────────────────────
  const visibleGates = useMemo(
    () => activeGate ? gates.filter(g => g.Gate === activeGate) : gates,
    [gates, activeGate]
  );

  const tasksByGate = useMemo(() => {
    const map: Record<string, ITaskListItem[]> = {};
    for (const t of tasks) {
      if (!map[t.Gate]) map[t.Gate] = [];
      map[t.Gate].push(t);
    }
    return map;
  }, [tasks]);

  const getTasksForGate = (gate: string): ITaskListItem[] => {
    const all = tasksByGate[gate] ?? [];
    if (!showTasks) return [];
    if (showAllTasks) return all;
    // filtered: only tasks with content matching at least one active log badge
    if (!hasAnyLogBadge) {
      // Tasks ON but no log filter → show tasks with any content
      return all.filter(t =>
        (t.Notes?.length ?? 0) > 0 ||
        (t.Evidence?.length ?? 0) > 0 ||
        (t.Approvals?.length ?? 0) > 0
      );
    }
    return all.filter(t => {
      if (hasNoteFilter && t.Notes?.some(n => n.badge && noteFilters.has(n.badge))) return true;
      if (showEvidence  && (t.Evidence?.length  ?? 0) > 0) return true;
      if (showApprovals && (t.Approvals?.length ?? 0) > 0) return true;
      return false;
    });
  };

  const getBitacoraForGate = (gate: string): INoteEntry[] => {
    const all = tasksByGate[gate] ?? [];
    const entries: INoteEntry[] = ([] as INoteEntry[]).concat(
      ...all.map(t => (t.Notes ?? []).filter(n => n.badge && noteFilters.has(n.badge)))
    );
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  };

  // ── LOT schedule ──────────────────────────────────────────────────────────
  const releaseTasks = useMemo(() => tasks.filter(t => t.isRelease), [tasks]);

  // ── Summary: action notes per gate (General Update) ───────────────────────
  const getActionNotesForGate = (gate: string): INoteEntry[] => {
    const all = tasksByGate[gate] ?? [];
    const entries: INoteEntry[] = ([] as INoteEntry[]).concat(
      ...all.map(t => (t.Notes ?? []).filter(n => n.badge === 'action'))
    );
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.report} ref={reportRef}>

      {/* ── Badge filter bar ───────────────────────────────────────────────── */}
      <div className={styles.badgeBar} data-no-print="true">
        {/* Summary / Detailed toggle */}
        <button
          type="button"
          className={`${styles.badge} ${isDetailed ? styles.badgeActive : ''}`}
          onClick={() => setIsDetailed(p => !p)}
        >
          {isDetailed ? 'Detailed' : 'Summary'}
        </button>
        <span className={styles.badgeDivider} />
        {/* Task visibility */}
        <button
          type="button"
          className={`${styles.badge} ${showTasks ? styles.badgeActive : ''}`}
          onClick={handleToggleTasks}
        >
          Tasks
        </button>
        {showTasks && (
          <button
            type="button"
            className={`${styles.badge} ${showAllTasks ? styles.badgeActive : ''}`}
            onClick={() => setShowAllTasks(p => !p)}
          >
            All Tasks
          </button>
        )}

        <span className={styles.badgeDivider} />

        {/* Note type filters */}
        {(['issue', 'fix', 'action'] as NoteBadge[]).map(type => (
          <button
            key={type}
            type="button"
            className={`${styles.badge} ${noteFilters.has(type) ? styles.badgeActive : ''} ${styles[`badgeNote_${type}`]}`}
            onClick={() => toggleNote(type)}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}

        <span className={styles.badgeDivider} />

        {/* Log columns */}
        <button
          type="button"
          className={`${styles.badge} ${showEvidence ? styles.badgeActive : ''}`}
          onClick={() => setShowEvidence(p => !p)}
        >
          Evidence
        </button>
        <button
          type="button"
          className={`${styles.badge} ${showApprovals ? styles.badgeActive : ''}`}
          onClick={() => setShowApprovals(p => !p)}
        >
          Approvals
        </button>

        <span className={styles.badgeDivider} />

        <button type="button" className={styles.pdfBtn} onClick={handlePrint}>
          ↓ PDF
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SUMMARY (always shown)                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* ── Section 1: Header ──────────────────────────────────────────── */}
      {project && (
        <div className={styles.summaryHeader}>
          <div className={styles.summaryHeaderBar}>
            {project.poNumberCustomer && <span>{project.poNumberCustomer}</span>}
            {project.ProjectNumber && <span>WO-{project.ProjectNumber}</span>}
            <span>WORK ORDER SUMMARY</span>
          </div>
          <div className={styles.summaryHeaderBody}>
            {project.PartNumber  && <div><strong>Part Number:</strong> {project.PartNumber}</div>}
            {project.Customer    && <div><strong>Customer:</strong> {project.Customer}</div>}
            {project.Units       && <div><strong>Quantity:</strong> {project.Units}</div>}
            {project.poNumberED2 && <div><strong>ED2 PO:</strong> {project.poNumberED2}</div>}
          </div>
        </div>
      )}

      {/* ── Section 2: Gate Log (General Update — notes.action per gate) ── */}
      <div className={styles.summarySection}>
        <div className={styles.summarySectionTitle}>General Update</div>
        <div className={styles.gateLogGrid}>
          {visibleGates.map(gate => {
            const actionNotes = getActionNotesForGate(gate.Gate);
            if (actionNotes.length === 0) return null;
            return (
              <div key={gate.Gate} className={styles.gateLogBlock}>
                <div className={styles.gateLogGateName}>{gate.Gate}</div>
                <ul className={styles.gateLogList}>
                  {actionNotes.map((n, i) => (
                    <li key={i} className={styles.gateLogItem}>{n.note}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          {visibleGates.every(g => getActionNotesForGate(g.Gate).length === 0) && (
            <span className={styles.summaryEmpty}>No action notes recorded.</span>
          )}
        </div>
      </div>

      {/* ── Section 3 + 4: Production Phases + LOT Schedule ───────────── */}
      <div className={`${styles.panels} ${releaseTasks.length > 0 ? styles.panelsTwoCols : ''}`}>

        {/* Section 3 — Production Phases */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>Production Phases</div>
          <table className={styles.phaseTable}>
            <thead>
              <tr><th>#</th><th>Phase</th><th>Status</th><th>Metric</th></tr>
            </thead>
            <tbody>
              {gates.map((g, i) => {
                const { label, cls } = gateStatusLabel(g.Complete);
                return (
                  <tr key={g.Gate} className={activeGate === g.Gate ? styles.rowActive : ''}>
                    <td>{i + 1}</td>
                    <td>{g.Gate}</td>
                    <td><span className={`${styles.statusBadge} ${cls}`}>{label}</span></td>
                    <td>{Math.round(g.Complete)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Section 4 — LOT Schedule */}
        {releaseTasks.length > 0 && (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>LOT Schedule</div>
            <table className={styles.phaseTable}>
              <thead>
                <tr><th>LOT #</th><th>Shipment</th><th>Status</th><th>Target Date</th><th>Units</th></tr>
              </thead>
              <tbody>
                {releaseTasks.map((t, i) => {
                  const { label, cls } = gateStatusLabel(t.Complete);
                  return (
                    <tr key={t.Id}>
                      <td>{i + 1}</td>
                      <td>{t.Task}</td>
                      <td><span className={`${styles.statusBadge} ${cls}`}>{label}</span></td>
                      <td>{fmtDate(t.Finish)}</td>
                      <td>{t.releaseUnits ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detailed section (appended when Detailed badge ON) ────────────── */}
      {isDetailed && (showTasks || (!showTasks && hasNoteFilter)) && (
        <div className={styles.gateGroups}>
          {visibleGates.map(gate => {
            const gateTasks  = tasksByGate[gate.Gate] ?? [];
            const taskRows   = getTasksForGate(gate.Gate);
            const bitacora   = !showTasks && hasNoteFilter ? getBitacoraForGate(gate.Gate) : [];

            if (!showTasks && bitacora.length === 0) return null;
            if (showTasks  && taskRows.length === 0  && !showAllTasks) return null;

            return (
              <div key={gate.Gate} className={styles.gateGroup}>
                {/* Gate group header */}
                <div className={styles.gateGroupHeader}>
                  <span className={styles.gateGroupName}>{gate.Gate}</span>
                  <span className={styles.gateGroupMeta}>
                    {gateTasks.length} task{gateTasks.length !== 1 ? 's' : ''} · {Math.round(gate.Complete)}%
                  </span>
                  <div className={styles.gateGroupBarWrap}>
                    <div className={styles.gateGroupBar} style={{ width: `${Math.min(gate.Complete, 100)}%` }} />
                  </div>
                </div>

                {/* ── Task rows ──────────────────────────────────────────── */}
                {showTasks && taskRows.length > 0 && (
                  <div className={styles.taskRows}>
                    {/* Column headers when log cols are active */}
                    {logColCount > 0 && (
                      <div className={styles.taskRow}>
                        <div className={styles.taskMeta}>
                          <span className={styles.colHdr}>WBS</span>
                          <span className={`${styles.colHdr} ${styles.colHdrTask}`}>Task</span>
                          <span className={styles.colHdr}>%</span>
                        </div>
                        <div
                          className={styles.taskLogArea}
                          style={{ gridTemplateColumns: `repeat(${logColCount}, 1fr)` }}
                        >
                          {hasNoteFilter  && <span className={styles.logColHdr}>Notes</span>}
                          {showEvidence   && <span className={styles.logColHdr}>Evidence</span>}
                          {showApprovals  && <span className={styles.logColHdr}>Approvals</span>}
                        </div>
                      </div>
                    )}

                    {taskRows.map(t => (
                      <div key={t.Id} className={styles.taskRow}>
                        <div className={styles.taskMeta}>
                          <span className={styles.taskWbs}>{t.Title}</span>
                          <span className={styles.taskName}>{t.Task}</span>
                          <span className={styles.taskPct}>{Math.round(t.Complete)}%</span>
                        </div>

                        {logColCount > 0 && (
                          <div
                            className={styles.taskLogArea}
                            style={{ gridTemplateColumns: `repeat(${logColCount}, 1fr)` }}
                          >
                            {/* Notes column */}
                            {hasNoteFilter && (
                              <div className={styles.logCol}>
                                {(t.Notes ?? [])
                                  .filter(n => n.badge && noteFilters.has(n.badge))
                                  .map((note, i) => (
                                    <div key={i} className={styles.logEntry}>
                                      <span className={`${styles.pill} ${note.badge ? NOTE_BADGE_CLS[note.badge] : ''}`}>
                                        {note.badge}
                                      </span>
                                      <span className={styles.logEntryText}>{note.note}</span>
                                      <span className={styles.logEntryMeta}>{note.user} · {fmtDate(note.date)}</span>
                                    </div>
                                  ))
                                }
                              </div>
                            )}

                            {/* Evidence column */}
                            {showEvidence && (
                              <div className={styles.logCol}>
                                {(t.Evidence ?? []).length === 0
                                  ? <span className={styles.logEmpty}>—</span>
                                  : (t.Evidence ?? []).map((e, i) => (
                                    <div key={i} className={styles.logEntry}>
                                      <a
                                        href={e.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={styles.evidenceLink}
                                      >
                                        {e.fileName}
                                      </a>
                                      <span className={styles.logEntryMeta}>{e.user} · {fmtDate(e.date)}</span>
                                    </div>
                                  ))
                                }
                              </div>
                            )}

                            {/* Approvals column */}
                            {showApprovals && (
                              <div className={styles.logCol}>
                                {(t.Approvals ?? []).length === 0
                                  ? <span className={styles.logEmpty}>—</span>
                                  : (t.Approvals ?? []).map((a, i) => (
                                    <div key={i} className={styles.logEntry}>
                                      <span className={`${styles.pill} ${styles[`approval_${a.status}`]}`}>
                                        {a.status}
                                      </span>
                                      <span className={styles.logEntryText}>{a.user}</span>
                                      <span className={styles.logEntryMeta}>{fmtDate(a.date)}</span>
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Bitácora (Tasks OFF + note filters) ─────────────────── */}
                {!showTasks && bitacora.length > 0 && (
                  <div className={styles.bitacora}>
                    {bitacora.map((note, i) => (
                      <div key={i} className={styles.bitacoraEntry}>
                        <span className={styles.bitacoraDate}>{fmtDate(note.date)}</span>
                        <span className={styles.bitacoraUser}>{note.user}</span>
                        <span className={`${styles.pill} ${note.badge ? NOTE_BADGE_CLS[note.badge] : ''}`}>
                          {note.badge}
                        </span>
                        <span className={styles.bitacoraText}>{note.note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WOReportView;
