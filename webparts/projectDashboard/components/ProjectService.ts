import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from "@microsoft/sp-http";
import { IProjectService } from "../../../models/IProjectService";

export class ProjectService implements IProjectService {
    private readonly _context: BaseComponentContext;
    private readonly _listName: string;

    constructor(context: BaseComponentContext, listName: string = "Projects") {
        this._context = context;
        this._listName = listName;
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
        evidenceFolderServerRelative: string
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
    public async archiveProject(projectId: string): Promise<void> {
        console.log("[archiveProject] projectId: " + projectId);

        const url = `${this.listItemsEndpoint}(${projectId})`;
        const body = {
            __metadata: { type: `SP.Data.${this._listName.replace(/\s/g, "_x0020_")}ListItem` },
            Status: "Archived"
        };

        const resp = await this._context.spHttpClient.post(
            url,
            SPHttpClient.configurations.v1,
            {
                headers: {
                    "Accept": "application/json;odata=nometadata",
                    "Content-Type": "application/json;odata=verbose",
                    "IF-MATCH": "*",
                    "X-HTTP-Method": "MERGE"
                },
                body: JSON.stringify(body)
            }
        );

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`archiveProject failed: ${resp.status} - ${errorText}`);
        }
    }

    /** EXPORT: puedes devolver un Blob con JSON de todo el proyecto */
    public async exportProject(projectId: string): Promise<Blob> {
        console.log("[exportProject] projectId: " + projectId);
        const testUrl = this._context.pageContext.web.absoluteUrl.replace(/\/+$/, "");
        console.log("[exportProject] testUrl: " + testUrl);

        const url = `${this.webUrl}/_api/web/lists/getbytitle('${projectId}')/items?$top=5000`;

        console.log("[exportProject] url: " + url);

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
        console.log("[exportProject] data: " + data);

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
        return new Blob([csv], { type: "text/csv;charset=utf-8" });
    }


    /** IMPORT: leer un archivo (ej. JSON) y crear un nuevo proyecto */
    public async importProject(file: File): Promise<string> {
        console.log("[importProject] projectId: " + file.name);
        const text = await file.text();
        const parsed = JSON.parse(text);

        // mapear campos del JSON al modelo de la lista
        const baseData = {
            Title: parsed.Title,
            Status: parsed.Status || "Imported"
            // otros campos…
        };

        return this.createProject(baseData);
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
