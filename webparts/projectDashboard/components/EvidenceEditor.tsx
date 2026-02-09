import * as React from "react";
import styles from "./ProjectDashboard.module.scss";

export interface EvidenceEditorProps {
  evidenceUrl: string;
  evidenceDesc: string;
  onChangeUrl: (value: string) => void;
  onChangeDesc: (value: string) => void;
  onUploadEvidenceFile?: (
    file: File,
    taskTitle: string
  ) => Promise<{ fileUrl: string; fileName: string }>;
  taskId: string;
  taskTitle: string;
  onEvidenceUpdated?: (args: { taskId: string; url: string; description: string }) => void;
  onAfterUpload?: (success: boolean) => void;
  stopRowClick?: boolean;
}

const EvidenceEditor: React.FC<EvidenceEditorProps> = ({
  evidenceUrl,
  evidenceDesc,
  onChangeUrl,
  onChangeDesc,
  onUploadEvidenceFile,
  taskId,
  taskTitle,
  onEvidenceUpdated,
  onAfterUpload,
  stopRowClick = true,
}) => {
  const [isUploading, setIsUploading] = React.useState(false);

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    if (stopRowClick) ev.stopPropagation();
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      if (!onUploadEvidenceFile) {
        throw new Error("onUploadEvidenceFile not provided");
      }

      const { fileUrl, fileName } = await onUploadEvidenceFile(
        file,
        taskTitle || "CompletionEvidence"
      );

      const newUrl = fileUrl;
      const newDesc = fileName || "Evidence file";

      onChangeUrl(newUrl);
      onChangeDesc(newDesc);

      onEvidenceUpdated?.({ taskId, url: newUrl, description: newDesc });
      onAfterUpload?.(true);
    } catch (err) {
      console.error("[EvidenceEditor] Upload failed:", err);
      alert(
        "[EvidenceEditor] File upload failed.\nPlease validate if the repository folder (defined in settings) has been created and try again."
      );
      onAfterUpload?.(false);
    } finally {
      setIsUploading(false);
      ev.target.value = "";
    }
  };

  return (
    <div className={styles.evidenceEdit}>
      <div className={styles.columnContainer}>
        <div className={styles.rowContainer}>
          <label className={styles.fieldLabel}>Name:</label>
          <input
            type="text"
            title="Enter file name"
            value={evidenceDesc}
            onChange={(e) => onChangeDesc(e.target.value)}
            placeholder="File name"
            className={styles.inputSmall}
            onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
          />
          <label
            className={styles.iconButton}
            title="Upload file"
            onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
          >
            <input type="file" style={{ display: "none" }} onChange={handleFileChange} />
            <img
              src={require("../assets/Upload.png")}
              alt="upload"
              className={styles.iconSmall}
            />
          </label>
          {isUploading && <span className={styles.uploadingText}>Uploading…</span>}
        </div>

        <div className={styles.rowContainer}>
          <label className={styles.fieldLabel}>URL:</label>
          <input
            type="text"
            title="Enter URL"
            value={evidenceUrl}
            onChange={(e) => onChangeUrl(e.target.value)}
            placeholder="Evidence URL"
            className={styles.inputSmall}
            onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
          />
        </div>
      </div>
    </div>
  );
};

export default EvidenceEditor;
