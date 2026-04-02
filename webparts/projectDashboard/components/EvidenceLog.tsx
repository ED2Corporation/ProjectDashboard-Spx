import * as React from 'react';
import { useRef, useState } from 'react';
import { IEvidenceEntry } from '../../../models/ITaskLogFields';
import styles from './EvidenceLog.module.scss';

interface EvidenceLogProps {
  evidence: IEvidenceEntry[] | null;
  taskTitle: string;
  currentUserDisplayName: string;
  onSave: (entries: IEvidenceEntry[], uploadedEntry?: IEvidenceEntry) => Promise<void>;
  onUploadFile?: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
}

const EvidenceLog: React.FC<EvidenceLogProps> = ({
  evidence, taskTitle, currentUserDisplayName, onSave, onUploadFile,
}) => {
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
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
      };
      await onSave([...(evidence ?? []), entry], entry);
      setNote('');
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
      <div className={styles.feed}>
        {entries.length === 0 && <p className={styles.empty}>No evidence uploaded yet.</p>}
        {entries.map((e, i) => (
          <div key={i} className={styles.entry}>
            <div className={styles.meta}>
              <span className={styles.user}>{e.user}</span>
              <span className={styles.date}>{new Date(e.date).toLocaleString()}</span>
            </div>
            <a href={e.fileUrl} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
              {e.fileName}
            </a>
            {e.note && <p className={styles.noteText}>{e.note}</p>}
          </div>
        ))}
      </div>
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
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvidenceLog;
