import * as React from 'react';
import { useState } from 'react';
import { INoteEntry } from '../../../models/ITaskLogFields';
import styles from './NotesLog.module.scss';

interface NotesLogProps {
  notes: INoteEntry[] | null;
  currentUserDisplayName: string;
  onSave: (entries: INoteEntry[]) => Promise<void>;
}

const NotesLog: React.FC<NotesLogProps> = ({ notes, currentUserDisplayName, onSave }) => {
  const [text, setText] = useState('');
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
      };
      console.log("[NotesLog] Adding note entry", {
        existingCount: (notes ?? []).length,
        entry,
      });
      await onSave([...(notes ?? []), entry]);
      console.log("[NotesLog] onSave resolved");
      setText('');
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

  const entries = [...(notes ?? [])]
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .reverse();

  return (
    <div className={styles.container}>
      <div className={styles.addForm}>
        <input
          type="text"
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
          {saving ? 'Saving...' : 'Add'}
        </button>
      </div>
      <div className={styles.feed}>
        {entries.length === 0 && <p className={styles.empty}>No notes yet.</p>}
        {entries.map(({ entry, sourceIndex }, i) => (
          <div key={i} className={styles.entry}>
            <div className={styles.meta}>
              <span className={styles.user}>{entry.user}</span>
              <span className={styles.date}>{new Date(entry.date).toLocaleString()}</span>
              {editingIndex !== sourceIndex && (
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => handleEditStart(sourceIndex, entry.note)}
                  title="Edit note"
                >
                  <svg viewBox="0 0 16 16" className={styles.editIcon} aria-hidden="true">
                    <path d="M11.8 2.2a1.4 1.4 0 0 1 2 2L6 12H4v-2z" />
                    <path d="M9.8 4.2l2 2" />
                  </svg>
                </button>
              )}
            </div>
            {editingIndex === sourceIndex ? (
              <div className={styles.editRow}>
                <input
                  type="text"
                  value={editingText}
                  onChange={e => setEditingText(e.target.value)}
                  className={styles.noteInput}
                  disabled={saving}
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
              <p className={styles.noteText}>{entry.note}</p>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'none' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a note..."
          className={styles.noteInput}
          rows={2}
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
    </div>
  );
};

export default NotesLog;
