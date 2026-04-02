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

export class ProjectService implements IProjectService {
    private readonly _context: BaseComponentContext;
    private readonly _listName: string;
    private readonly _catalogListName = "ED2-Projects";

    private _sp: SPFI;

    constructor(contextOrSp: BaseComponentContext | SPFI, listName: string = "Projects") {
        if ((contextOrSp as any).pageContext) {
            this._context = contextOrSp as BaseComponentContext;
            this._listName = listName;
            this._sp = spfi().using(SPFx(this._context));
        } else {
            this._sp = contextOrSp as SPFI;
            this._listName = listName;
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
        projectId: string,
        evidenceFolderServerRelative?: string
    ): Promise<void> {

        // 1) Delete the task list
        const listUrl = `${this.webUrl}/_api/web/lists/GetByTitle('${listName}')`;

        const listResp = await this._context.spHttpClient.post(
            listUrl,
            SPHttpClient.configurations.v1,
            {
                headers: {
                    "IF-MATCH": "*",
                    "X-HTTP-Method": "DELETE"
                }
            }
        );


        if (!listResp.ok && listResp.status !== 404) {
            const errorText = await listResp.text();
            throw new Error(`deleteProject (list) failed: ${listResp.status} - ${errorText}`);
        }

        // 2) Delete the evidence folder (if provided)
        if (evidenceFolderServerRelative) {
            const folderUrl = `${this.webUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURI(
                evidenceFolderServerRelative
            ).replace(/'/g, "''")}')`;

            const folderResp = await this._context.spHttpClient.post(
                folderUrl,
                SPHttpClient.configurations.v1,
                { headers: { "IF-MATCH": "*", "X-HTTP-Method": "DELETE" } }
            );

            if (!folderResp.ok && folderResp.status !== 404) {
                const errorText = await folderResp.text();
                throw new Error(`deleteProject (evidence folder) failed: ${folderResp.status} - ${errorText}`);
            }
        }

        // 3) Delete the catalog entry (ED2-Projects) by ProjectId
        const getItemUrl =
            `${this.webUrl}/_api/web/lists/GetByTitle('${this._catalogListName}')/items` +
            `?$select=Id,ProjectId&$filter=ProjectId eq '${projectId.replace(/'/g, "''")}'`;

        const getResp = await this._context.spHttpClient.get(getItemUrl, SPHttpClient.configurations.v1);

        if (!getResp.ok) {
            const err = await getResp.text();
            throw new Error(`deleteProject (catalog lookup) failed: ${getResp.status} - ${err}`);
        }

        const data = await getResp.json();
        const item = (data.value && data.value[0]) || null;

        if (item && item.Id) {
            const itemId = item.Id as number;
            const deleteItemUrl = `${this.webUrl}/_api/web/lists/GetByTitle('${this._catalogListName}')/items(${itemId})`;

            const deleteResp = await this._context.spHttpClient.post(
                deleteItemUrl,
                SPHttpClient.configurations.v1,
                { headers: { "IF-MATCH": "*", "X-HTTP-Method": "DELETE" } }
            );

            if (!deleteResp.ok && deleteResp.status !== 404) {
                const errorText = await deleteResp.text();
                throw new Error(`deleteProject (catalog item) failed: ${deleteResp.status} - ${errorText}`);
            }
        }
    }

    /** ARCHIVE: exports the list as CSV, uploads it to the evidence folder, then deletes the list */
    public async archiveProject(
        listName: string,
        evidenceFolderServerRelative: string,
        projectId?: string
    ): Promise<void> {

        const csvBlob = await this.exportProject(listName);
        const reportFolder = `${evidenceFolderServerRelative}`;
        const timeStamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${listName}-${timeStamp}-Archived.csv`;

        await this._uploadBlobToReportFolder(reportFolder, fileName, csvBlob);
        await this.deleteProject(listName, projectId ?? "", undefined);
    }

    private async _uploadBlobToReportFolder(
        reportFolderServerRelativeUrl: string,
        fileName: string,
        blob: Blob
    ): Promise<void> {
        const url = `${this.webUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURI(
            reportFolderServerRelativeUrl
        ).replace(/'/g, "''")}')/Files/add(overwrite=true, url='${fileName}')`;

        const resp = await this._context.spHttpClient.post(url, SPHttpClient.configurations.v1, { body: blob });

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`uploadBlobToReportFolder failed: ${resp.status} - ${t}`);
        }
    }

    /** EXPORT: returns a CSV Blob for the given task list */
    public async exportProject(listName: string): Promise<Blob> {
        const url = `${this.webUrl}/_api/web/lists/getbytitle('${listName}')/items?$top=5000`;
        const resp = await this._context.spHttpClient.get(url, SPHttpClient.configurations.v1);

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`exportProject failed: ${resp.status} - ${errorText}`);
        }

        const data = await resp.json();
        const items = data.value as any[];

        const headers = ["Id","Title","Gate","Task","Deliverable","Complete","Start","Finish","ActualFinish"];

        const formatDate = (value: any): string => {
            if (!value) return "";
            const d = new Date(value);
            if (isNaN(d.getTime())) return "";
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };

        const lines = [
            headers.join(","),
            ...items.map(i => {
                return [
                    i.Id,
                    JSON.stringify(i.Title || ""),
                    JSON.stringify(i.Gate || ""),
                    JSON.stringify(i.Task || ""),
                    JSON.stringify(i.Deliverable || ""),
                    i.Complete ?? "",
                    formatDate(i.Start),
                    formatDate(i.Finish),
                    formatDate(i.ActualFinish),
                ].join(",");
            })
        ];

        return new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    }

    private async _importTasksFromExcel(listName: string, file: File, defaultGate?: string): Promise<void> {
        const XLSX = await import("xlsx");
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

    public async getProjectCatalog(listName: string = "ProjectCatalog"): Promise<IProjectCatalogItem[]> {
        const items = await this._sp.web.lists.getByTitle(listName)
            .items.select("Id","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer")
            .top(5000)();
        return items as IProjectCatalogItem[];
    }

    public async getProjectByProjectId(projectId: string, listName: string = "ProjectCatalog"): Promise<IProjectCatalogItem | null> {
        const items = await this._sp.web.lists.getByTitle(listName)
            .items.select("Id","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer")
            .filter(`ProjectId eq '${projectId.replace(/'/g, "''")}'`)();
        return items.length ? items[0] as IProjectCatalogItem : null;
    }

