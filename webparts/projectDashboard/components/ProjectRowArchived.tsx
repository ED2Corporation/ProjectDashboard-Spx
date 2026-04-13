import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import styles from "./ProjectRowDashboard.module.scss";

interface ArchivedReportInfo {
  fileName?: string;
  fileUrl?: string;
  jsonFileName?: string;
  jsonFileUrl?: string;
  date?: string;
  isArchivedReport?: boolean;
}

interface ArchivedProjectReportTask {
  id?: number;
  wbs?: string;
  gate?: string;
  task?: string;
  complete?: number;
  start?: string;
  actualFinish?: string;
  evidenceOfCompletion?: {
    fileName?: string;
    fileUrl?: string;
  } | null;
  notes?: Array<{
    date?: string;
    user?: string;
    note?: string;
  }>;
  evidence?: Array<{
    date?: string;
    user?: string;
    fileName?: string;
    fileUrl?: string;
  }>;
  approvals?: Array<{
    date?: string;
    user?: string;
    email?: string;
    status?: string;
    comment?: string;
  }>;
}

interface ArchivedProjectReportJson {
  generatedAt?: string;
  project?: IProjectCatalogItem | null;
  tasks?: ArchivedProjectReportTask[];
}

type ArchivedReportView = "json" | "html";
type ArchivedReportSectionKey = "tasks" | "evidence" | "approvals" | "notes";

type ArchivedReportSections = Record<ArchivedReportSectionKey, boolean>;

const defaultReportSections: ArchivedReportSections = {
  tasks: true,
  evidence: true,
  approvals: true,
  notes: true,
};

export interface ProjectRowArchivedProps {
  project: IProjectCatalogItem;
}

const parseArchivedReport = (projectDetails?: string): ArchivedReportInfo | null => {
  if (!projectDetails || !projectDetails.trim()) return null;

  try {
    const parsed = JSON.parse(projectDetails) as {
      archivedReport?: ArchivedReportInfo;
      fileArchivedJson?: string;
      fileArchivedJsonName?: string;
    };
    const report = parsed.archivedReport;
    const jsonFileUrl = report?.jsonFileUrl || parsed.fileArchivedJson;
    const jsonFileName = report?.jsonFileName || parsed.fileArchivedJsonName;
    if (!report?.isArchivedReport && !jsonFileUrl) return null;
    return {
      ...report,
      jsonFileUrl,
      jsonFileName,
    };
  } catch {
    return null;
  }
};

