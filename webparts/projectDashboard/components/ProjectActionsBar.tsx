import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import { IProjectListItem } from "../../../models";
import { ProjectService } from "../services/ProjectService";

export interface IProjectActionsBarProps {
  project: IProjectListItem;
  projectService: ProjectService;
  evidenceFolderServerRelative: string;
  repositoryName: string;
  onReset: () => void;
}

const ProjectActionsBar: React.FC<IProjectActionsBarProps> = ({
  project,
  projectService,
  evidenceFolderServerRelative,
  repositoryName,
  onReset,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = React.useState(false);

  return (
    <div style={{ border: "1px solid #e1dfdd", borderRadius: 4, backgroundColor: "#f4f4f4", padding: 4 }}>
      <div className={styles.actionsBar}>

        {/* ====== Archive ====== */}
        <button
          type="button"
          className={styles.actionItem}
          onClick={async () => {
            if (!project.ListName) return;
            await projectService.archiveProject(
              project.ListName,
              evidenceFolderServerRelative + project.RepositoryName,
              project.Title
            );
            onReset();
          }}
        >
          Archive
        </button>

        {/* ====== Delete (hidden) ====== */}
        <div style={{ display: "none" }}>
          <button
            type="button"
            className={styles.actionItem}
            onClick={async () => {
              if (!project.ListName) return;
              if (!confirm("Are you sure you want to delete this project and its evidence repository?")) return;
              await projectService.deleteProject(
                project.ListName,
                project.Title,
                evidenceFolderServerRelative + repositoryName
              );
              onReset();
            }}
          >
            Delete
          </button>
        </div>

        {/* ====== Export ====== */}
        <button
          type="button"
          className={styles.actionItem}
          onClick={async () => {
            if (!project.ListName) return;
            try {
              const blob = await projectService.exportProject(project.ListName);
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.ListName}-export.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            } catch {
              console.log("Error downloading file...");
            }
          }}
        >
          Export
        </button>

        {/* ====== Import ====== */}
        <div style={{ border: "1px solid #e1dfdd", borderRadius: 4, display: "flex", flexDirection: "row" }}>
          {isImporting && (
            <span className={styles.spinner} aria-label="Loading" style={{ marginLeft: 8 }} />
          )}
          <button
            type="button"
            className={styles.actionItem}
            onClick={() => fileInputRef.current?.click()}
          >
            {isImporting ? "Importing…" : "Import"}
          </button>
          <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4, display: "flex", flexDirection: "column" }}>
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
                  } finally {
                    setIsImporting(false);
                  }
                }
              }}
              className={styles["input-small"]}
            />
            <a
              href="https://ed2corp.sharepoint.com/:x:/g/IQCO4yJi-ZQvS6wiVWAQ95I6AUb7buP7UpAsIpZ_d7QSuuY?e=64Tc7H&download=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              <p style={{ margin: 0 }}>Download template</p>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProjectActionsBar;
