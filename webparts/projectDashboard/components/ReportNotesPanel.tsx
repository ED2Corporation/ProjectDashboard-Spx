import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { IReportNote } from '../../../models/IReportNote';
import { IGateListItem } from '../../../models/IGateListItem';
import styles from './ReportNotesPanel.module.scss';

interface ReportNotesPanelProps {
  gates: IGateListItem[];
  currentUser: string;
  onSave: (note: Omit<IReportNote, 'id' | 'createdAt'>) => Promise<void>;
  onClose: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function uid(): string {
  return `rn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const GENERAL = '__general__';

const ReportNotesPanel: React.FC<ReportNotesPanelProps> = ({ gates, currentUser, onSave, onClose }) => {
  const [section,  setSection]  = useState<string>(GENERAL);
  const [date,     setDate]     = useState(todayIso());
  const [noteText, setNoteText] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [saved,    setSaved]    = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  const handleSave = async (): Promise<void> => {
    if (!noteText.trim()) { setError('Note text is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        section: section === GENERAL ? 'general' : section,
        note:    noteText.trim(),
        user:    currentUser,
        date,
        status:  'active',
      });
      setNoteText('');
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()} role="dialog" aria-label="Add Report Note">

        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Add Report Note</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
        </div>

        <div className={styles.panelBody}>

          {/* Section selector */}
          <label className={styles.fieldLabel}>Section</label>
          <div className={styles.sectionGroup}>
            <button
              type="button"
              className={`${styles.sectionBtn} ${section === GENERAL ? styles.sectionBtnActive : ''}`}
              onClick={() => setSection(GENERAL)}
            >
              General Update
            </button>
            {gates.map(g => (
              <button
                key={g.Gate}
                type="button"
                className={`${styles.sectionBtn} ${section === g.Gate ? styles.sectionBtnActive : ''}`}
                onClick={() => setSection(g.Gate)}
              >
                {g.Gate}
              </button>
            ))}
          </div>

          {/* Report date */}
          <label className={styles.fieldLabel} htmlFor="rn-date">Report Date</label>
          <input
            id="rn-date"
            type="date"
            className={styles.dateInput}
            value={date}
            onChange={e => setDate(e.target.value)}
          />

          {/* Note text */}
          <label className={styles.fieldLabel} htmlFor="rn-note">Note</label>
          <textarea
            id="rn-note"
            ref={textRef}
            className={styles.noteTextarea}
            placeholder="Enter update note…"
            value={noteText}
            onChange={e => { setNoteText(e.target.value); setError(''); }}
            rows={4}
          />

          {saved && <div className={styles.successMsg}>Note added.</div>}
          {error && <div className={styles.errorMsg}>{error}</div>}

          <div className={styles.panelFooter}>
            <span className={styles.authorTag}>{currentUser}</span>
            <div className={styles.footerActions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Add Note'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export { uid };
export default ReportNotesPanel;
