import { SPHttpClient, ISPHttpClientOptions } from "@microsoft/sp-http";

export async function uploadEvidenceFile(
    spHttpClient: SPHttpClient,
    context: any,
    siteUrl: string,            // siteUrl : https://ed2corp.sharepoint.com/
    relativePath: string,       // siteRelativePath : /
    folderPath: string,         // /Shared Documents/ProjectsEvidence/
    folderName: string,         // EvidenceRepository
    file: File,                 // file : ProjectDashboardAll.png
    overrideBasePath?: string   // when set, bypasses isRootSite logic (e.g. '/WO-Plans/WODocs' for v2)
): Promise<{ fileUrl: string; fileName: string }> {
    const doUpload = async (): Promise<{ fileUrl: string; fileName: string }> => {

        /** Controling Main Page - Production envitronment Root directory */
        const isRootSite = relativePath === "/"; // true if at tenant root, false if in a site collection (e.g. /sites/ED2-Team)

        // overrideBasePath bypasses the isRootSite branching (used for v2 storage)
        const evidenceBasePath = overrideBasePath
            ? overrideBasePath
            : isRootSite
                ? `${relativePath}ED2 Repository Internal/Engineering/ProjectDashboard/${folderPath}`
                : `${relativePath}Shared Documents/${folderPath}`;

        // Normalize web URL (no trailing slash)
        let webUrl = `${siteUrl.replace(/\/+$/, "")}${relativePath.replace(/\/+$/, "")}`;

        // Server-relative URL of the **parent folder**, no trailing slash
        let parentFolderServerRelative = `${evidenceBasePath.replace(/\/+$/, "")}`;

        // Escape single quotes for safety in OData
        const safeParent = parentFolderServerRelative.replace(/'/g, "''");
        const safeFolderName = folderName.replace(/'/g, "''");

        const uploadUrl =
            `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${safeParent}/${safeFolderName}')` +
            `/Files/add(url='${file.name}',overwrite=true)`;

        const opts: ISPHttpClientOptions = {
            headers: {
                "Content-Type": "application/octet-stream"
            },
            body: file
        };

        const res = await spHttpClient.post(uploadUrl, SPHttpClient.configurations.v1, opts);

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Upload failed: ${res.status} - ${errorText}`);
        }

        const data = await res.json();
        const fileUrl = new URL(data.ServerRelativeUrl, siteUrl).toString();

        return { fileUrl, fileName: file.name };
    };

    try {
        // Primer intento
        console.log(`DoUpload 1st Attempt...`);
        return await doUpload();
    } catch (error: any) {
        console.error("Error in initial uploadEvidenceFile:", error);

        // Si es 404 por carpeta inexistente, crea el folder y reintenta
        const msg = String(error?.message || "");
        if (msg.includes("404") && msg.includes("DirectoryNotFoundException")) {
            await ensureFolder(spHttpClient, siteUrl, relativePath, folderPath, folderName, overrideBasePath);
            return await doUpload();
        }

        throw error;
    }
}

export async function ensureFolder(
    spHttpClient: SPHttpClient,
    siteUrl: string,            // siteUrl : https://ed2corp.sharepoint.com/
    relativePath: string,       // siteRelativePath : / || /sites/ED2-Team
    folderPath: string,         // /Shared Documents/ProjectsEvidence/
    folderName: string,         // EvidenceRepository
    overrideBasePath?: string   // when set, bypasses isRootSite logic (e.g. '/WO-Plans/WODocs' for v2)
): Promise<void> {
    try {

        /** Controling Main Page - Production envitronment Root directory */
        const isRootSite = relativePath === "/"; // true if at tenant root, false if in a site collection (e.g. /sites/ED2-Team)

        // overrideBasePath bypasses the isRootSite branching (used for v2 storage)
        const evidenceBasePath = overrideBasePath
            ? overrideBasePath
            : isRootSite
                ? `${relativePath}ED2 Repository Internal/Engineering/ProjectDashboard/${folderPath}`
                : `${relativePath}Shared Documents/${folderPath}`;

        // Normalize web URL (no trailing slash)
        let webUrl = `${siteUrl.replace(/\/+$/, "")}${relativePath.replace(/\/+$/, "")}`;

        // Server-relative URL of the **parent folder**, no trailing slash
        let parentFolderServerRelative = `${evidenceBasePath.replace(/\/+$/, "")}`;

        // Escape single quotes for safety in OData
        const safeParent = parentFolderServerRelative.replace(/'/g, "''");
        const safeFolderName = folderName.replace(/'/g, "''");

        const addUrl = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${safeParent}')/folders/add(url='${safeFolderName}')`;

        const res = await spHttpClient.post(
            addUrl,
            SPHttpClient.configurations.v1,
            {
                headers: {}
            }
        );

        if (!res.ok && res.status !== 409) {
            // 409 = already exists → treat as OK
            const txt = await res.text();
            throw new Error(`ensureFolder failed: ${res.status} - ${txt}`);
        }
    } catch (err) {
        console.error("[ensureFolder] Error :", err);
        //throw err;
    }
}

export function buildRepoRelativeUrl(
    siteRelativePath: string, // this.context.pageContext.web.serverRelativeUrl
    repositoryUrl: string,    // this._repositoryUrl, ej. "ProjectsEvidence/" o "/ProjectsEvidence/"
    //repositoryName: string    // folderName, ej. "NewProject-Evidence"
): string {
    const relativePath = siteRelativePath || "/";              // "/sites/ED2-Team" o "/"
    const folderPath = repositoryUrl || "/ProjectsEvidence/";  // normaliza
    //const folderName = repositoryName || "DefaultRepo";

    const isRootSite = relativePath === "/";

    // normalizar componentes (sin dobles barras)
    const cleanRelative = relativePath.replace(/\/+$/, "");        // "/sites/ED2-Team" o ""
    const cleanFolderPath = folderPath.replace(/^\/+/, "");        // "ProjectsEvidence/" o "Shared Documents/ProjectsEvidence/"
    //const cleanFolder = cleanFolderPath.replace(/\/+$/, "");       // "ProjectsEvidence"

    // Base path depending on root vs subsite
    const base = isRootSite
        ? `/ED2 Repository Internal/Engineering/ProjectDashboard/${cleanFolderPath}/` // producción root
        : `${cleanRelative}/Shared Documents/${cleanFolderPath}/`;                    // subsite (Teams)

    // final server-relative path for the project folder
    const serverRelative = `${base}`; // e.g. "/sites/ED2-Team/Shared Documents/ProjectsEvidence/NewProject-Evidence"
    //const serverRelative = `${base}/${folderName}`; // p.ej. "/sites/ED2-Team/Shared Documents/ProjectsEvidence/NewProject-Evidence"

    return serverRelative;
}
