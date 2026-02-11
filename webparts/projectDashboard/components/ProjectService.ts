import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";
import { IProjectService } from "../../../models/IProjectService";

import { SPFI, spfi } from "@pnp/sp";
import { SPFx } from "@pnp/sp/presets/all";
import { compareWbs } from "./ParseWBS";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/fields";
import "@pnp/sp/views";

export class ProjectService implements IProjectService {
    private readonly _context: BaseComponentContext;
    private readonly _listName: string;

    private _sp: SPFI;

    constructor(contextOrSp: BaseComponentContext | SPFI, listName: string = "Projects") {
        if ((contextOrSp as any).pageContext) {
            // Caso 1: te pasan el context del WebPart
            this._context = contextOrSp as BaseComponentContext;
            this._listName = listName;
            this._sp = spfi().using(SPFx(this._context)); // inicializas PnP aquí
        } else {
            // Caso 2: te pasan directamente un SPFI ya configurado
            this._sp = contextOrSp as SPFI;
            this._listName = listName;
        }
    }

    private get webUrl(): string {
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
            Status: baseData.Status || "Active",
            // agrega más campos de tu modelo
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

    /** DELETE: Delete project by Id */
    public async deleteProject(
        projectId: string,
        evidenceFolderServerRelative?: string
    ): Promise<void> {
        console.log("[deleteProject] projectId: " + projectId);

        const listUrl = `${this.webUrl}/_api/web/lists/GetByTitle('${projectId}')`;

        const listResp = await this._context.spHttpClient.post(
            listUrl,
            SPHttpClient.configurations.v1,
            {
                headers: {
                    // SIN Accept
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

        console.log(
            "[deleteProject] evidenceFolderServerRelative: " + evidenceFolderServerRelative
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
                        // SIN Accept
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
    }

    /** ARCHIVE: marcar proyecto como archivado (ej. columna Status = Archived) */
    public async archiveProject(
        listTitle: string,
        evidenceFolderServerRelative: string,
        projectItemId?: number // si además marcas el master como Archived
    ): Promise<void> {
        console.log("[archiveProject] listTitle:", listTitle);

        // // (Opcional) marcar proyecto como Archived en la lista maestra
        // if (projectItemId != null) {
        //     await this._markProjectAsArchived(projectItemId);
        // }

        // 1. Obtener el CSV como Blob reutilizando exportProject
        const csvBlob = await this.exportProject(listTitle);
        console.log("[archiveProject] exportProject file:", csvBlob.size);

        // 2. Subir el CSV a la carpeta Archive del repo
        const reportFolder = `${evidenceFolderServerRelative}`;
        const timeStamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${listTitle}-${timeStamp}-Archived.csv`;

        await this._uploadBlobToReportFolder(reportFolder, fileName, csvBlob);
        console.log("[archiveProject] exportProject:", csvBlob.size);

        // 3. Borrar la lista, manteniendo el repo
        await this.deleteProject(listTitle);
        console.log("[archiveProject] List deleted :", listTitle);
    }

    private async _uploadBlobToReportFolder(
        reportFolderServerRelativeUrl: string,
        fileName: string,
        blob: Blob
    ): Promise<void> {
        console.log("[_uploadBlobToReportFolder] reportFolderServerRelativeUrl:", reportFolderServerRelativeUrl);
        const url = `${this.webUrl}/_api/web/GetFolderByServerRelativeUrl('${encodeURI(
            reportFolderServerRelativeUrl
        ).replace(/'/g, "''")}')/Files/add(overwrite=true, url='${fileName}')`;

        const resp = await this._context.spHttpClient.post(
            url,
            SPHttpClient.configurations.v1,
            {
                body: blob
            }
        );

        if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`uploadBlobToReportFolder failed: ${resp.status} - ${t}`);
        }
    }

    /** EXPORT: puedes devolver un Blob con JSON de todo el proyecto */
    public async exportProject(projectId: string): Promise<Blob> {
        console.log("[exportProject] projectId: " + projectId);

        const url = `${this.webUrl}/_api/web/lists/getbytitle('${projectId}')/items?$top=5000`;

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

        // muy simple: CSV con columnas clave
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

            // calcular WBS para este gate antes de crear
            const nextWbs = await this._getNextWbsForGate(listName, gate);

            await list.items.add({
                Gate: gate,
                Task: taskTitle,
                Title: nextWbs,                       // 👈 WBS importado
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
        //alert(`Excel import finished.\nRows created: ${created}`);
    }

    private async _getNextWbsForGate(
        listTitle: string,
        gate: string
    ): Promise<string> {
        const existing = await this._sp.web.lists
            .getByTitle(listTitle)
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

    /** IMPORT: leer un archivo (ej. JSON) y crear un nuevo proyecto */
    public async importProject(listName: string, file: File): Promise<string> {
        console.log("[importProject] projectId: " + file.name);

        await this._importTasksFromExcel(listName, file);
        return listName;
    }

    /** REPLICATE: copiar campos del proyecto origen a uno nuevo */
    public async replicateProject(projectId: string): Promise<string> {
        console.log("[replicateProject] projectId: " + projectId);
        // 1) leer proyecto origen
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

        // 2) construir datos base del nuevo proyecto (puedes cambiar el título, agregar sufijo, etc.)
        const baseData = {
            Title: `${src.Title} (Copy)`,
            Status: src.Status || "Active",
            // copiar otros campos que quieras replicar
        };

        // 3) crear nuevo item
        return this.createProject(baseData);
    }
}
