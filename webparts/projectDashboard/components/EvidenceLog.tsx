import * as React from 'react';
import { useState } from 'react';
import { IEvidenceEntry } from '../../../models/ITaskLogFields';
import EvidenceUploadButton from './EvidenceUploadButton';
import styles from './EvidenceLog.module.scss';

interface EvidenceLogProps {
  evidence?: IEvidenceEntry[];
  taskTitle: string;
  currentUserDisplayName: string;
  onSave: (entries: IEvidenceEntry[], uploadedEntry?: IEvidenceEntry) => Promise<void>;
  onToggleEvidenceOfCompletion?: (entry: IEvidenceEntry) => Promise<void>;
  onUploadFile?: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
}

const EvidenceLog: React.FC<EvidenceLogProps> = ({
  evidence, taskTitle, currentUserDisplayName, onSave, onToggleEvidenceOfCompletion, onUploadFile,
}) => {
  const [note, setNote]                 = useState('');
  const [isCompletion, setIsCompletion] = useState(false);

  const entries = [...(evidence ?? [])].reverse();

  return (
    <div className={styles.container}>
      {onUploadFile && (
        <div className={styles.addForm}>
          <div className={styles.addRow}>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add note..."
              className={styles.noteInput}
            />
            <EvidenceUploadButton
              evidence={evidence}
              taskTitle={taskTitle}
              currentUser={currentUserDisplayName}
              onUploadFile={onUploadFile}
              onSave={(entries) => onSave(entries, entries[entries.length - 1])}
              note={note}
              isEvidenceOfCompletion={isCompletion || undefined}
              onUploaded={() => { setNote(''); setIsCompletion(false); }}
              className={styles.uploadBtn}
            />
            <label
              className={`${styles.checkRow} ${isCompletion ? styles.checkRowActive : ''}`}
              title="Is Evidence of Completion"
            >
              <input
                type="checkbox"
                checked={isCompletion}
                onChange={e => setIsCompletion(e.target.checked)}
              />
              <span className={styles.switchTrack} aria-hidden="true">
                <span className={styles.switchThumb} />
              </span>
              <span className={styles.checkLabel}>Is Evidence</span>
            </label>
          </div>
        </div>
      )}
      <div className={styles.feed}>
        {entries.length === 0 && <p className={styles.empty}>No evidence uploaded yet.</p>}
        {entries.map((e, i) => (
          <div key={i} className={styles.entry}>
            <div className={styles.entryRow}>
              <div className={styles.meta}>
                <span className={styles.user}>{e.user}</span>
                <span className={styles.date}>{new Date(e.date).toLocaleString()}</span>
              </div>
              <span className={styles.noteInline}>{e.note || '-'}</span>
            </div>
            <div className={styles.entryRow}>
              <button
                type="button"
                className={`${styles.flag} ${e.isEvidenceOfCompletion ? styles.flagCompletion : styles.flagRegular}`}
                onClick={() => {
                  onToggleEvidenceOfCompletion?.(e).catch(error => {
                    console.error('[EvidenceLog] Toggle evidence-of-completion failed', error);
                  });
                }}
                title={e.isEvidenceOfCompletion ? 'Unmark as Evidence of Completion' : 'Mark as Evidence of Completion'}
              >
                {e.isEvidenceOfCompletion ? (
                  <svg viewBox="0 0 16 16" className={styles.flagIcon} aria-hidden="true">
                    <path d="M3 2.5v11" />
                    <path d="M4 3h7l-1.8 2.5L11 8H4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" className={styles.flagIcon} aria-hidden="true">
                    <path d="M4 2.5h5l3 3V13.5H4z" />
                    <path d="M9 2.5v3h3" />
                  </svg>
                )}
              </button>
              <a href={e.fileUrl} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                {e.fileName}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EvidenceLog;
