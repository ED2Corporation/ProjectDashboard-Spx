import * as React from "react";
import styles from "./ProjectDashboard.module.scss";

export interface EvidenceEditorProps {
  // valores actuales
  evidenceUrl: string;
  evidenceDesc: string;

  // setters de estado (los pones desde el padre)
  onChangeUrl: (value: string) => void;
  onChangeDesc: (value: string) => void;

  // callback para subir archivo
  onUploadEvidenceFile?: (file: File, taskTitle: string) => Promise<{ fileUrl: string; fileName: string }>;

  // contexto de la tarea
  taskId: string;
  taskTitle: string;

  // datos adicionales para el payload rápido (solo ListTasks)
  complete?: number;
  finish?: string | null;

  // callback para enviar el payload cuando haya cambio (solo ListTasks)
  onQuickSave?: (payloadJson: string) => void;

  // para cerrar modo edición si aplica
  onAfterUpload?: () => void;

  // permitir detener propagación de eventos del padre
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
  complete,
  finish,
  onQuickSave,
  onAfterUpload,
  stopRowClick = true,
}) => {
  const [isUploading, setIsUploading] = React.useState(false);

  return (
    <div className={styles["evidence-edit"]}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          width: "100%",
        }}
      >
        <div className={styles.columnContainer}>
          <div className={styles.rowContainer}>
            {/* Name */}
            <label style={{ fontSize: 10, marginLeft: 4, marginRight: 4, width: 30 }}>
              Name:
            </label>
            <input
              type="text"
              title="Enter file name"
              value={evidenceDesc}
              onChange={(e) => onChangeDesc(e.target.value)}
              placeholder="File name"
              className={styles["input-small"]}
              onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
              style={{ flex: "1 1 250px" }}
            />

            {/* Upload file control */}
            <label className={styles["icon-button"]} title="Upload file">
              <input
                type="file"
                style={{ display: "none" }}
                onChange={async (ev) => {
                  if (stopRowClick) ev.stopPropagation();
                  const file = ev.target.files?.[0];
                  if (!file) return;

                  try {
                    setIsUploading(true);
                    if (onUploadEvidenceFile) {
                      const result = await onUploadEvidenceFile(file, taskTitle || "CompletionEvidence");
                      if (!result) return;

                      const { fileUrl, fileName } = result;
                      const newUrl = fileUrl;
                      const newDesc = fileName || "Evidence file";

                      onChangeUrl(newUrl);
                      onChangeDesc(newDesc);

                      // Construir payload si se usa quick-save
                      if (onQuickSave) {
                        const payload = JSON.stringify({
                          Id: taskId,
                          Task: taskTitle, 
                          Complete: complete,
                          Finish: finish ?? null,                          
                          EvidenceOfCompletion: {
                            Url: newUrl,
                            Description: newDesc,
                          },
                        });                        
                        onQuickSave(payload);
                      }

                      if (onAfterUpload) onAfterUpload();
                    }
                  } catch (err) {
                    console.error("[EvidenceEditor] Upload failed:", err);
                    alert(
                      "[EvidenceEditor] File upload failed.\nPlease validate if the repository folder (defined in settings) has been created and try again."
                    );
                  } finally {
                    setIsUploading(false);
                    (ev.target as HTMLInputElement).value = "";
                  }
                }}
              />
              <img
                src={require("../assets/Upload.png")}
                alt="upload"
                className={styles["icon-small"]}
              />
            </label>
            {isUploading && <span style={{ fontSize: 10 }}>Uploading…</span>}
          </div>

          <div className={styles.rowContainer}>
            {/* URL */}
            <label style={{ fontSize: 10, marginLeft: 4, marginRight: 4, width: 30 }}>
              URL:
            </label>
            <input
              type="text"
              title="Enter URL"
              value={evidenceUrl}
              onChange={(e) => onChangeUrl(e.target.value)}
              placeholder="Evidence URL"
              className={styles["input-small"]}
              onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
              style={{ flex: "1 1 300px" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvidenceEditor;
