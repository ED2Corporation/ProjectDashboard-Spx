import * as React from 'react';
import { useState } from 'react';
import { INoteEntry, NoteBadge } from '../../../models/ITaskLogFields';
import styles from './NotesLog.module.scss';

const BADGES: { value: NoteBadge; label: string }[] = [
  { value: 'issue',  label: 'Issue'  },
  { value: 'fix',    label: 'Fix'    },
  { value: 'action', label: 'Action' },
];

interface NotesLogProps {
  notes?: INoteEntry[];
  currentUserDisplayName: string;
  onSave: (entries: INoteEntry[]) => Promise<void>;
}

const NotesLog: React.FC<NotesLogProps> = ({ notes, currentUserDisplayName, onSave }) => {
  const [text, setText] = useState('');
  const [badge, setBadge] = useState<NoteBadge>('issue');
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleAdd = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const entry: INoteEntry = {
        date: new Date().toISOString(),
        user: currentUserDisplayName,
        note: trimmed,
        badge,
      };
      await onSave([...(notes ?? []), entry]);
      setText('');
      setBadge('issue');
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = (sourceIndex: number, note: string): void => {
    setEditingIndex(sourceIndex);
    setEditingText(note);
  };

  const handleEditCancel = (): void => {
    setEditingIndex(null);
    setEditingText('');
  };

  const handleEditSave = async (): Promise<void> => {
    if (editingIndex === null) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const nextEntries = [...(notes ?? [])];
      const currentEntry = nextEntries[editingIndex];
      if (!currentEntry) return;
      nextEntries[editingIndex] = {
        ...currentEntry,
        note: trimmed,
      };
      await onSave(nextEntries);
      handleEditCancel();
    } finally {
      setSaving(false);
    }
  };

  const badgeCls = (v: NoteBadge): string => {
    if (v === 'fix')    return styles.badge_fix;
    if (v === 'action') return styles.badge_action;
    return styles.badge_issue;
  };

  const entries = [...(notes ?? [])]
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .reverse();

  return (
    <div className={styles.container}>
      <div className={styles.addForm}>
        <div className={styles.badgeRow}>
          {BADGES.map(b => (
            <button
              key={b.value}
              type="button"
              className={`${styles.badgeBtn} ${badgeCls(b.value)} ${badge === b.value ? styles.badgeBtnActive : ''}`}
              onClick={() => setBadge(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note..."
          className={styles.noteInput}
          disabled={saving}
        />
        <button
          type="button"
          className={styles.addBtn}
          onClick={handleAdd}
          disabled={saving || !text.trim()}
        >
          {saving ? 'Saving…' : 'Add Note'}
        </button>
      </div>
      <div className={styles.feed}>
        {entries.length === 0 && <p className={styles.empty}>No notes yet.</p>}
        {entries.map(({ entry, sourceIndex }, i) => (
          <div key={i} className={styles.entry}>
            <div className={styles.meta}>
              <span className={styles.user}>{entry.user}</span>
              <span className={styles.date}>{new Date(entry.date).toLocaleString()}</span>
            </div>
            {editingIndex === sourceIndex ? (
              <div className={styles.editRow}>
                <input
                  type="text"
                  value={editingText}
                  onChange={e => setEditingText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleEditSave();
                    if (e.key === 'Escape') handleEditCancel();
                  }}
                  className={styles.noteInput}
                  disabled={saving}
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.editActionBtn}
                  onClick={handleEditSave}
                  disabled={saving || !editingText.trim()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className={`${styles.editActionBtn} ${styles.cancelBtn}`}
                  onClick={handleEditCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p
                className={styles.noteText}
                onClick={() => handleEditStart(sourceIndex, entry.note)}
                title="Click to edit"
              >
                {entry.badge && (
                  <span className={`${styles.noteBadge} ${badgeCls(entry.badge)}`}>
                    {entry.badge.charAt(0).toUpperCase() + entry.badge.slice(1)}
                  </span>
                )}
                {entry.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotesLog;
