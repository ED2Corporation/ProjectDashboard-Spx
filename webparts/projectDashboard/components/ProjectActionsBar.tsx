import * as React from "react";
import { IProjectListItem } from "../../../models";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import { ProjectService } from "../services/ProjectService";
import styles from "./ProjectActionsBar.module.scss";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconArchive: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
    <path d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 000 2h4a1 1 0 000-2H8z"/>
  </svg>
);

const IconExport: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 9h5v2H3V9zm0 3h5v2H3v-2z"/>
    <path d="M13 9.5a.75.75 0 00-1.5 0v4.44l-1.22-1.22a.75.75 0 00-1.06 1.06l2.5 2.5a.75.75 0 001.06 0l2.5-2.5a.75.75 0 00-1.06-1.06L13 13.94V9.5z"/>
  </svg>
);

const IconImport: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 9h5v2H3V9zm0 3h5v2H3v-2z"/>
    <path d="M13 16.5a.75.75 0 001.5 0V12.06l1.22 1.22a.75.75 0 001.06-1.06l-2.5-2.5a.75.75 0 00-1.06 0l-2.5 2.5a.75.75 0 101.06 1.06L13 12.06V16.5z"/>
  </svg>
);

const IconTemplate: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H7z" clipRule="evenodd"/>
  </svg>
);

const IconListLink: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M5 4.5A1.5 1.5 0 016.5 3h7A1.5 1.5 0 0115 4.5v11a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 015 15.5v-11z" />
    <path d="M7.5 7h5M7.5 10h5M7.5 13h3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const IconRepoLink: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M10 3.5l6 3.2v6.6L10 16.5l-6-3.2V6.7L10 3.5z" />
    <path d="M10 3.5v13M4 6.7l6 3.3 6-3.3" stroke="white" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCheck: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 10.5l4 4L16 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface IProjectActionsBarProps {
  project: IProjectListItem;
  projectService: ProjectService;
  evidenceFolderServerRelative: string;
  repoUrl: string;
  repositoryName: string;
  projectMetadata?: IProjectCatalogItem;
  onReset: () => void;
  onCatalogRefresh?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectActionsBar: React.FC<IProjectActionsBarProps> = ({
  project,
  projectService,
  evidenceFolderServerRelative,
  repoUrl,
  repositoryName,
  projectMetadata,
  onReset,
  onCatalogRefresh,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string>("");
  const successTimerRef = React.useRef<number | undefined>(undefined);
  const listUrl = project.Link?.Url || "";
  const isProcessing = isArchiving || isExporting || isImporting;
  const processingLabel =
    isArchiving ? "Archiving project..." :
    isExporting ? "Preparing export..." :
    isImporting ? "Importing tasks..." : "";
  const showSuccess = !isProcessing && !!successMessage;

  React.useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const markSuccess = (message: string): void => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
    setSuccessMessage(message);
    successTimerRef.current = window.setTimeout(() => {
      setSuccessMessage("");
      successTimerRef.current = undefined;
    }, 2600);
  };

  return (
    <div
      className={`${styles.bar} ${isProcessing ? styles.barProcessing : ""} ${showSuccess ? styles.barSuccess : ""}`}
      aria-busy={isProcessing}
    >
      {isProcessing && (
        <div className={styles.processingPill}>
          <span className={styles.spinner} />
          {processingLabel}
        </div>
      )}
      {showSuccess && (
        <div className={`${styles.processingPill} ${styles.successPill}`}>
          <IconCheck />
          {successMessage}
        </div>
      )}

      {/* ── Archive ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        className={styles.btnArchive}
        disabled={isProcessing}
        title="Export to Excel, save to evidence folder and remove the SharePoint list"
        onClick={async () => {
          if (!project.ListName || isProcessing) return;
          if (!confirm(`Archive "${project.Title}"?\n\nThis will export the task list to Excel, save it to the evidence repository, and delete the SharePoint list.`)) return;
          try {
            setIsArchiving(true);
            await projectService.archiveProject(
              project.ListName,
              `${evidenceFolderServerRelative.replace(/\/+$/, "")}/${project.RepositoryName}`,
              project.Title,
              projectMetadata
            );
            onReset();
            markSuccess("Archive completed");
            window.setTimeout(() => {
              onCatalogRefresh?.();
            }, 1200);
          } finally {
            setIsArchiving(false);
          }
        }}
      >
        {isArchiving ? <span className={styles.spinner} /> : <IconArchive />}
        {isArchiving ? "Archiving..." : "Archive"}
      </button>

      {/* ── Export ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        className={styles.btnExport}
        disabled={isProcessing}
        title="Download task list as Excel file"
        onClick={async () => {
          if (!project.ListName || isProcessing) return;
          try {
            setIsExporting(true);
            const blob = await projectService.exportProject(project.ListName);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project.ListName}-export.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            markSuccess("Export completed");
          } catch (error) {
            console.error("Error downloading file.", error);
          } finally {
            setIsExporting(false);
          }
        }}
      >
        {isExporting ? <span className={styles.spinner} /> : <IconExport />}
        {isExporting ? "Exporting..." : "Export"}
      </button>

      {/* ── Import ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        className={styles.btnImport}
        disabled={isProcessing}
        title="Import tasks from an Excel file"
        onClick={() => {
          if (isProcessing) return;
          fileInputRef.current?.click();
        }}
      >
        {isImporting ? <span className={styles.spinner} /> : <IconImport />}
        {isImporting ? "Importing…" : "Import"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0] || null;
          if (file) {
            try {
              setIsImporting(true);
              await projectService.importProject(project.ListName, file);
              onReset();
              markSuccess("Import completed");
            } finally {
              setIsImporting(false);
              e.target.value = "";
            }
          }
        }}
      />

      {/* ── Download template ────────────────────────────────────────────── */}
      <a
        href="https://ed2corp.sharepoint.com/:x:/g/IQCO4yJi-ZQvS6wiVWAQ95I6AUb7buP7UpAsIpZ_d7QSuuY?e=64Tc7H&download=1"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.btnTemplate}
        title="Download the Excel template for importing tasks"
      >
        <IconTemplate />
        Download template
      </a>

      <a
        href={listUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.btnQuickLink}
        title="Open the SharePoint task list for this project"
      >
        <IconListLink />
        List
      </a>

      <a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.btnQuickLink}
        title="Open the evidence repository for this project"
      >
        <IconRepoLink />
        Repo
      </a>

    </div>
  );
};

export default ProjectActionsBar;
