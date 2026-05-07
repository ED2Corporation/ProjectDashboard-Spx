import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";
import { IProjectService, IProjectCatalogItem } from "../../../models/IProjectService";

import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import { compareWbs } from "../utils/ParseWBS";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/fields";
import "@pnp/sp/views";
import "@pnp/sp/folders";
import "@pnp/sp/files";

export class ProjectService implements IProjectService {
    private readonly _context!: BaseComponentContext;
    private readonly _listName: string;
    private readonly _catalogListName = "ED2-Projects";

    private _sp: SPFI;
    /** Always points to the ED2-Team site — used for ED2-Projects catalog operations. */
    private _catalogSp: SPFI;

    constructor(contextOrSp: BaseComponentContext | SPFI, listName: string = "Projects", catalogSp?: SPFI) {
        if ((contextOrSp as any).pageContext) {
            this._context = contextOrSp as BaseComponentContext;
            this._listName = listName;
            this._sp = spfi().using(SPFx(this._context));
            this._catalogSp = this._sp;
        } else {
            this._sp = contextOrSp as SPFI;
            this._listName = listName;
            // catalogSp must target the parent site (ED2-Team); fall back to _sp if not provided
            this._catalogSp = catalogSp ?? this._sp;
        }
    }

    public get webUrl(): string {
        return this._context.pageContext.web.absoluteUrl.replace(/\/+$/, "");
    }

    private get listItemsEndpoint(): string {
        return `${this.webUrl}/_api/web/lists/getbytitle('${this._listName}')/items`;
    }

