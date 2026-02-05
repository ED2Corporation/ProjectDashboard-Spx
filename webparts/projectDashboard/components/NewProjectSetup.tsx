import React, {  } from "react";
import styles from "./ProjectDashboard.module.scss";

interface NewProjectSetupProps {
  defaultProjectName?: string;
  defaultSourceName?: string;
  defaultRepositoryName?: string;
  onCancel: () => void;
  onCreate: (
    listName: string,
    repositoryName: string,
    projectTitle: string,
    firstGate: string,
    mode: "empty" | "from-excel",
    file?: File
  ) => Promise<void>;
}

const NewProjectSetup: React.FC<NewProjectSetupProps> = ({
  defaultProjectName,
  defaultSourceName,
  defaultRepositoryName,
  onCancel,
  onCreate,
}) => {
  const [projectName, setProjectName] = React.useState(defaultProjectName || "");
  const [listName, setListName] = React.useState(defaultSourceName || "");
  const [repoName, setRepoName] = React.useState(defaultRepositoryName || "EvidenceRepository");
  const [firstGate, setFirstGate] = React.useState("1. Design");
  const [isCreating, setIsCreating] = React.useState(false);
  const [excelFile, setExcelFile] = React.useState<File | null>(null);
  const [listTouched, setListTouched] = React.useState(false);
  const [repoTouched, setRepoTouched] = React.useState(false);  

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      await onCreate(
        listName.trim(),
        repoName.trim(),
        projectName.trim(),
        firstGate.trim(),
        "empty"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const toCamelNoSpaces = (value: string): string => {
    return value
      .trim()
      .split(/\s+/)
      .map((w, i) =>
        i === 0
          ? w.charAt(0).toLowerCase() + w.slice(1)
          : w.charAt(0).toUpperCase() + w.slice(1)
      )
      .join("");
  };

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setProjectName(value);

    const base = toCamelNoSpaces(value);

    if (!listTouched) {
      setListName(base ? `${base}-List` : "");
    }
    if (!repoTouched) {
      setRepoName(base ? `${base}-Evidence` : "EvidenceRepository");
    }
  };


  return (
    <div className={styles["task-card"]}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>
        Start new project: {defaultProjectName}
      </h2>

      <table className={styles["task-table"]}>
        <tbody>
          <tr>
            <td className={styles.colLabel}>
              <strong>Project name:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="text"
                value={projectName}
                onChange={handleProjectNameChange}
                className={styles["input-small"]}
                placeholder="Displayed title for the project"
              />
            </td>
          </tr>

          <tr>
            <td >
              <strong>Task list name:</strong>
            </td>
            <td >
              <input
                type="text"
                value={listName}
                onChange={(e) => {
                  setListTouched(true);
                  setListName(e.target.value);
                }}
                className={styles["input-small"]}
                placeholder="SharePoint list name"
              />
            </td>
          </tr>

          <tr>
            <td >
              <strong>Evidence repository folder:</strong>
            </td>
            <td >
             <input
                type="text"
                value={repoName}
                onChange={(e) => {
                  setRepoTouched(true);
                  setRepoName(e.target.value);
                }}
                className={styles["input-small"]}
                placeholder="Folder for completion evidence"
              />
            </td>
          </tr>

          <tr>
            <td >
              <strong>First gate:</strong>
            </td>
            <td >
              <input
                type="text"
                value={firstGate}
                onChange={(e) => setFirstGate(e.target.value)}
                className={styles["input-small"]}
                placeholder="e.g. 1. Gate"
              />
            </td>
          </tr>
          <tr>
            <td>
              <strong>Plan template (Excel):</strong>
            </td>
            <td>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setExcelFile(file);
                }}
                className={styles["input-small"]}
              />
              <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4 }}>
                Expected columns: Gate, Task, Deliverable, Start, Finish, Complete, Description, EvidenceOfCompletion, EvidenceDescription.
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        {isCreating && <span className={styles.spinner} aria-label="Loading" />}
        <button
          type="button"
          className={styles["primaryCtaButton"]}
          disabled={isCreating}
          onClick={handleCreate}
        >
          {isCreating ? "Creating…" : "Create project"}
        </button>
         <button
            type="button"
            className={styles["primaryCtaButton"]}
            disabled={isCreating || !excelFile}
            onClick={async () => {
              if (!excelFile) return;
              try {
                setIsCreating(true);
                await onCreate(
                  listName.trim(),
                  repoName.trim(),
                  projectName.trim(),
                  firstGate.trim(),
                  "from-excel",
                  excelFile
                );
              } finally {
                setIsCreating(false);
              }
            }}
            style={{ marginLeft: 8 }}
          >
            {isCreating ? "Processing…" : "From Excel template"}
          </button>

          <button
            type="button"
            className={styles["secondaryCtaButton"]}
            onClick={onCancel}
            style={{ marginLeft: 8 }}
            disabled={isCreating}
          >
            Cancel
          </button>
        
      </div>
    </div>
  );
};

export default NewProjectSetup;