const formatDate = (value?: string, withTime = false): string => {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (!withTime) return datePart;
  return `${datePart} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const htmlEscape = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const ProjectRowArchived: React.FC<ProjectRowArchivedProps> = ({ project }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reportView, setReportView] = useState<ArchivedReportView>("json");
  const [includedSections, setIncludedSections] = useState<ArchivedReportSections>(defaultReportSections);
  const [reportHtml, setReportHtml] = useState<string>("");
  const [reportJson, setReportJson] = useState<ArchivedProjectReportJson | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string>("");
  const archivedReport = useMemo(() => parseArchivedReport(project.ProjectDetails), [project.ProjectDetails]);
  const tasksByGate = useMemo(() => {
    const grouped: Array<{ gate: string; tasks: ArchivedProjectReportTask[] }> = [];
    const tasks = reportJson?.tasks ?? [];
    for (const task of tasks) {
      const gate = task.gate || "No Gate";
      let group = grouped.find(item => item.gate === gate);
      if (!group) {
        group = { gate, tasks: [] };
        grouped.push(group);
      }
      group.tasks.push(task);
    }
    return grouped;
  }, [reportJson?.tasks]);

  const handleHeaderClick = (): void => {
    setIsOpen(prev => !prev);
  };

  const toggleReportSection = (section: ArchivedReportSectionKey): void => {
    setIncludedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const buildPrintableReportHtml = (report: ArchivedProjectReportJson, sections: ArchivedReportSections): string => {
    const reportProject = report.project ?? project;
    const grouped: Array<{ gate: string; tasks: ArchivedProjectReportTask[] }> = [];
    for (const task of report.tasks ?? []) {
      const gate = task.gate || "No Gate";
      let group = grouped.find(item => item.gate === gate);
      if (!group) {
        group = { gate, tasks: [] };
        grouped.push(group);
      }
      group.tasks.push(task);
    }

    const taskSections = sections.tasks ? grouped.map(group => `
      <section>
        <h2>${htmlEscape(group.gate)}</h2>
        <table>
          <thead>
            <tr>
              <th>WBS</th><th>Task</th><th>Complete</th><th>Start</th><th>Actual Finish</th>${sections.evidence ? "<th>Evidence</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${group.tasks.map(task => `
              <tr>
                <td>${htmlEscape(task.wbs)}</td>
                <td>${htmlEscape(task.task)}</td>
                <td>${htmlEscape(task.complete ?? 0)}%</td>
                <td>${htmlEscape(formatDate(task.start))}</td>
                <td>${htmlEscape(formatDate(task.actualFinish))}</td>
                ${sections.evidence ? `<td>${task.evidenceOfCompletion?.fileUrl
                  ? `<a href="${htmlEscape(task.evidenceOfCompletion.fileUrl)}">${htmlEscape(task.evidenceOfCompletion.fileName || "Evidence")}</a>`
                  : "-"}</td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `).join("") : "";

    const logColumns = Number(sections.notes) + Number(sections.evidence) + Number(sections.approvals);
    const logSections = logColumns > 0 ? grouped.map(group => `
      <section>
        <h2>${htmlEscape(group.gate)} Log</h2>
        <div class="log-grid columns-${logColumns}">
          ${sections.notes ? `<div>
            <h3>Notes</h3>
            ${group.tasks.reduce<string[]>((rows, task) => {
              (task.notes ?? []).forEach(entry => rows.push(
                `<p><span>${htmlEscape(formatDate(entry.date, true))} - ${htmlEscape(entry.user || "User")} - ${htmlEscape(task.wbs)}</span>${htmlEscape(entry.note)}</p>`
              ));
              return rows;
            }, []).join("") || "<em>No notes.</em>"}
          </div>` : ""}
          ${sections.evidence ? `<div>
            <h3>Evidence</h3>
            ${group.tasks.reduce<string[]>((rows, task) => {
              (task.evidence ?? []).forEach(entry => rows.push(
                `<p><span>${htmlEscape(formatDate(entry.date, true))} - ${htmlEscape(entry.user || "User")} - ${htmlEscape(task.wbs)}</span>${entry.fileUrl
                  ? `<a href="${htmlEscape(entry.fileUrl)}">${htmlEscape(entry.fileName || "File")}</a>`
                  : htmlEscape(entry.fileName)}</p>`
              ));
              return rows;
            }, []).join("") || "<em>No evidence.</em>"}
          </div>` : ""}
          ${sections.approvals ? `<div>
            <h3>Approvals</h3>
            ${group.tasks.reduce<string[]>((rows, task) => {
              (task.approvals ?? []).forEach(entry => rows.push(
                `<p><span>${htmlEscape(formatDate(entry.date, true))} - ${htmlEscape(task.wbs)}</span>${htmlEscape(entry.user || entry.email || "Approver")} ${entry.status ? `- ${htmlEscape(entry.status)}` : ""}</p>`
              ));
              return rows;
            }, []).join("") || "<em>No approvals.</em>"}
          </div>` : ""}
        </div>
      </section>
    `).join("") : "";

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(reportProject?.Title || project.Title)} Archived Report</title>
  <style>
    @page { margin: 18mm; }
    body { color: #1f2937; font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; }
    header, section { margin-bottom: 18px; padding: 14px; border: 1px solid #dbe5f0; border-radius: 10px; page-break-inside: avoid; }
    h1 { margin: 0 0 4px; color: #0f172a; font-size: 22px; }
    h2 { margin: 0 0 10px; color: #075985; font-size: 16px; }
    h3 { margin: 0 0 8px; color: #334155; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { color: #64748b; font-size: 11px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .summary div { padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .summary span, .log-grid span { display: block; color: #64748b; font-size: 10px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px; border: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
    th { background: #edf4fb; color: #334155; }
    a { color: #0369a1; text-decoration: none; }
    .log-grid { display: grid; gap: 10px; }
    .columns-1 { grid-template-columns: 1fr; }
    .columns-2 { grid-template-columns: repeat(2, 1fr); }
    .columns-3 { grid-template-columns: repeat(3, 1fr); }
    p { margin: 0 0 8px; line-height: 1.35; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${htmlEscape(reportProject?.Title || project.Title)} Archived Report</h1>
    <div class="meta">Generated ${htmlEscape(formatDate(report.generatedAt, true))}</div>
    <div class="summary">
      <div><span>Project Number</span>${htmlEscape(reportProject?.ProjectNumber || "-")}</div>
      <div><span>Part Number</span>${htmlEscape(reportProject?.PartNumber || project.PartNumber || "-")}</div>
      <div><span>Customer</span>${htmlEscape(reportProject?.Customer || "-")}</div>
      <div><span>Units</span>${htmlEscape(reportProject?.Units ?? "-")}</div>
      <div><span>Year</span>${htmlEscape(reportProject?.Year ?? "-")}</div>
      <div><span>Status</span>${htmlEscape(reportProject?.Status || "Archived")}</div>
    </div>
  </header>
  ${taskSections || "<section><h2>Tasks</h2><em>Tasks section excluded.</em></section>"}
  ${logSections || "<section><h2>Project Log</h2><em>Log sections excluded.</em></section>"}
</body>
</html>`;
  };

  const handleDownloadPdf = async (): Promise<void> => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setReportError("Unable to open the PDF print window. Please allow pop-ups for this site.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head><title>Preparing PDF...</title></head>
<body style="font-family: Segoe UI, Arial, sans-serif; padding: 24px; color: #334155;">
  Preparing archived report PDF...
</body>
</html>`);
    printWindow.document.close();

    let json = reportJson;
    if (!json && archivedReport?.jsonFileUrl) {
      try {
        const response = await fetch(archivedReport.jsonFileUrl, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Unable to load archived JSON report (${response.status})`);
        }
        json = await response.json() as ArchivedProjectReportJson;
        setReportJson(json);
      } catch (error) {
        printWindow.close();
        setReportError((error as Error).message || "Unable to prepare PDF report.");
        return;
      }
    }

    if (!json) {
      printWindow.close();
      setReportError("No JSON report is available to generate the PDF.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintableReportHtml(json, includedSections));
    printWindow.document.close();
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        setReportError((error as Error).message || "Unable to open the PDF print dialog.");
      }
    }, 350);
  };

  useEffect(() => {
    if (!archivedReport?.jsonFileUrl && archivedReport?.fileUrl) {
      setReportView("html");
    }
  }, [archivedReport?.fileUrl, archivedReport?.jsonFileUrl]);

  useEffect(() => {
    const hasSelectedReport =
      (reportView === "json" && !!reportJson) ||
      (reportView === "html" && !!reportHtml);

    if (!isOpen || hasSelectedReport) return;
    if (reportView === "json" && !archivedReport?.jsonFileUrl) return;
    if (reportView === "html" && !archivedReport?.fileUrl) return;

    let disposed = false;
    setIsLoadingReport(true);
    setReportError("");

    const loadReport = async (): Promise<void> => {
      if (reportView === "json" && archivedReport?.jsonFileUrl) {
        try {
          const response = await fetch(archivedReport.jsonFileUrl, { credentials: "include" });
          if (!response.ok) {
            throw new Error(`Unable to load archived JSON report (${response.status})`);
          }
          const json = await response.json();
          if (!disposed) {
            setReportJson(json as ArchivedProjectReportJson);
          }
          return;
        } catch (error) {
          if (!disposed) {
            setReportError((error as Error).message || "Unable to load archived JSON report.");
          }
        }
      }

      if (reportView === "html" && archivedReport?.fileUrl) {
        try {
          const response = await fetch(archivedReport.fileUrl, { credentials: "include" });
          if (!response.ok) {
            throw new Error(`Unable to load archived report (${response.status})`);
          }
          const html = await response.text();
          if (!disposed) {
            setReportHtml(html);
          }
          return;
        } catch (error) {
          if (!disposed) {
            setReportError((error as Error).message || "Unable to load archived HTML report.");
          }
        }
      }
    };

    loadReport()
      .finally(() => {
        if (!disposed) setIsLoadingReport(false);
      });

    return () => {
      disposed = true;
    };
  }, [archivedReport?.fileUrl, archivedReport?.jsonFileUrl, isOpen, reportHtml, reportJson, reportView]);

  const renderLogNotes = (group: { tasks: ArchivedProjectReportTask[] }): React.ReactNode => {
    const entries = group.tasks.reduce<React.ReactNode[]>((nodes, task) => {
      (task.notes ?? []).forEach((entry, index) => {
        nodes.push(
          <p key={`${task.id}-note-${index}`}>
            <span>{formatDate(entry.date, true)} · {entry.user || "User"} · {task.wbs}</span>
            {entry.note}
          </p>
        );
      });
      return nodes;
    }, []);
    return entries.length ? entries : <em>No notes.</em>;
  };

  const renderLogEvidence = (group: { tasks: ArchivedProjectReportTask[] }): React.ReactNode => {
    const entries = group.tasks.reduce<React.ReactNode[]>((nodes, task) => {
      (task.evidence ?? []).forEach((entry, index) => {
        nodes.push(
          <p key={`${task.id}-evidence-${index}`}>
            <span>{formatDate(entry.date, true)} · {entry.user || "User"} · {task.wbs}</span>
            {entry.fileUrl ? (
              <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer">{entry.fileName || "File"}</a>
            ) : entry.fileName}
          </p>
        );
      });
      return nodes;
    }, []);
    return entries.length ? entries : <em>No evidence.</em>;
  };

  const renderLogApprovals = (group: { tasks: ArchivedProjectReportTask[] }): React.ReactNode => {
    const entries = group.tasks.reduce<React.ReactNode[]>((nodes, task) => {
      (task.approvals ?? []).forEach((entry, index) => {
        nodes.push(
          <p key={`${task.id}-approval-${index}`}>
            <span>{formatDate(entry.date, true)} · {task.wbs}</span>
            {(entry.user || entry.email || "Approver")} {entry.status ? `- ${entry.status}` : ""}
          </p>
        );
      });
      return nodes;
    }, []);
    return entries.length ? entries : <em>No approvals.</em>;
  };

  const renderDynamicReport = (): React.ReactElement => {
    const reportProject = reportJson?.project ?? project;
    return (
      <div className={styles.archivedDynamicReport}>
        <section className={styles.archivedReportSection}>
          <div className={styles.archivedReportSectionHeader}>
            <div>
              <div className={styles.archivedReportEyebrow}>Archived project</div>
              <h3>{reportProject?.Title || project.Title}</h3>
            </div>
            <span>{reportJson?.generatedAt ? formatDate(reportJson.generatedAt, true) : ""}</span>
          </div>
          <div className={styles.archivedReportSummaryGrid}>
            <div><span>Project Number</span>{reportProject?.ProjectNumber || "-"}</div>
            <div><span>Part Number</span>{reportProject?.PartNumber || project.PartNumber || "-"}</div>
            <div><span>Customer</span>{reportProject?.Customer || "-"}</div>
            <div><span>Units</span>{reportProject?.Units ?? "-"}</div>
            <div><span>Year</span>{reportProject?.Year ?? "-"}</div>
            <div><span>Status</span>{reportProject?.Status || "Archived"}</div>
          </div>
        </section>

        {includedSections.tasks && tasksByGate.map(group => (
          <section className={styles.archivedReportSection} key={group.gate}>
            <h3>{group.gate}</h3>
            <div className={styles.archivedTableWrap}>
              <table className={styles.archivedReportTable}>
                <thead>
                  <tr>
                    <th>WBS</th>
                    <th>Task</th>
                    <th>Complete</th>
                    <th>Start</th>
                    <th>Actual Finish</th>
                    {includedSections.evidence && <th>Evidence</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map(task => (
                    <tr key={`${group.gate}-${task.id ?? task.wbs ?? task.task}`}>
                      <td>{task.wbs}</td>
                      <td>{task.task}</td>
                      <td>{task.complete ?? 0}%</td>
                      <td>{formatDate(task.start)}</td>
                      <td>{formatDate(task.actualFinish)}</td>
                      {includedSections.evidence && (
                        <td>
                          {task.evidenceOfCompletion?.fileUrl ? (
                            <a href={task.evidenceOfCompletion.fileUrl} target="_blank" rel="noopener noreferrer">
                              {task.evidenceOfCompletion.fileName || "Evidence"}
                            </a>
                          ) : "-"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {(includedSections.notes || includedSections.evidence || includedSections.approvals) && (
        <section className={styles.archivedReportSection}>
          <div className={styles.archivedReportSectionHeader}>
            <div>
              <div className={styles.archivedReportEyebrow}>Project log</div>
              <h3>Notes, evidence and approvals</h3>
            </div>
          </div>
          {tasksByGate.map(group => (
            <div className={styles.archivedLogGate} key={`${group.gate}-log`}>
              <h4>{group.gate}</h4>
              <div className={styles.archivedLogGrid}>
                {includedSections.notes && <div>
                  <strong>Notes</strong>
                  {renderLogNotes(group)}
                </div>}
                {includedSections.evidence && <div>
                  <strong>Evidence</strong>
                  {renderLogEvidence(group)}
                </div>}
                {includedSections.approvals && <div>
                  <strong>Approvals</strong>
                  {renderLogApprovals(group)}
                </div>}
              </div>
            </div>
          ))}
        </section>
        )}
      </div>
    );
  };

  return (
    <div className={`${styles.card} ${styles.cardArchived} ${isOpen ? styles.cardActive : ""}`}>
      <div className={`${styles.header} ${isOpen ? styles.headerActive : ""}`} onClick={handleHeaderClick}>
        <div className={styles.projectInfo} style={{ cursor: "pointer" }}>
          <div className={styles.projectTitle}>
            {project.PartNumber}
            {!!project.Units && (
              <span className={styles.unitsTag}> ({project.Units} units)</span>
            )}
          </div>
          <div className={styles.projectSubtitle}>
            {project.WorkOrder && <><span className={styles.woTag}>WO# {project.WorkOrder}</span>{' '}</>}
            {project.ProjectNumber}
          </div>
          <div className={styles.projectCustomer}>{project.Customer}</div>
        </div>

        <div className={styles.archivedSummary}>
          <span className={styles.archivedBadge}>Archived</span>
          {archivedReport?.date && (
            <span className={styles.archivedDate}>Report: {formatDate(archivedReport.date)}</span>
          )}
          {archivedReport?.fileName && (
            <span className={styles.archivedFileName}>{archivedReport.fileName}</span>
          )}
          <div className={styles.archivedSectionToggles} onClick={(e) => e.stopPropagation()}>
            {([
              ["tasks", "Tasks"],
              ["evidence", "Evidence"],
              ["approvals", "Approval"],
              ["notes", "Notes"],
            ] as Array<[ArchivedReportSectionKey, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={includedSections[key] ? styles.archivedSectionToggleActive : ""}
                onClick={() => toggleReportSection(key)}
                title={`${includedSections[key] ? "Exclude" : "Include"} ${label}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className={styles.archivedReportPanel}>
          {archivedReport?.fileUrl || archivedReport?.jsonFileUrl ? (
            <>
              <div className={styles.archivedReportToolbar}>
                <span>
                  Archived project report
                  {archivedReport.jsonFileUrl && (
                    <a
                      href={archivedReport.jsonFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.archivedReportJsonLink}
                    >
                      Download JSON
                    </a>
                  )}
                </span>
                {archivedReport.jsonFileUrl && (
                  <button
                    type="button"
                    className={styles.archivedReportLink}
                    onClick={handleDownloadPdf}
                  >
                    Download PDF
                  </button>
                )}
                {archivedReport.fileUrl && (
                  <a
                    href={archivedReport.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.archivedReportLink}
                  >
                    Download HTML
                  </a>
                )}
              </div>
              {isLoadingReport ? (
                <div className={styles.noArchivedReport}>Loading archived report...</div>
              ) : reportJson ? (
                renderDynamicReport()
              ) : reportHtml ? (
                <iframe
                  title={`${project.Title} archived report`}
                  srcDoc={reportHtml}
                  className={styles.archivedReportFrame}
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              ) : reportError ? (
                <div className={styles.noArchivedReport}>
                  {reportError} Use Download HTML to view it directly.
                </div>
              ) : (
                <div className={styles.noArchivedReport}>No archived report content was loaded.</div>
              )}
            </>
          ) : (
            <div className={styles.noArchivedReport}>
              No archived report reference was found in ProjectDetails.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectRowArchived;