    public async getProjectsByYearAndStatus(year: number, status?: string, listName: string = "ProjectCatalog"): Promise<IProjectCatalogItem[]> {
        let filter = `Year eq ${year}`;
        if (status) filter += ` and Status eq '${status.replace(/'/g, "''")}'`;
        const items = await this._sp.web.lists.getByTitle(listName)
            .items.select("Id","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer")
            .filter(filter)();
        return items as IProjectCatalogItem[];
    }

    public async getLastProjectFromCatalog(): Promise<{ ProjectNumber?: string } | null> {
        const items = await this._sp.web.lists.getByTitle(this._catalogListName)
            .items.select("ID","Title","ProjectNumber","ProjectId","Year","Team","Status","Customer")
            .orderBy("ProjectNumber", false).top(1)();
        if (!items.length) return null;
        const item = items[0] as any;
        return { ProjectNumber: item.ProjectNumber as string | undefined };
    }

    public async updateCatalogItem(projectId: string, patch: Partial<IProjectCatalogItem>): Promise<void> {
        const found = await this._sp.web.lists.getByTitle(this._catalogListName)
            .items.select('Id').filter(`ProjectId eq '${projectId.replace(/'/g, "''")}'`).top(1)();
        if (!found.length) throw new Error(`Catalog item not found: ${projectId}`);
        const id = (found[0] as any).Id as number; // eslint-disable-line @typescript-eslint/no-explicit-any
        await this._sp.web.lists.getByTitle(this._catalogListName).items.getById(id).update(patch);
    }

    public async addProjectToCatalog(item: IProjectCatalogItem): Promise<string> {
        try {
            const res = await this._sp.web.lists.getByTitle(this._catalogListName).items.add({
                Title: item.Title, ProjectNumber: item.ProjectNumber, ProjectId: item.ProjectId,
                Year: item.Year, Team: item.Team, Status: item.Status, Customer: item.Customer
            });
            const project = res?.[0];
            if (!project) return "";
            return res.data.Title || "" as string;
        } catch (error) {
            console.error("[addProjectToCatalog] Error:", item.Title, "-", this._catalogListName);
            return "";
        }
    }
}
