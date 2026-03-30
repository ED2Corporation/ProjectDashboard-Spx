import * as React from 'react';
import { useState, useRef } from 'react';
import { IEvidenceEntry } from '../../../models/ITaskLogFields';
import styles from './EvidenceLog.module.scss';

interface EvidenceLogProps {
  evidence: IEvidenceEntry[] | null;
  taskTitle: string;
  currentUserDisplayName: string;
  onSave: (entries: IEvidenceEntry[]) => Promise<void>;
  onUploadFile?: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
}

const EvidenceLog: React.FC<EvidenceLogProps> = ({
  evidence, taskTitle, currentUserDisplayName, onSave, onUploadFile,
}) => {
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleUpload = async (): Promise<void> => {
    if (!selectedFile || !onUploadFile) return;
    setUploading(true);
    try {
      const { fileUrl, fileName } = await onUploadFile(selectedFile, taskTitle);
      const entry: IEvidenceEntry = {
        date: new Date().toISOString(),
        user: currentUserDisplayName,
        fileName,
        fileUrl,
        note: note.trim() || undefined,
      };
      await onSave([...(evidence ?? []), entry]);
      setSelectedFile(null);
      setNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setUploading(false);
    }
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
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional description…"
            className={styles.textarea}
            rows={2}
          />
          <button
            type="button"
            className={styles.uploadBtn}
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      )}
    </div>
  );
};

export default EvidenceLog;
