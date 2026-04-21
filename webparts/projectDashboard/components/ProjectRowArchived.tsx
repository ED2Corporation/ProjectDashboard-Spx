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
    date?: string;
    user?: string;
    fileName?: string;
    fileUrl?: string;
    isEvidenceOfCompletion?: boolean;
  } | null;
  /** Flat fallback fields — used when evidenceOfCompletion is absent */
  EvidenceDescription?: string;
  EvidenceOfCompletion?: string;
  /** Raw SP list item — contains EvidenceOfCompletion/EvidenceDescription as flat SP columns */
  raw?: {
    EvidenceOfCompletion?: string | null;
    EvidenceDescription?: string | null;
    [key: string]: unknown;
  };
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
    note?: string;
    isEvidenceOfCompletion?: boolean;
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

/** Resolves the evidence-of-completion link for a task.
 *  V2: evidence[] entry with isEvidenceOfCompletion === true
 *  V1 legacy: evidenceOfCompletion object
 *  Flat fallback: EvidenceOfCompletion URL + EvidenceDescription label
 */
const resolveTaskEvidence = (task: ArchivedProjectReportTask): { url: string; label: string } | null => {
  // V2 — evidence array
  const v2 = task.evidence?.find(e => e.isEvidenceOfCompletion);
  if (v2?.fileUrl) {
    return { url: v2.fileUrl, label: v2.fileName || "Evidence" };
  }
  // V1 legacy — evidenceOfCompletion object
  if (task.evidenceOfCompletion?.fileUrl) {
    return { url: task.evidenceOfCompletion.fileUrl, label: task.evidenceOfCompletion.fileName || "Evidence" };
  }
  // Flat field fallback (top-level or raw SP item)
  const flatUrl = task.EvidenceOfCompletion || (task.raw?.EvidenceOfCompletion ?? undefined);
  const flatLabel = task.EvidenceDescription || (task.raw?.EvidenceDescription ?? undefined);
  if (flatUrl) {
    return { url: flatUrl, label: flatLabel || "Evidence" };
  }
  return null;
};

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

    const badgeClass = (pct: number): string => {
      if (pct >= 100) return "badge badge-done";
      if (pct >= 50)  return "badge badge-high";
      if (pct >= 25)  return "badge badge-mid";
      return "badge badge-low";
    };

    const taskSections = sections.tasks ? grouped.map(group => {
      const gTotal = group.tasks.length;
      const gDone  = group.tasks.filter(t => (t.complete ?? 0) >= 100).length;
      const gPct   = gTotal ? Math.round(group.tasks.reduce((s, t) => s + (t.complete ?? 0), 0) / gTotal) : 0;
      return `
      <div class="gate-section">
        <div class="gate-header">
          <span class="gate-name">${htmlEscape(group.gate)}</span>
          <span class="gate-stat">${gDone}/${gTotal} · ${gPct}%</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>WBS</th><th>Task</th><th>Complete</th><th>Start</th><th>Actual Finish</th>${sections.evidence ? "<th>Evidence</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${group.tasks.map(task => {
              const pct = task.complete ?? 0;
              const ev  = resolveTaskEvidence(task);
              return `
              <tr>
                <td>${htmlEscape(task.wbs)}</td>
                <td>${htmlEscape(task.task)}</td>
                <td><span class="${badgeClass(pct)}">${htmlEscape(pct)}%</span></td>
                <td>${htmlEscape(formatDate(task.start))}</td>
                <td>${htmlEscape(formatDate(task.actualFinish))}</td>
                ${sections.evidence ? `<td>${ev ? `<a href="${htmlEscape(ev.url)}">${htmlEscape(ev.label)}</a>` : "<em>—</em>"}</td>` : ""}
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
    }).join("") : "";

    const logColumns = Number(sections.notes) + Number(sections.evidence) + Number(sections.approvals);
    const logSections = logColumns > 0 ? `
      <div class="log-section">
        <p class="log-section-title">Project Log — Notes · Evidence · Approvals</p>
        ${grouped.map(group => `
          <div class="log-gate">
            <p class="log-gate-name">${htmlEscape(group.gate)}</p>
            <div class="log-grid columns-${logColumns}">
              ${sections.notes ? `<div>
                <div class="log-col-title">Notes</div>
                ${group.tasks.reduce<string[]>((rows, task) => {
                  (task.notes ?? []).forEach(entry => rows.push(
                    `<div class="log-entry log-entry-note">
                      <div class="log-meta">${htmlEscape(formatDate(entry.date, true))} · ${htmlEscape(entry.user || "User")} · ${htmlEscape(task.wbs)}</div>
                      <div class="log-content">${htmlEscape(entry.note)}</div>
                    </div>`
                  ));
                  return rows;
                }, []).join("") || "<em>No notes.</em>"}
              </div>` : ""}
              ${sections.evidence ? `<div>
                <div class="log-col-title">Evidence</div>
                ${group.tasks.reduce<string[]>((rows, task) => {
                  (task.evidence ?? []).forEach(entry => rows.push(
                    `<div class="log-entry log-entry-evidence">
                      <div class="log-meta">${htmlEscape(formatDate(entry.date, true))} · ${htmlEscape(entry.user || "User")} · ${htmlEscape(task.wbs)}</div>
                      <div class="log-content">${entry.fileUrl
                        ? `<a href="${htmlEscape(entry.fileUrl)}">${htmlEscape(entry.fileName || "File")}</a>`
                        : htmlEscape(entry.fileName)}${entry.note ? ` — ${htmlEscape(entry.note)}` : ""}</div>
                    </div>`
                  ));
                  return rows;
                }, []).join("") || "<em>No evidence.</em>"}
              </div>` : ""}
              ${sections.approvals ? `<div>
                <div class="log-col-title">Approvals</div>
                ${group.tasks.reduce<string[]>((rows, task) => {
                  (task.approvals ?? []).forEach(entry => rows.push(
                    `<div class="log-entry log-entry-approval-${htmlEscape(entry.status || "pending")}">
                      <div class="log-meta">${htmlEscape(formatDate(entry.date, true))} · ${htmlEscape(task.wbs)}</div>
                      <div class="log-content">${htmlEscape(entry.user || entry.email || "Approver")}${entry.status ? ` · <strong>${htmlEscape(entry.status)}</strong>` : ""}</div>
                    </div>`
                  ));
                  return rows;
                }, []).join("") || "<em>No approvals.</em>"}
              </div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>` : "";

    const allTasks2  = report.tasks ?? [];
    const totalPrint = allTasks2.length;
    const donePrint  = allTasks2.filter(t => (t.complete ?? 0) >= 100).length;
    const avgPrint   = totalPrint ? Math.round(allTasks2.reduce((s, t) => s + (t.complete ?? 0), 0) / totalPrint) : 0;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(reportProject?.PartNumber || reportProject?.Title || project.Title)} — Archived Report</title>
  <style>
    @page { margin: 14mm 16mm; }
    * { box-sizing: border-box; }
    body { color: #1e293b; font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; background: #f8fafc; margin: 0; padding: 16px; }

    /* Cover */
    .cover { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 20px; margin-bottom: 14px; background: #fff; border: 1px solid #cbd5e1; border-left: 5px solid #475569; border-radius: 10px; }
    .cover-left { flex: 1; min-width: 0; }
    .cover-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
    .cover-title { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    .cover-meta { font-size: 10px; color: #64748b; margin-bottom: 12px; }
    .cover-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; padding-left: 16px; }
    .stamp { display: inline-block; padding: 4px 12px; border: 2px solid #94a3b8; border-radius: 4px; color: #64748b; font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; transform: rotate(-2deg); }
    .gen-date { font-size: 9px; color: #94a3b8; }

    /* Summary grid */
    .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 10px; }
    .summary div { padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
    .summary span { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px; }

    /* Gate section */
    .gate-section { margin-bottom: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
    .gate-header { display: flex; align-items: center; justify-content: space-between; padding: 7px 14px; background: linear-gradient(90deg, #f0f6ff 0%, #fff 100%); border-bottom: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; }
    .gate-name { font-size: 11px; font-weight: 700; color: #1e293b; margin: 0; }
    .gate-stat { font-size: 10px; color: #64748b; }

    /* Table */
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { padding: 5px 10px; background: #f8fafc; color: #94a3b8; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
    td { padding: 5px 10px; color: #475569; border-bottom: 1px solid #f1f5f9; vertical-align: top; word-break: break-word; }
    tr:nth-child(even) td { background: #fafbfd; }
    tr:last-child td { border-bottom: none; }
    td:nth-child(1), td:nth-child(3), td:nth-child(4), td:nth-child(5), td:nth-child(6) { white-space: nowrap; width: 1%; }
    td:nth-child(2) { min-width: 200px; }
    a { color: #2563eb; text-decoration: none; }

    /* Badge */
    .badge { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; }
    .badge-done { background: #dcfce7; color: #15803d; }
    .badge-high { background: #dbeafe; color: #1d4ed8; }
    .badge-mid  { background: #fef9c3; color: #92400e; }
    .badge-low  { background: #fee2e2; color: #b91c1c; }

    /* Log */
    .log-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 12px; page-break-inside: avoid; }
    .log-section-title { padding: 6px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #94a3b8; margin: 0; }
    .log-gate { padding: 10px 14px; }
    .log-gate + .log-gate { border-top: 1px solid #f1f5f9; }
    .log-gate-name { font-size: 10px; font-weight: 700; color: #334155; margin: 0 0 8px; }
    .log-grid { display: grid; gap: 10px; }
    .log-col-title { font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
    .log-entry { padding: 5px 8px 5px 10px; margin-bottom: 5px; border-left: 2px solid #cbd5e1; border-radius: 0 4px 4px 0; background: #f8fafc; }
    .log-entry-note     { border-left-color: #60a5fa; }
    .log-entry-evidence { border-left-color: #34d399; }
    .log-entry-approval-pending  { border-left-color: #fbbf24; }
    .log-entry-approval-approved { border-left-color: #34d399; }
    .log-entry-approval-rejected { border-left-color: #f87171; }
    .log-meta { font-size: 9px; color: #94a3b8; margin-bottom: 2px; }
    .log-content { font-size: 10px; color: #475569; }
    em { color: #94a3b8; font-size: 10px; }

    .columns-1 { grid-template-columns: 1fr; }
    .columns-2 { grid-template-columns: repeat(2, 1fr); }
    .columns-3 { grid-template-columns: repeat(3, 1fr); }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-left">
      <div class="cover-eyebrow">Archived Project Report</div>
      <div class="cover-title">${htmlEscape(reportProject?.PartNumber || reportProject?.Title || project.Title)}</div>
      <div class="cover-meta">${[reportProject?.Customer, reportProject?.ProjectNumber].filter(Boolean).map(htmlEscape).join(' · ')}</div>
      <div class="summary">
        <div><span>Project #</span>${htmlEscape(reportProject?.ProjectNumber || "-")}</div>
        <div><span>Customer</span>${htmlEscape(reportProject?.Customer || "-")}</div>
        <div><span>Units</span>${htmlEscape(reportProject?.Units ?? "-")}</div>
        <div><span>Year</span>${htmlEscape(reportProject?.Year ?? "-")}</div>
        <div><span>Tasks done</span>${htmlEscape(donePrint)} / ${htmlEscape(totalPrint)}</div>
        <div><span>Avg. complete</span>${htmlEscape(avgPrint)}%</div>
      </div>
    </div>
    <div class="cover-right">
      <div class="stamp">Archived</div>
      <div class="gen-date">${htmlEscape(formatDate(report.generatedAt, true))}</div>
    </div>
  </div>

  ${taskSections || ""}
  ${logSections || ""}
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

  const handleDownloadHtml = async (): Promise<void> => {
    let json = reportJson;
    if (!json && archivedReport?.jsonFileUrl) {
      try {
        const response = await fetch(archivedReport.jsonFileUrl, { credentials: "include" });
        if (!response.ok) throw new Error(`Unable to load JSON (${response.status})`);
        json = await response.json() as ArchivedProjectReportJson;
        setReportJson(json);
      } catch (error) {
        setReportError((error as Error).message || "Unable to prepare HTML report.");
        return;
      }
    }
    if (!json) { setReportError("No JSON report available to generate HTML."); return; }

    const html = buildPrintableReportHtml(json, includedSections);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${project.Title || "archived-report"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const completeBadgeLevel = (pct: number): string => {
    if (pct >= 100) return "done";
    if (pct >= 50)  return "high";
    if (pct >= 25)  return "mid";
    return "low";
  };

  const renderDynamicReport = (): React.ReactElement => {
    const reportProject = reportJson?.project ?? project;
    const allTasks = reportJson?.tasks ?? [];
    const totalTasks = allTasks.length;
    const doneTasks  = allTasks.filter(t => (t.complete ?? 0) >= 100).length;
    const avgPct     = totalTasks ? Math.round(allTasks.reduce((s, t) => s + (t.complete ?? 0), 0) / totalTasks) : 0;

    return (
      <div className={styles.archivedDynamicReport}>

        {/* ── Cover ──────────────────────────────────────────────── */}
        <div className={styles.archivedReportCover}>
          <div className={styles.archivedReportCoverLeft}>
            <div className={styles.archivedReportCoverEyebrow}>Archived Project Report</div>
            <h2 className={styles.archivedReportCoverTitle}>
              {reportProject?.PartNumber || project.PartNumber || reportProject?.Title || project.Title}
            </h2>
            <div className={styles.archivedReportCoverMeta}>
              {reportProject?.Customer && <span>{reportProject.Customer}</span>}
              {reportProject?.ProjectNumber && <><span>·</span><span>{reportProject.ProjectNumber}</span></>}
              {reportProject?.Units ? <><span>·</span><span>{reportProject.Units} units</span></> : null}
            </div>
            <div className={styles.archivedReportSummaryGrid}>
              <div><span>Project #</span>{reportProject?.ProjectNumber || "-"}</div>
              <div><span>Customer</span>{reportProject?.Customer || "-"}</div>
              <div><span>Units</span>{reportProject?.Units ?? "-"}</div>
              <div><span>Year</span>{reportProject?.Year ?? "-"}</div>
              <div><span>Tasks done</span>{doneTasks} / {totalTasks}</div>
              <div><span>Avg. complete</span>{avgPct}%</div>
            </div>
          </div>
          <div className={styles.archivedReportCoverRight}>
            <div className={styles.archivedStamp}>Archived</div>
            {reportJson?.generatedAt && (
              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                {formatDate(reportJson.generatedAt, true)}
              </span>
            )}
          </div>
        </div>

        {/* ── Task sections by gate ───────────────────────────────── */}
        {includedSections.tasks && tasksByGate.map(group => {
          const gTotal = group.tasks.length;
          const gDone  = group.tasks.filter(t => (t.complete ?? 0) >= 100).length;
          const gPct   = gTotal ? Math.round(group.tasks.reduce((s, t) => s + (t.complete ?? 0), 0) / gTotal) : 0;
          return (
            <div className={styles.archivedReportSection} key={group.gate}>
              <div className={styles.archivedGateHeader}>
                <h3 className={styles.archivedGateName}>{group.gate}</h3>
                <div className={styles.archivedGateStat}>
                  <div className={styles.archivedGateProgress}>
                    <div style={{ width: `${gPct}%` }} />
                  </div>
                  <span className={styles.archivedGateStatLabel}>{gDone}/{gTotal} · {gPct}%</span>
                </div>
              </div>
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
                    {group.tasks.map(task => {
                      const pct = task.complete ?? 0;
                      const ev  = resolveTaskEvidence(task);
                      return (
                        <tr key={`${group.gate}-${task.id ?? task.wbs ?? task.task}`}>
                          <td>{task.wbs}</td>
                          <td>{task.task}</td>
                          <td>
                            <span
                              className={styles.archivedCompleteBadge}
                              data-level={completeBadgeLevel(pct)}
                            >{pct}%</span>
                          </td>
                          <td>{formatDate(task.start)}</td>
                          <td>{formatDate(task.actualFinish)}</td>
                          {includedSections.evidence && (
                            <td>
                              {ev
                                ? <a href={ev.url} target="_blank" rel="noopener noreferrer">{ev.label}</a>
                                : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* ── Log section ─────────────────────────────────────────── */}
        {(includedSections.notes || includedSections.evidence || includedSections.approvals) && (
          <div className={styles.archivedLogSection}>
            <div className={styles.archivedLogSectionHeader}>
              <p className={styles.archivedLogSectionTitle}>Project Log — Notes · Evidence · Approvals</p>
            </div>
            {tasksByGate.map(group => {
              const hasNotes     = includedSections.notes     && group.tasks.some(t => (t.notes     ?? []).length > 0);
              const hasEvidence  = includedSections.evidence  && group.tasks.some(t => (t.evidence  ?? []).length > 0);
              const hasApprovals = includedSections.approvals && group.tasks.some(t => (t.approvals ?? []).length > 0);
              if (!hasNotes && !hasEvidence && !hasApprovals) return null;
              return (
                <div className={styles.archivedLogGate} key={`${group.gate}-log`}>
                  <p className={styles.archivedLogGateName}>{group.gate}</p>
                  <div className={styles.archivedLogGrid}>
                    {includedSections.notes && (
                      <div>
                        <div className={styles.archivedLogColumnTitle}>Notes</div>
                        {group.tasks.reduce<React.ReactNode[]>((nodes, task, ti) => {
                          (task.notes ?? []).forEach((entry, ni) => nodes.push(
                            <div key={`n-${ti}-${ni}`} className={styles.archivedLogEntry} data-type="note">
                              <span className={styles.archivedLogEntryMeta}>
                                {formatDate(entry.date, true)} · {entry.user || "User"} · {task.wbs}
                              </span>
                              <span className={styles.archivedLogEntryContent}>{entry.note}</span>
                            </div>
                          ));
                          return nodes;
                        }, [])}
                        {!group.tasks.some(t => (t.notes ?? []).length > 0) && (
                          <span className={styles.archivedLogEmpty}>No notes.</span>
                        )}
                      </div>
                    )}
                    {includedSections.evidence && (
                      <div>
                        <div className={styles.archivedLogColumnTitle}>Evidence</div>
                        {group.tasks.reduce<React.ReactNode[]>((nodes, task, ti) => {
                          (task.evidence ?? []).forEach((entry, ei) => nodes.push(
                            <div key={`e-${ti}-${ei}`} className={styles.archivedLogEntry} data-type="evidence">
                              <span className={styles.archivedLogEntryMeta}>
                                {formatDate(entry.date, true)} · {entry.user || "User"} · {task.wbs}
                              </span>
                              <span className={styles.archivedLogEntryContent}>
                                {entry.fileUrl
                                  ? <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer">{entry.fileName || "File"}</a>
                                  : entry.fileName}
                                {entry.note && <> — {entry.note}</>}
                              </span>
                            </div>
                          ));
                          return nodes;
                        }, [])}
                        {!group.tasks.some(t => (t.evidence ?? []).length > 0) && (
                          <span className={styles.archivedLogEmpty}>No evidence.</span>
                        )}
                      </div>
                    )}
                    {includedSections.approvals && (
                      <div>
                        <div className={styles.archivedLogColumnTitle}>Approvals</div>
                        {group.tasks.reduce<React.ReactNode[]>((nodes, task, ti) => {
                          (task.approvals ?? []).forEach((entry, ai) => nodes.push(
                            <div
                              key={`a-${ti}-${ai}`}
                              className={styles.archivedLogEntry}
                              data-type="approval"
                              data-status={entry.status || "pending"}
                            >
                              <span className={styles.archivedLogEntryMeta}>
                                {formatDate(entry.date, true)} · {task.wbs}
                              </span>
                              <span className={styles.archivedLogEntryContent}>
                                {entry.user || entry.email || "Approver"}
                                {entry.status && <> · <strong>{entry.status}</strong></>}
                              </span>
                            </div>
                          ));
                          return nodes;
                        }, [])}
                        {!group.tasks.some(t => (t.approvals ?? []).length > 0) && (
                          <span className={styles.archivedLogEmpty}>No approvals.</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
            {project.WorkOrder && <><span className={styles.woTag}>PO# {project.WorkOrder}</span>{' '}</>}
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
                {archivedReport.jsonFileUrl && (
                  <button
                    type="button"
                    className={styles.archivedReportLink}
                    onClick={handleDownloadHtml}
                  >
                    Download HTML
                  </button>
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
