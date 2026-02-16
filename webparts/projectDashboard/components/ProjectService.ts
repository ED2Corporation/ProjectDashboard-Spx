import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";
import { IProjectService, IProjectCatalogItem } from "../../../models/IProjectService";

import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import { compareWbs } from "./ParseWBS";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/fields";
import "@pnp/sp/views";

export class ProjectService implements IProjectService {
    private readonly _context: BaseComponentContext;
    private readonly _listName: string;              // lista master si aplicara
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

    /** CREATE: Create new project (mínimo ejemplo) */
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

    /**
     * DELETE:
     * - listName: nombre de la lista de tareas del proyecto (SharePoint list)
     * - projectId: identificador lógico del proyecto en el catálogo (columna ProjectId)
     */
    public async deleteProject(
        listName: string,
        projectId: string,
        evidenceFolderServerRelative?: string
    ): Promise<void> {
        console.log("[deleteProject] listName:", listName, "projectId:", projectId);

        // 1) Eliminar la lista de tareas
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

        console.log("[deleteProject] list delete status:", listResp.status, listResp.ok);

        if (!listResp.ok && listResp.status !== 404) {
            const errorText = await listResp.text();
            throw new Error(
                `deleteProject (list) failed: ${listResp.status} - ${errorText}`
            );
        }

        // 2) Eliminar carpeta de evidencias (si aplica)
        console.log(
            "[deleteProject] evidenceFolderServerRelative:",
            evidenceFolderServerRelative
        );

        if (evidenceFolderServerRelative) {
            const folderUrl = `${this.webUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURI(
                evidenceFolderServerRelative
            ).replace(/'/g, "''")}')`;

            const folderResp = await this._context.spHttpClient.post(
                folderUrl,
                SPHttpClient.configurations.v1,
                {
                    headers: {
                        "IF-MATCH": "*",
                        "X-HTTP-Method": "DELETE"
                    }
                }
            );

            console.log(
                "[deleteProject] folder delete status:",
                folderResp.status,
                folderResp.ok
            );

            if (!folderResp.ok && folderResp.status !== 404) {
                const errorText = await folderResp.text();
                throw new Error(
                    `deleteProject (evidence folder) failed: ${folderResp.status} - ${errorText}`
                );
            }
        }

        // 3) Eliminar el registro del catálogo (ED2-Projects) por ProjectId
        const getItemUrl =
            `${this.webUrl}/_api/web/lists/GetByTitle('${this._catalogListName}')/items` +
            `?$select=Id,ProjectId&$filter=ProjectId eq '${projectId.replace(/'/g, "''")}'`;

        const getResp = await this._context.spHttpClient.get(
            getItemUrl,
            SPHttpClient.configurations.v1
        );

        if (!getResp.ok) {
            const err = await getResp.text();
            throw new Error(`deleteProject (catalog lookup) failed: ${getResp.status} - ${err}`);
        }

        const data = await getResp.json();
        const item = (data.value && data.value[0]) || null;

        if (item && item.Id) {
            const itemId = item.Id as number;

            const deleteItemUrl =
                `${this.webUrl}/_api/web/lists/GetByTitle('${this._catalogListName}')/items(${itemId})`;

            const deleteResp = await this._context.spHttpClient.post(
                deleteItemUrl,
                SPHttpClient.configurations.v1,
                {
                    headers: {
                        "IF-MATCH": "*",
                        "X-HTTP-Method": "DELETE"
                    }
                }
            );

            console.log(
                "[deleteProject] catalog item delete status:",
                deleteResp.status,
                deleteResp.ok
            );

            if (!deleteResp.ok && deleteResp.status !== 404) {
                const errorText = await deleteResp.text();
                throw new Error(
                    `deleteProject (catalog item) failed: ${deleteResp.status} - ${errorText}`
                );
            }
        } else {
            console.log("[deleteProject] No catalog item found for ProjectId:", projectId);
        }
    }

