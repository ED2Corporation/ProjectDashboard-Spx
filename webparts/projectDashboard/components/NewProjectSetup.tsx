import React, {  } from "react";
import styles from "./ProjectDashboard.module.scss";

interface NewProjectSetupProps {
  defaultProjectName?: string;
  defaultSourceName?: string;
  defaultRepositoryName?: string;
  onCancel: () => void;
  onCreate: (listName: string, repositoryName: string, projectTitle: string, firstGate: string) => void;
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
  const [firstGate, setFirstGate] = React.useState("Gate 1");

  return (
    <div className={styles["task-card"]}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>
        Start new project: {defaultProjectName}
      </h2>

      <table className={styles["ed2Table"]}>
        <tbody>
          <tr>
            <td className={styles.colLabel}>
              <strong>Project name:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={styles["input-small"]}
                placeholder="Displayed title for the project"
              />
            </td>
          </tr>

          <tr>
            <td className={styles.colLabel}>
              <strong>Task list name:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                className={styles["input-small"]}
                placeholder="SharePoint list name"
              />
            </td>
          </tr>

          <tr>
            <td className={styles.colLabel}>
              <strong>Evidence repository folder:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className={styles["input-small"]}
                placeholder="Folder for completion evidence"
              />
            </td>
          </tr>

          <tr>
            <td className={styles.colLabel}>
              <strong>First gate:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="text"
                value={firstGate}
                onChange={(e) => setFirstGate(e.target.value)}
                className={styles["input-small"]}
                placeholder="e.g. Gate 1"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className={styles["primaryCtaButton"]}
          onClick={() =>
            onCreate(
              listName.trim(),
              repoName.trim(),
              projectName.trim(),
              firstGate.trim()
            )
          }
        >
          Create project
        </button>

        <button
          type="button"
          className={styles["primaryCtaButton"]}
          onClick={() =>
            onCreate(
              listName.trim(),
              repoName.trim(),
              projectName.trim(),
              firstGate.trim()
            )
          }
        >
          From Excel template
        </button>

        <button
          type="button"
          className={styles["secondaryCtaButton"]}
          onClick={onCancel}
          style={{ marginLeft: 8 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default NewProjectSetup;