    /** CREATE: Create new project */
    public async createProject(baseData: any): Promise<string> {
        const body = {
            __metadata: { type: `SP.Data.${this._listName.replace(/\s/g, "_x0020_")}ListItem` },
            Title: baseData.Title,
            Status: baseData.Status || "Active"
        };

        const resp = await this._context.spHttpClient.post(
            this.listItemsEndpoint,
            SPHttpClient.configurations.v1,
            {
                headers: {
                    "Accept": "application/json;odata=nometadata",
                    "Content-Type": "application/json;odata=verbose"
                },
                body: JSON.stringify(body)
            }
        );

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`createProject failed: ${resp.status} - ${errorText}`);
        }

        const data = await resp.json();
        return data.Id as string;
    }

    public async deleteProject(
        listName: string,
        projectTitle: string,
        evidenceFolderServerRelative?: string
    ): Promise<void> {

        // 1) Delete the task list
        try {
            await this._sp.web.lists.getByTitle(listName).delete();
        } catch (error) {
            if (!String((error as Error)?.message ?? error).includes("404")) {
                throw error;
            }
        }

        // 2) Delete the evidence folder (if provided)
        if (evidenceFolderServerRelative) {
            try {
                await this._sp.web.getFolderByServerRelativePath(evidenceFolderServerRelative).delete();
            } catch (error) {
                if (!String((error as Error)?.message ?? error).includes("404")) {
                    throw error;
                }
            }
        }

        // 3) Preserve the catalog row and mark it as archived
        if (projectTitle) {
            const found = await this._catalogSp.web.lists.getByTitle(this._catalogListName)
                .items.select("Id").filter(`Title eq '${projectTitle.replace(/'/g, "''")}'`).top(1)();
            if (found.length) {
                await this._catalogSp.web.lists.getByTitle(this._catalogListName).items.getById((found[0] as any).Id).update({ Status: "Archived" }); // eslint-disable-line @typescript-eslint/no-explicit-any
            }
        }
    }

    /** ARCHIVE: exports the list as CSV, uploads it to the evidence folder, then deletes the list */
    public async archiveProject(
        listName: string,
        evidenceFolderServerRelative: string,
        projectTitle?: string,
        projectMetadata?: IProjectCatalogItem
    ): Promise<void> {

        const tasks = await this._getProjectTaskItems(listName);
        const csvBlob = this._buildTaskCsvBlob(tasks);
        const htmlBlob = this._buildProjectReportHtmlBlob(projectMetadata, tasks);
        const jsonBlob = this._buildProjectReportJsonBlob(projectMetadata, tasks);
        const reportFolder = `${evidenceFolderServerRelative}`;
        const timeStamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${listName}-${timeStamp}-Archived.csv`;
        const htmlFileName = `${listName}-${timeStamp}-Report.html`;
        const jsonFileName = `${listName}-${timeStamp}-Report.json`;

        await this._uploadBlobToReportFolder(reportFolder, fileName, csvBlob);
        const reportFile = await this._uploadBlobToReportFolder(reportFolder, htmlFileName, htmlBlob);
        const reportJsonFile = await this._uploadBlobToReportFolder(reportFolder, jsonFileName, jsonBlob);
        await this._saveArchivedReportMetadata(projectTitle ?? "", projectMetadata, {
            fileName: reportFile.fileName,
            fileUrl: reportFile.fileUrl,
            jsonFileName: reportJsonFile.fileName,
            jsonFileUrl: reportJsonFile.fileUrl,
            date: new Date().toISOString(),
            isArchivedReport: true,
        });
        await this.deleteProject(listName, projectTitle ?? "", undefined);
    }

    private async _uploadBlobToReportFolder(
        reportFolderServerRelativeUrl: string,
        fileName: string,
        blob: Blob
    ): Promise<{ fileName: string; fileUrl: string }> {
        const result = await this._sp.web
            .getFolderByServerRelativePath(reportFolderServerRelativeUrl)
            .files.addUsingPath(fileName, blob, { Overwrite: true });

        const web = await this._sp.web.select("Url")();
        return {
            fileName: result.Name || fileName,
            fileUrl: new URL(result.ServerRelativeUrl, web.Url).toString(),
        };
    }

    private async _saveArchivedReportMetadata(
        projectTitle: string,
        projectMetadata: IProjectCatalogItem | undefined,
        archivedReport: {
            fileName: string;
            fileUrl: string;
            jsonFileName?: string;
            jsonFileUrl?: string;
            date: string;
            isArchivedReport: boolean;
        }
    ): Promise<void> {
        if (!projectTitle) return;

        const found = await this._catalogSp.web.lists.getByTitle(this._catalogListName)
            .items.select("Id", "ProjectDetails")
            .filter(`Title eq '${projectTitle.replace(/'/g, "''")}'`)
            .top(1)();

        if (!found.length) return;

        const rawDetails = (found[0] as any).ProjectDetails || projectMetadata?.ProjectDetails || ""; // eslint-disable-line @typescript-eslint/no-explicit-any
        let details: Record<string, unknown> = {};
        if (typeof rawDetails === "string" && rawDetails.trim()) {
            try {
                const parsed = JSON.parse(rawDetails);
                if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
                    details = parsed as Record<string, unknown>;
                }
            } catch {
                details = {};
            }
        }

        details.archivedReport = archivedReport;
        details.fileArchivedJson = archivedReport.jsonFileUrl ?? "";
        details.fileArchivedJsonName = archivedReport.jsonFileName ?? "";

        await this._catalogSp.web.lists.getByTitle(this._catalogListName)
            .items.getById((found[0] as any).Id) // eslint-disable-line @typescript-eslint/no-explicit-any
            .update({
                ProjectDetails: JSON.stringify(details),
                Status: "Archived",
            });
    }

    /** EXPORT: returns a CSV Blob for the given task list */
    public async exportProject(listName: string): Promise<Blob> {
        const items = await this._getProjectTaskItems(listName);
        return this._buildTaskCsvBlob(items);
    }

    private async _getProjectTaskItems(listName: string): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
        return this._sp.web.lists.getByTitle(listName).items.top(5000)();
    }

    private _sortTaskItemsByWbs(items: any[]): any[] { // eslint-disable-line @typescript-eslint/no-explicit-any
        return [...items].sort((a, b) => compareWbs(String(a.Title ?? ""), String(b.Title ?? "")));
    }

    private _getGatesInWbsOrder(items: any[]): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any
        const gates: string[] = [];
        for (const item of items) {
            const gate = String(item.Gate || "No Gate");
            if (!gates.includes(gate)) {
                gates.push(gate);
            }
        }
        return gates;
    }

    private _buildTaskCsvBlob(items: any[]): Blob { // eslint-disable-line @typescript-eslint/no-explicit-any

        const headers = [
            "Id", "Title", "Gate", "Task", "Deliverable", "Complete", "Start", "Finish", "ActualFinish",
            "Description", "jsonTable", "EvidenceOfCompletion", "Barriers", "Effort", "ActionableStatus", "WBS",
            "Checklist", "Notes", "Evidence", "Approvals"
        ];

        const formatDate = (value: any): string => {
            if (!value) return "";
            const d = new Date(value);
            if (isNaN(d.getTime())) return "";
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };

        const csv = (value: any): string => {
            if (value === undefined || value === null) return "";
            const text = typeof value === "string" ? value : JSON.stringify(value);
            return `"${text.replace(/"/g, '""')}"`;
        };

        const lines = [
            headers.join(","),
            ...items.map(i => {
                return [
                    i.Id,
                    csv(i.Title),
                    csv(i.Gate),
                    csv(i.Task),
                    csv(i.Deliverable),
                    i.Complete ?? "",
                    formatDate(i.Start),
                    formatDate(i.Finish),
                    formatDate(i.ActualFinish),
                    csv(i.Description),
                    csv(i.jsonTable ?? i.JsonTable),
                    csv(i.EvidenceOfCompletion),
                    csv(i.Barriers),
                    i.Effort ?? "",
                    csv(i.ActionableStatus),
                    csv(i.WBS),
                    csv(i.Checklist),
                    csv(i.Notes),
                    csv(i.Evidence),
                    csv(i.Approvals),
                ].join(",");
            })
        ];

        return new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    }

    private _buildProjectReportJsonBlob(project: IProjectCatalogItem | undefined, items: any[]): Blob { // eslint-disable-line @typescript-eslint/no-explicit-any
        const parseArray = <T,>(value: unknown): T[] => {
            if (Array.isArray(value)) return value as T[];
            if (typeof value !== "string" || !value.trim()) return [];
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed as T[] : [];
            } catch {
                return [];
            }
        };

        const sortedItems = this._sortTaskItemsByWbs(items);

        const report = {
            generatedAt: new Date().toISOString(),
            project: project ?? null,
            tasks: sortedItems.map(item => ({
                id: item.Id,
                wbs: item.Title,
                gate: item.Gate,
                task: item.Task,
                deliverable: item.Deliverable,
                complete: item.Complete,
                start: item.Start,
                finish: item.Finish,
                actualFinish: item.ActualFinish,
                description: item.Description ?? "",
                jsonTable: item.jsonTable ?? item.JsonTable ?? "",
                evidenceOfCompletion: parseArray<{ fileName: string; fileUrl: string; isEvidenceOfCompletion?: boolean }>(item.Evidence)
                    .find(entry => entry.isEvidenceOfCompletion) ?? null,
                notes: parseArray(item.Notes),
                evidence: parseArray(item.Evidence),
                approvals: parseArray(item.Approvals),
                raw: item,
            })),
        };

        return new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    }

    private _buildProjectReportHtmlBlob(project: IProjectCatalogItem | undefined, items: any[]): Blob { // eslint-disable-line @typescript-eslint/no-explicit-any
        const parseArray = <T,>(value: unknown): T[] => {
            if (Array.isArray(value)) return value as T[];
            if (typeof value !== "string" || !value.trim()) return [];
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed as T[] : [];
            } catch {
                return [];
            }
        };

        const formatDate = (value: unknown, withTime = false): string => {
            if (!value) return "";
            const date = new Date(String(value));
            if (isNaN(date.getTime())) return "";
            const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            if (!withTime) return datePart;
            return `${datePart} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        };

        const html = (value: unknown): string =>
            String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");

        const link = (url?: string, label?: string): string =>
            url ? `<a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(label || url)}</a>` : "";

        const normalizedItems = this._sortTaskItemsByWbs(items);
        const gates = this._getGatesInWbsOrder(normalizedItems);
        const projectRows: Array<[string, unknown]> = [
            ["Title", project?.Title],
            ["Project Number", project?.ProjectNumber],
            ["Part Number", project?.PartNumber],
            ["Project Id", project?.ProjectId],
            ["Customer", project?.Customer],
            ["Units", project?.Units],
            ["Year", project?.Year],
            ["Team", project?.Team],
            ["Status", project?.Status],
            ["Project Details", project?.ProjectDetails],
        ];

        const taskSections = gates.map(gate => {
            const gateTasks = normalizedItems.filter(item => String(item.Gate || "No Gate") === gate);
            const rows = gateTasks.map(item => {
                const evidence = parseArray<{ fileName: string; fileUrl: string; isEvidenceOfCompletion?: boolean }>(item.Evidence)
                    .find(entry => entry.isEvidenceOfCompletion);
                return `
                  <tr>
                    <td>${html(item.Title)}</td>
                    <td>${html(item.Task)}</td>
                    <td>${html(item.Complete ?? "")}%</td>
                    <td>${html(formatDate(item.Start))}</td>
                    <td>${html(formatDate(item.ActualFinish))}</td>
                    <td>${evidence ? link(evidence.fileUrl, evidence.fileName) : ""}</td>
                  </tr>`;
            }).join("");

            return `
              <section>
                <h2>${html(gate)}</h2>
                <table>
                  <thead>
                    <tr><th>WBS</th><th>Task</th><th>Complete</th><th>Start</th><th>Actual Finish</th><th>Evidence</th></tr>
                  </thead>
                  <tbody>${rows || `<tr><td colspan="6">No tasks.</td></tr>`}</tbody>
                </table>
              </section>`;
        }).join("");

        const logSections = gates.map(gate => {
            const gateTasks = normalizedItems.filter(item => String(item.Gate || "No Gate") === gate);
            const notesRows = gateTasks.reduce<string[]>((rows, item) => {
                parseArray<{ date: string; user: string; note: string }>(item.Notes).forEach(entry => {
                    rows.push(`<tr><td>${html(formatDate(entry.date, true))}</td><td>${html(entry.user)}</td><td>${html(item.Title)}</td><td>${html(entry.note)}</td></tr>`);
                });
                return rows;
            }, []).join("");
            const evidenceRows = gateTasks.reduce<string[]>((rows, item) => {
                parseArray<{ date: string; user: string; fileName: string; fileUrl: string }>(item.Evidence).forEach(entry => {
                    rows.push(`<tr><td>${html(formatDate(entry.date, true))}</td><td>${html(entry.user)}</td><td>${html(item.Title)}</td><td>${link(entry.fileUrl, entry.fileName)}</td></tr>`);
                });
                return rows;
            }, []).join("");
            const approvalRows = gateTasks.reduce<string[]>((rows, item) => {
                parseArray<{ date: string; user: string; email: string; status: string; role?: string; comment?: string }>(item.Approvals).forEach(entry => {
                    rows.push(`<tr><td>${html(formatDate(entry.date, true))}</td><td>${html(entry.user || entry.email)}</td><td>${html(item.Title)}</td><td>${html(entry.status)}</td><td>${html(entry.comment)}</td></tr>`);
                });
                return rows;
            }, []).join("");

            return `
              <section>
                <h2>${html(gate)} Log</h2>
                <h3>Notes</h3>
                <table><thead><tr><th>Date</th><th>User</th><th>WBS</th><th>Note</th></tr></thead><tbody>${notesRows || `<tr><td colspan="4">No notes.</td></tr>`}</tbody></table>
                <h3>Evidence</h3>
                <table><thead><tr><th>Date</th><th>User</th><th>WBS</th><th>FileName</th></tr></thead><tbody>${evidenceRows || `<tr><td colspan="4">No evidence.</td></tr>`}</tbody></table>
                <h3>Approvals</h3>
                <table><thead><tr><th>Date</th><th>Approver</th><th>WBS</th><th>Status</th><th>Comment</th></tr></thead><tbody>${approvalRows || `<tr><td colspan="5">No approvals.</td></tr>`}</tbody></table>
              </section>`;
        }).join("");

        const document = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${html(project?.Title || "Project")} Archive Report</title>
  <style>
    body { margin: 32px; color: #1f2937; font-family: "Segoe UI", Arial, sans-serif; background: #f8fafc; }
    main { max-width: 1180px; margin: 0 auto; }
    header, section { margin-bottom: 28px; padding: 22px; background: #fff; border: 1px solid #dbe5f0; border-radius: 14px; box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06); }
    h1 { margin: 0 0 6px; color: #0f172a; font-size: 26px; }
    h2 { margin: 0 0 14px; color: #075985; font-size: 18px; }
    h3 { margin: 18px 0 8px; color: #334155; font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { color: #64748b; font-size: 12px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-top: 18px; }
    .summary div { padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
    .summary span { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 9px; color: #334155; background: #edf4fb; border: 1px solid #dbe5f0; }
    td { padding: 8px 9px; border: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #fbfdff; }
    a { color: #0369a1; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${html(project?.Title || "Project")} Archive Report</h1>
      <div class="meta">Generated ${html(formatDate(new Date().toISOString(), true))}</div>
      <div class="summary">
        ${projectRows.map(([label, value]) => `<div><span>${html(label)}</span>${html(value)}</div>`).join("")}
      </div>
    </header>
    ${taskSections}
    <section>
      <h2>Project Log</h2>
      <div class="meta">Grouped by Gate.</div>
    </section>
    ${logSections}
  </main>
</body>
</html>`;

        return new Blob([document], { type: "text/html;charset=utf-8" });
    }

    private async _importTasksFromExcel(listName: string, file: File, defaultGate?: string): Promise<void> {
        const XLSX = await import(/* webpackChunkName: "xlsx" */ "xlsx");
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true, cellText: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

        if (!rows.length) { alert("Excel plan is empty."); return; }

        const requiredCols = ["Gate", "Task", "Complete", "Finish"];
        const headers = Object.keys(rows[0]);
        const missing = requiredCols.filter(c => !headers.includes(c));
        if (missing.length > 0) {
            alert("Excel template missing required columns: " + missing.join(", ") + "\nPlease include at least: " + requiredCols.join(", "));
            return;
        }

        const list = this._sp.web.lists.getByTitle(listName);
        for (const row of rows) {
            const gate = row.Gate || defaultGate || "0. New Gate";
            const taskTitle = row.Task;
            if (!taskTitle) continue;

            const toIso = (v: any): string | undefined => {
                if (!v) return undefined;
                const d = new Date(v);
                return isNaN(d.getTime()) ? undefined : d.toISOString();
            };

            const complete = row.Complete !== undefined && row.Complete !== "" ? Number(row.Complete) || 0 : 0;
            if (complete < 0 || complete > 100) { console.warn("Skipping row: invalid Complete value", row); continue; }

            const nextWbs = await this._getNextWbsForGate(listName, gate);
            await list.items.add({
                Gate: gate, Task: taskTitle, Title: nextWbs,
                Deliverable: row.Deliverable || "",
                Complete: complete, Start: toIso(row.Start), Finish: toIso(row.Finish),
                ActualFinish: toIso(row.ActualFinish)
            });
        }

    }

    private async _getNextWbsForGate(listName: string, gate: string): Promise<string> {
        const existing = await this._sp.web.lists
            .getByTitle(listName)
            .items.select("Title", "Gate")
            .filter(`Gate eq '${gate.replace(/'/g, "''")}'`)();

        if (!existing.length) return "1";

        const titles = existing.map((e: any) => e.Title as string).filter(t => !!t);
        if (!titles.length) return "1";

        titles.sort(compareWbs);
        const last = titles[titles.length - 1];
        const parts = last.split(".");
        const lastNum = Number(parts[parts.length - 1]) || 0;
        parts[parts.length - 1] = String(lastNum + 1);
        return parts.join(".");
    }

    /** IMPORT: reads an Excel file and creates tasks in the given list */
    public async importProject(listName: string, file: File): Promise<string> {
        await this._importTasksFromExcel(listName, file);
        return listName;
    }

    /** REPLICATE */
    public async replicateProject(projectId: string): Promise<string> {
        const url = `${this.listItemsEndpoint}(${projectId})`;
        const resp = await this._context.spHttpClient.get(url, SPHttpClient.configurations.v1, { headers: { "Accept": "application/json;odata=nometadata" } });

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`replicateProject (read) failed: ${resp.status} - ${errorText}`);
        }

        const src = await resp.json();
        return this.createProject({ Title: `${src.Title} (Copy)`, Status: src.Status || "Active" });
    }

    private _enrichCatalogItem(raw: any): IProjectCatalogItem { // eslint-disable-line @typescript-eslint/no-explicit-any
        const item = raw as IProjectCatalogItem;
        const num = item.ProjectNumber ?? "";
        item.PartNumber = num && item.Title?.startsWith(`${num}-`)
            ? item.Title.slice(num.length + 1)
            : item.Title;
        item.Units = item.Units ?? 0;
        return item;
    }

    public async getProjectCatalog(listName: string = "ProjectCatalog"): Promise<IProjectCatalogItem[]> {
        const items = await this._sp.web.lists.getByTitle(listName)
            .items.select("Id","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer","Units")
            .top(5000)();
        return (items as IProjectCatalogItem[]).map(i => this._enrichCatalogItem(i));
    }

    public async getProjectByProjectId(projectId: string, listName: string = "ProjectCatalog"): Promise<IProjectCatalogItem | null> {
        const items = await this._sp.web.lists.getByTitle(listName)
            .items.select("Id","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer","Units")
            .filter(`ProjectId eq '${projectId.replace(/'/g, "''")}'`)();
        return items.length ? this._enrichCatalogItem(items[0]) : null;
    }

    public async getProjectsByYearAndStatus(year: number, status?: string, listName: string = "ProjectCatalog"): Promise<IProjectCatalogItem[]> {
        let filter = `Year eq ${year}`;
        if (status) filter += ` and Status eq '${status.replace(/'/g, "''")}'`;
        const items = await this._sp.web.lists.getByTitle(listName)
            .items.select("Id","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer","Units")
            .filter(filter)();
        return (items as IProjectCatalogItem[]).map(i => this._enrichCatalogItem(i));
    }

    public async getLastProjectFromCatalog(): Promise<{ ProjectNumber?: string } | null> {
        const items = await this._catalogSp.web.lists.getByTitle(this._catalogListName)
            .items.select("ID","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer")
            .orderBy("ProjectNumber", false).top(1)();
        if (!items.length) return null;
        const item = items[0] as any;
        return { ProjectNumber: item.ProjectNumber as string | undefined };
    }

    public async updateCatalogItem(title: string, patch: Partial<IProjectCatalogItem>): Promise<void> {
        const found = await this._catalogSp.web.lists.getByTitle(this._catalogListName)
            .items.select('Id').filter(`Title eq '${title.replace(/'/g, "''")}'`).top(1)();
        if (!found.length) throw new Error(`Catalog item not found: ${title}`);
        const id = (found[0] as any).Id as number; // eslint-disable-line @typescript-eslint/no-explicit-any
        await this._catalogSp.web.lists.getByTitle(this._catalogListName).items.getById(id).update(patch);
    }

    public async addProjectToCatalog(item: IProjectCatalogItem): Promise<string> {
        try {
            const res = await this._catalogSp.web.lists.getByTitle(this._catalogListName).items.add({
                Title: item.Title, ProjectNumber: item.ProjectNumber, ProjectId: item.ProjectId,
                Year: item.Year, Team: item.Team, Status: item.Status, Customer: item.Customer
            });
            const project = res?.[0];
            if (!project) return "";
            return res.data.Title || "" as string;
        } catch {
            console.error("[addProjectToCatalog] Error:", item.Title, "-", this._catalogListName);
            return "";
        }
    }
}
