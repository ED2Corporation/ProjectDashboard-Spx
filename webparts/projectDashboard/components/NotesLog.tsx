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

  const entries = [...(notes ?? [])].reverse();

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
        {entries.map((n, i) => (
          <div key={i} className={styles.entry}>
            <div className={styles.meta}>
              <span className={styles.user}>{n.user}</span>
              <span className={styles.date}>{new Date(n.date).toLocaleString()}</span>
            </div>
            <p className={styles.noteText}>{n.note}</p>
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