    /** ARCHIVE: exporta lista, sube CSV al repo y borra la lista */
    public async archiveProject(
        listName: string,
        evidenceFolderServerRelative: string,
        projectId?: string // si quieres pasarlo aquí por conveniencia
    ): Promise<void> {
        console.log("[archiveProject] listName:", listName);

        // 1) CSV de la lista
        const csvBlob = await this.exportProject(listName);
        console.log("[archiveProject] exportProject file:", csvBlob.size);

        // 2) Carpeta de destino (repo ya existente, p.ej. 1003003-XXX-Evidence[/Archive])
        const reportFolder = `${evidenceFolderServerRelative}`;
        const timeStamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${listName}-${timeStamp}-Archived.csv`;

        await this._uploadBlobToReportFolder(reportFolder, fileName, csvBlob);
        console.log("[archiveProject] CSV uploaded");

        // 3) Borrar solo la lista (no el repo ni el catálogo aquí, salvo que quieras)
        await this.deleteProject(listName, projectId ?? "", undefined);
        console.log("[archiveProject] List deleted:", listName);
    }

    private async _uploadBlobToReportFolder(
        reportFolderServerRelativeUrl: string,
        fileName: string,
        blob: Blob
    ): Promise<void> {
        console.log(
            "[_uploadBlobToReportFolder] reportFolderServerRelativeUrl:",
            reportFolderServerRelativeUrl
        );

        const url = `${this.webUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURI(
            reportFolderServerRelativeUrl
        ).replace(/'/g, "''")}')/Files/add(overwrite=true, url='${fileName}')`;

        const resp = await this._context.spHttpClient.post(
            url,
            SPHttpClient.configurations.v1,
            { body: blob }
        );

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`uploadBlobToReportFolder failed: ${resp.status} - ${t}`);
        }
    }

    /** EXPORT: devuelve Blob CSV de una lista de tareas */
    public async exportProject(listName: string): Promise<Blob> {
        console.log("[exportProject] listName:", listName);

        const url = `${this.webUrl}/_api/web/lists/getbytitle('${listName}')/items?$top=5000`;

        const resp = await this._context.spHttpClient.get(
            url,
            SPHttpClient.configurations.v1
        );

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`exportProject failed: ${resp.status} - ${errorText}`);
        }

        const data = await resp.json();
        const items = data.value as any[];

        const headers = [
            "Id",
            "Title",
            "Gate",
            "Task",
            "Deliverable",
            "Complete",
            "Start",
            "Finish",
            "ActualFinish",
            "Description",
            "EvidenceOfCompletion",
            "EvidenceDescription"
        ];

        const formatDate = (value: any): string => {
            if (!value) return "";
            const d = new Date(value);
            if (isNaN(d.getTime())) return "";
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
        };

        const lines = [
            headers.join(","),
            ...items.map(i => {
                const evidence = i.EvidenceOfCompletion || {};
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
                    JSON.stringify(i.Description || ""),
                    JSON.stringify(evidence.Url || ""),
                    JSON.stringify(evidence.Description || "")
                ].join(",");
            })
        ];

        const csv = lines.join("\r\n");
        console.log("[exportProject] Export completed...");

        return new Blob([csv], { type: "text/csv;charset=utf-8" });
    }

    private async _importTasksFromExcel(
        listName: string,
        file: File,
        defaultGate?: string
    ): Promise<void> {
        const XLSX = await import("xlsx");

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
            type: "array",
            cellDates: true,
            cellText: false
        });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
            defval: "",
            raw: false
        });

        if (!rows.length) {
            alert("Excel plan is empty.");
            return;
        }

        const requiredCols = ["Gate", "Task", "Complete", "Finish"];
        const headers = Object.keys(rows[0]);
        const missing = requiredCols.filter(c => !headers.includes(c));
        if (missing.length > 0) {
            alert(
                "Excel template missing required columns: " +
                missing.join(", ") +
                "\nPlease include at least: " +
                requiredCols.join(", ")
            );
            return;
        }

        const list = this._sp.web.lists.getByTitle(listName);

        let created = 0;
        for (const row of rows) {
            const gate = row.Gate || defaultGate || "0. New Gate";
            const taskTitle = row.Task;
            if (!taskTitle) continue;

            const deliverable = row.Deliverable || "";
            const description = row.Description || "";
            const complete =
                row.Complete !== undefined && row.Complete !== ""
                    ? Number(row.Complete) || 0
                    : 0;

            const toIso = (v: any): string | undefined => {
                if (!v) return undefined;
                const d = new Date(v);
                return isNaN(d.getTime()) ? undefined : d.toISOString();
            };

            const start = toIso(row.Start);
            const finish = toIso(row.Finish);
            const actualFinish = toIso(row.ActualFinish);
            const evidenceUrl = row.EvidenceOfCompletion || "";
            const evidenceDescription = row.EvidenceDescription || "";

            if (complete < 0 || complete > 100) {
                console.warn("Skipping row: invalid Complete value", complete, row);
                continue;
            }

            const nextWbs = await this._getNextWbsForGate(listName, gate);

            await list.items.add({
                Gate: gate,
                Task: taskTitle,
                Title: nextWbs,
                Deliverable: deliverable,
                Description: description,
                Complete: complete,
                Start: start,
                Finish: finish,
                ActualFinish: actualFinish,
                EvidenceOfCompletion: evidenceUrl || null,
                EvidenceDescription: evidenceDescription || null
            });

            created++;
        }

        console.log(`Excel import finished.\nRows created: ${created}`);
    }

    private async _getNextWbsForGate(
        listName: string,
        gate: string
    ): Promise<string> {
        const existing = await this._sp.web.lists
            .getByTitle(listName)
            .items.select("Title", "Gate")
            .filter(`Gate eq '${gate.replace(/'/g, "''")}'`)();

