import * as React from 'react';
import { useRef, useState, useEffect } from 'react';
import { IEvidenceEntry } from '../../../models/ITaskLogFields';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EvidenceUploadButtonProps {
  /** Existing evidence entries — uploaded entry will be appended */
  evidence?:           IEvidenceEntry[];
  taskTitle:           string;
  currentUser:         string;
  onUploadFile:        (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;
  onSave:              (entries: IEvidenceEntry[]) => Promise<void>;
  /** Optional pre-populated note to attach to the entry */
  note?:               string;
  /** When true the entry is flagged isEvidenceOfCompletion — callers can force-true (ListTasks) or let the user toggle (EvidenceLog) */
  isEvidenceOfCompletion?: boolean;
  /** Called after a successful upload so the parent can reset its note / toggle state */
  onUploaded?:         () => void;
  disabled?:           boolean;
  /** Button label — accepts a string or JSX (e.g. an SVG icon). Defaults to "Add" */
  label?:              React.ReactNode;
  className?:          string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const EvidenceUploadButton: React.FC<EvidenceUploadButtonProps> = ({
  evidence, taskTitle, currentUser, onUploadFile, onSave,
  note, isEvidenceOfCompletion, onUploaded,
  disabled, label = 'Add', className,
}) => {
  const [uploading, setUploading]     = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear success banner after 1.5 s
  useEffect(() => {
    if (!uploadedName) return;
    successTimer.current = setTimeout(() => setUploadedName(null), 1500);
    return () => { if (successTimer.current) clearTimeout(successTimer.current); };
  }, [uploadedName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    setUploading(true);
    setUploadedName(null);
    try {
      const { fileUrl, fileName } = await onUploadFile(file, taskTitle);
      const entry: IEvidenceEntry = {
        date:                   new Date().toISOString(),
        user:                   currentUser,
        fileName,
        fileUrl,
        note:                   note?.trim() || undefined,
        isEvidenceOfCompletion: isEvidenceOfCompletion || undefined,
      };
      await onSave([...(evidence ?? []), entry]);
      setUploadedName(fileName);
      onUploaded?.();
    } catch (err) {
      console.error('[EvidenceUploadButton] Upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        tabIndex={-1}
      />
      <button
        type="button"
        className={className}
        disabled={disabled || uploading}
        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        title={uploading ? 'Uploading…' : 'Upload Evidence of Completion'}
        aria-busy={uploading}
      >
        {label}
      </button>
      {uploading && (
        <span style={{
          fontSize: 10, color: '#605E5C', whiteSpace: 'nowrap', lineHeight: 1,
        }}>
          Uploading…
        </span>
      )}
      {uploadedName && !uploading && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 10, color: '#107C10', whiteSpace: 'nowrap', lineHeight: 1,
        }}>
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:'1em',height:'1em',flexShrink:0}} aria-hidden="true">
            <path d="M2 6.5 4.5 9 10 3"/>
          </svg>
          {uploadedName} uploaded
        </span>
      )}
    </span>
  );
};

export default EvidenceUploadButton;
