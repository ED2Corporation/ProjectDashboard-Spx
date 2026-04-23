import React from "react";
import styles from "./ProjectDashboard.module.scss";

export interface NewProjectSetupProps {
  defaultProjectName?: string;
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
  onProjectCreated?: (data: {
    projectName: string;
    listName: string;
    repoName: string;
    projectId: string;
  }) => void;
}

const NewProjectSetup: React.FC<NewProjectSetupProps> = ({
  defaultProjectName,
  onCancel,
  onCreate,
  getLastProjectFromCatalog,
  addProjectToCatalog,
  onProjectCreated,
}) => {
  const [projectName, setProjectName] = React.useState( "NewProject");
  const [firstGate, setFirstGate] = React.useState("1. Design");
  const [isCreating, setIsCreating] = React.useState(false);
  const [excelFile, setExcelFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [projectNumber, setProjectNumber] = React.useState<string | null>(null);
  const [customer, setCustomer] = React.useState("Internal");
  const [team, setTeam] = React.useState<
    "Engineering" | "Strategic" | "Operations" | "Sales" | "Other"
  >("Operations");
  const [status] = React.useState("Open");

  const buildProjectId = (
    num: string | null,
    customer: string,
    title: string
  ): string => {
    const n = num || "0";
    const cleanCustomer = customer.trim().replace(/\s+/g, "-");
    const cleanTitle = title.trim().replace(/\s+/g, "-");
    return `${n}-${cleanCustomer}-${cleanTitle}`;
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
      } catch (e) {
        console.error("Error loading last ProjectNumber from catalog:", e);
      }
    })();
  }, [getLastProjectFromCatalog]);

  const handleCreate = async (mode: "empty" | "from-excel", fileArg?: File | null) => {
    if (!projectName.trim()) {
      alert("Please fill in Project name.");
      return;
    }

    const projectSeq = projectNumber ?? "0";
    if (!projectSeq) {
      alert("Invalid project number.");
      return;
    }
    const fileToUse = fileArg ?? excelFile;
    //console.log("Mode: "+mode+" file: "+fileToUse?.size+" file: "+fileArg?.size)

    if (mode === "from-excel" && !fileToUse) {
      alert("Please select a valid file.");
      setExcelFile(null);
      return;

    }
    const projectId = buildProjectId(projectSeq, customer, projectName);
    const year = new Date().getFullYear();

    const listName = `${projectId}-List`;
    const repoName = `${projectId}-Evidence`;

    try {
      setIsCreating(true);

      await onCreate(
        listName,
        repoName,
        projectId.trim(),
        firstGate.trim(),
        mode,
        mode === "from-excel" ? fileToUse || undefined : undefined
      );

      await addProjectToCatalog({
        Title: projectId,
        ProjectNumber: projectSeq,
        ProjectId: projectId,
        Year: year,
        Team: team,
        Status: status,
        Customer: customer.trim(),
      });

    } finally {
      setIsCreating(false);
    }
  };

  const finalProjectIdPreview = buildProjectId(projectNumber, customer, projectName);

  return (
    <div className={styles["task-card"]}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>
        Create a new project:
      </h2>

      <table className={styles["task-table"]}>
        <tbody>
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
              <strong>Final project ID:</strong>
            </td>
            <td className={styles.colInput}>
              <span style={{ fontStyle: "italic" }}>
                {finalProjectIdPreview}
              </span>
            </td>
          </tr>

          <tr>
            <td>
              <strong>First gate:</strong>
            </td>
            <td>
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
                <option value="Operations">Operations</option>
                <option value="Sales">Sales</option>
                <option value="Other">Other</option>
              </select>
            </td>
          </tr>

          <tr>
            <td>
              <strong>Plan template (Excel):</strong>
            </td>
            <td>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setExcelFile(file);
                  if(file) {handleCreate("from-excel", file);}                  
                }}
                className={styles["input-small"]}
              />
              <a 
                style={{ fontSize: 10}}
                href="https://ed2corp.sharepoint.com/:x:/g/IQCO4yJi-ZQvS6wiVWAQ95I6AUb7buP7UpAsIpZ_d7QSuuY?e=64Tc7H&download=1" 
                target="_blank"
                rel="noopener noreferrer"                     
              >
                <p style={{ margin: 0 }}>Download template</p>
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        {isCreating && <span className={styles.spinner} aria-label="Loading" />}
        <button
          type="button"
          className={styles.primaryCtaButton}
          disabled={isCreating}
          onClick={() => handleCreate("empty")}
        >
          {isCreating ? "Creating…" : "Create project"}
        </button>

        <button
          type="button"
          className={styles.primaryCtaButton}
          disabled={isCreating}
          onClick={() => fileInputRef.current?.click()}
          style={{ marginLeft: 8 }}
        >
          {isCreating ? "Processing…" : "From Excel template"}
        </button>

        <button
          type="button"
          className={styles.secondaryCtaButton}
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
