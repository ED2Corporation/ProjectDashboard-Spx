import * as React from 'react';
import { useRef, useState } from 'react';
import { IEvidenceEntry } from '../../../models/ITaskLogFields';
import styles from './EvidenceLog.module.scss';

interface EvidenceLogProps {
  evidence: IEvidenceEntry[] | null;
  taskTitle: string;
  currentUserDisplayName: string;
  onSave: (entries: IEvidenceEntry[], uploadedEntry?: IEvidenceEntry) => Promise<void>;
  onToggleEvidenceOfCompletion?: (entry: IEvidenceEntry) => Promise<void>;
  onUploadFile?: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
}

const EvidenceLog: React.FC<EvidenceLogProps> = ({
  evidence, taskTitle, currentUserDisplayName, onSave, onToggleEvidenceOfCompletion, onUploadFile,
}) => {
  const [note, setNote]                         = useState('');
  const [uploading, setUploading]               = useState(false);
  const [isCompletion, setIsCompletion]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetFileInput = (): void => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (file: File): Promise<void> => {
    if (!onUploadFile) return;
    setUploading(true);
    try {
      const trimmedNote = note.trim();
      const { fileUrl, fileName } = await onUploadFile(file, taskTitle);
      const entry: IEvidenceEntry = {
        date: new Date().toISOString(),
        user: currentUserDisplayName,
        fileName,
        fileUrl,
        note: trimmedNote || undefined,
        isEvidenceOfCompletion: isCompletion || undefined,
      };
      await onSave([...(evidence ?? []), entry], entry);
      setNote('');
      setIsCompletion(false);
      resetFileInput();
    } catch (error) {
      console.error('[EvidenceLog] Upload failed', error);
      resetFileInput();
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUpload(file);
  };

  const openFileDialog = (): void => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const entries = [...(evidence ?? [])].reverse();

  return (
    <div className={styles.container}>
      {onUploadFile && (
        <div className={styles.addForm}>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className={styles.fileInput}
          />
          <div className={styles.addRow}>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add note..."
              className={styles.noteInput}
              disabled={uploading}
            />
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={openFileDialog}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Add'}
            </button>
            <label
              className={`${styles.checkRow} ${isCompletion ? styles.checkRowActive : ''}`}
              title="Is Evidence of Completion"
            >
              <input
                type="checkbox"
                checked={isCompletion}
                onChange={e => setIsCompletion(e.target.checked)}
                disabled={uploading}
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
