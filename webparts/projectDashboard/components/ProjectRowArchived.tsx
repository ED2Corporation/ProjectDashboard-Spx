import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import { parseWorkOrder } from "../utils/StorageVersionResolver";
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

const ProjectRowArchived: React.FC<ProjectRowArchivedProps> = ({ project }) => {
  const [isOpen, setIsOpen] = useState(false);
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

  useEffect(() => {
    if (!isOpen || !archivedReport?.jsonFileUrl || reportJson || isLoadingReport) return;

    let disposed = false;
    setIsLoadingReport(true);
    setReportError("");

    fetch(archivedReport.jsonFileUrl, { credentials: "include" })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Unable to load archived JSON report (${response.status})`);
        }
        return response.json();
      })
      .then(json => {
        if (!disposed) setReportJson(json as ArchivedProjectReportJson);
      })
      .catch(error => {
        if (!disposed) setReportError((error as Error).message || "Unable to load archived JSON report.");
      })
      .finally(() => {
        if (!disposed) setIsLoadingReport(false);
      });

    return () => {
      disposed = true;
    };
  }, [archivedReport?.jsonFileUrl, isLoadingReport, isOpen, reportJson]);

  useEffect(() => {
    if (!isOpen || reportJson || !archivedReport?.fileUrl || reportHtml || isLoadingReport) return;

    let disposed = false;
    setIsLoadingReport(true);
    setReportError("");

    fetch(archivedReport.fileUrl, { credentials: "include" })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Unable to load archived report (${response.status})`);
        }
        return response.text();
      })
      .then(html => {
        if (!disposed) setReportHtml(html);
      })
      .catch(error => {
        if (!disposed) setReportError((error as Error).message || "Unable to load archived report.");
      })
      .finally(() => {
        if (!disposed) setIsLoadingReport(false);
      });

    return () => {
      disposed = true;
    };
  }, [archivedReport?.fileUrl, isLoadingReport, isOpen, reportHtml, reportJson]);

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

        {tasksByGate.map(group => (
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
                    <th>Evidence</th>
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
                      <td>
                        {task.evidenceOfCompletion?.fileUrl ? (
                          <a href={task.evidenceOfCompletion.fileUrl} target="_blank" rel="noopener noreferrer">
                            {task.evidenceOfCompletion.fileName || "Evidence"}
                          </a>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

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
                <div>
                  <strong>Notes</strong>
                  {renderLogNotes(group)}
                </div>
                <div>
                  <strong>Evidence</strong>
                  {renderLogEvidence(group)}
                </div>
                <div>
                  <strong>Approvals</strong>
                  {renderLogApprovals(group)}
                </div>
              </div>
            </div>
          ))}
        </section>
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
            {(() => {
              const wo = parseWorkOrder(project);
              return wo ? <><span className={styles.woTag}>WO# {wo}</span>{' '}</> : null;
            })()}
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
                  {reportError} Use Open report to view it directly.
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
