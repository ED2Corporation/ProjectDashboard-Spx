import React, {  } from "react";
import styles from "./ProjectDashboard.module.scss";

export interface NewProjectSetupProps {
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

  getLastProjectFromCatalog: () => Promise<{ ProjectNumber?: string } | null>;

  addProjectToCatalog: (data: {
    Title: string;
    ProjectNumber: string;
    ProjectId: string;
    Year: number;
    Team: string;
    Status: string;
    Customer: string;
  }) => Promise<void>;
}

const NewProjectSetup: React.FC<NewProjectSetupProps> = ({
  defaultProjectName,
  defaultSourceName,
  defaultRepositoryName,
  onCancel,
  onCreate,
  getLastProjectFromCatalog,
  addProjectToCatalog,
}) => {
  const [projectName, setProjectName] = React.useState( defaultProjectName || "");
  const [listName, setListName] = React.useState(defaultSourceName || "");
  const [repoName, setRepoName] = React.useState(defaultRepositoryName || "EvidenceRepository");
  const [firstGate, setFirstGate] = React.useState("1. Design");
  const [isCreating, setIsCreating] = React.useState(false);
  const [excelFile, setExcelFile] = React.useState<File | null>(null);
  const [listTouched, setListTouched] = React.useState(false);
  const [repoTouched, setRepoTouched] = React.useState(false);  

  const [projectNumber, setProjectNumber] = React.useState<string | null>(null);
  const [customer, setCustomer] = React.useState("Internal");
  const [team, setTeam] = React.useState<"Engineering" | "Strategic" | "Operations" | "Sales" | "Other">("Operations");
  const [status] = React.useState("Open");

  const resetProjectId = (newProject: string): string => {
    const num = newProject ?? "0";
    const cleanCustomer = customer.trim().replace(/\s+/g, "-");
    const cleanTitle = projectName.trim().replace(/\s+/g, "-");
    return `${num}-${cleanCustomer}-${cleanTitle}`;
  };

  const buildProjectId = (): string => {
    return resetProjectId(projectNumber ?? "0");
  };

  React.useEffect(() => {
    (async () => {
      try {
        const last = await getLastProjectFromCatalog();
        const lastStr = last?.ProjectNumber || "0";
        const lastNum = Number(lastStr) || 0;
        const nextNum = lastNum + 1;
        const nextSeq = String(nextNum);

        setProjectNumber(nextSeq);
        
        if (projectName.trim()) {
          const newName = resetProjectId(nextSeq); 
          setProjectName(newName);
          setListName(newName ? `${newName}-List` : projectName+"-List");
          setRepoName(newName ? `${newName}-Evidence` : "EvidenceRepository");
        }
        console.log("[NewProjectSetup-useEffect] ProjectId:",nextSeq);
      } catch (e) {
        console.error("Error loading last ProjectNumber from catalog:", e);
      }
    })();
  }, [getLastProjectFromCatalog]);

  

  const handleCreate = async () => {
    if (!projectName.trim() || !listName.trim() || !repoName.trim()) {
      alert("Please fill in Project name, Task list name and Evidence repository.");
      return;
    }

    const projectSeq = projectNumber ?? "0";
    if (!projectSeq) {
      alert("Invalid project number.");
      return;
    }

    const projectId = buildProjectId();
    const year = new Date().getFullYear();

    try {
      setIsCreating(true);

      // 1) Crear el proyecto (lista, repo, etc.)
      await onCreate(
        listName.trim(),
        repoName.trim(),
        projectName.trim(),
        firstGate.trim(),
        "empty"
      );

      // 2) Registrar en catálogo
      await addProjectToCatalog({
        Title: projectName.trim(),
        ProjectNumber: projectSeq,
        ProjectId: projectId,
        Year: year,
        Team: team,
        Status: status,      // "Open"
        Customer: customer.trim(),
      });

      console.log("New ProjectId:", projectId);
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

          <tr>
            <td className={styles.colLabel}>
              <strong>Project number:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="number"
                value={projectNumber ?? ""}
                onChange={(e) => setProjectNumber(e.target.value || "0")}
                className={styles["input-small"]}
                placeholder="Auto-assigned"
              />
            </td>
          </tr>

          <tr>
            <td className={styles.colLabel}>
              <strong>Customer:</strong>
            </td>
            <td className={styles.colInput}>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className={styles["input-small"]}
                placeholder="Customer name"
              />
            </td>
          </tr>

          <tr>
            <td className={styles.colLabel}>
              <strong>Team:</strong>
            </td>
            <td className={styles.colInput}>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value as any)}
                className={styles["input-small"]}
              >
                <option value="Engineering">Engineering</option>
                <option value="Strategic">Strategic</option>
                <option value="Operations">Operations</option> {/* default */}
                <option value="Sales">Sales</option>
                <option value="Other">Other</option>
              </select>
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