        if (!existing.length) {
            return "1";
        }

        const titles = existing
            .map((e: any) => e.Title as string)
            .filter(t => !!t);

        if (!titles.length) {
            return "1";
        }

        titles.sort(compareWbs);
        const last = titles[titles.length - 1];
        const parts = last.split(".");
        const lastNum = Number(parts[parts.length - 1]) || 0;
        parts[parts.length - 1] = String(lastNum + 1);
        return parts.join(".");
    }

    /** IMPORT: leer un Excel y crear tareas en una lista */
    public async importProject(listName: string, file: File): Promise<string> {
        console.log("[importProject] listName:", listName);
        await this._importTasksFromExcel(listName, file);
        return listName;
    }

    /** REPLICATE: copiar campos del proyecto origen a uno nuevo (catálogo master) */
    public async replicateProject(projectId: string): Promise<string> {
        console.log("[replicateProject] projectId:", projectId);

        const url = `${this.listItemsEndpoint}(${projectId})`;
        const resp = await this._context.spHttpClient.get(
            url,
            SPHttpClient.configurations.v1,
            {
                headers: {
                    "Accept": "application/json;odata=nometadata"
                }
            }
        );

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`replicateProject (read) failed: ${resp.status} - ${errorText}`);
        }

        const src = await resp.json();

        const baseData = {
            Title: `${src.Title} (Copy)`,
            Status: src.Status || "Active"
        };

        return this.createProject(baseData);
    }

    /** Obtener todos los proyectos del catálogo */
    public async getProjectCatalog(
        listName: string = "ProjectCatalog"
    ): Promise<IProjectCatalogItem[]> {
        const items = await this._sp.web.lists
            .getByTitle(listName)
            .items.select(
                "Id",
                "Title",
                "ProjectNumber",
                "ProjectId",
                "Year",
                "Team",
                "Status",
                "Customer"
            )
            .top(5000)();

        return items as IProjectCatalogItem[];
    }

    /** Obtener un proyecto del catálogo por ProjectId */
    public async getProjectByProjectId(
        projectId: string,
        listName: string = "ProjectCatalog"
    ): Promise<IProjectCatalogItem | null> {
        const items = await this._sp.web.lists
            .getByTitle(listName)
            .items.select(
                "Id",
                "Title",
                "ProjectNumber",
                "ProjectId",
                "Year",
                "Team",
                "Status",
                "Customer"
            )
            .filter(`ProjectId eq '${projectId.replace(/'/g, "''")}'`)();

        if (!items.length) {
            return null;
        }

        return items[0] as IProjectCatalogItem;
    }

    public async getProjectsByYearAndStatus(
        year: number,
        status?: string,
        listName: string = "ProjectCatalog"
    ): Promise<IProjectCatalogItem[]> {
        let filter = `Year eq ${year}`;
        if (status) {
            filter += ` and Status eq '${status.replace(/'/g, "''")}'`;
        }

        const items = await this._sp.web.lists
            .getByTitle(listName)
            .items.select(
                "Id",
                "Title",
                "ProjectNumber",
                "ProjectId",
                "Year",
                "Team",
                "Status",
                "Customer"
            )
            .filter(filter)();

        return items as IProjectCatalogItem[];
    }

    public async getLastProjectFromCatalog(): Promise<{ ProjectNumber?: string } | null> {
        console.log("[getLastProjectFromCatalog] projects from:", this._catalogListName);

        const items = await this._sp.web.lists
            .getByTitle(this._catalogListName)
            .items.select("ID", "Title", "ProjectNumber", "ProjectId", "Year", "Team", "Status", "Customer")
            .orderBy("ProjectNumber", false)
            .top(1)();

        if (!items.length) {
            return null;
        }
        console.log("[getLastProjectFromCatalog] items:", items.length);

        const item = items[0] as any;
        return {
            ProjectNumber: item.ProjectNumber as string | undefined
        };
    }

    public async addProjectToCatalog(item: IProjectCatalogItem): Promise<string> {
        try {
            const res = await this._sp.web.lists
                .getByTitle(this._catalogListName)
                .items.add({
                    Title: item.Title,
                    ProjectNumber: item.ProjectNumber,
                    ProjectId: item.ProjectId,
                    Year: item.Year,
                    Team: item.Team,
                    Status: item.Status,
                    Customer: item.Customer
                });

            const project = res?.[0];
            if (!project) {
                console.error("No items returned when adding project to catalog: ", item.Title, "-", this._catalogListName);
                return "";
            }

            return res.data.Title || "" as string;

        } catch (error) {
            console.error("[addProjectToCatalog] No items returned when adding project to catalog: ", item.Title, "-", this._catalogListName);
            return "";

        }
    }
}
