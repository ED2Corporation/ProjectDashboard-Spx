import { SPHttpClient, ISPHttpClientOptions } from "@microsoft/sp-http";

export async function uploadEvidenceFile(
    spHttpClient: SPHttpClient,
    context: any,
    siteUrl: string,        // siteUrl : https://ed2corp.sharepoint.com/ 
    relativePath: string,   // siteRelativePath : / 
    folderPath: string,     // /Shared Documents/ProjectsEvidence/
    folderName: string,     // EvidenceRepository
    file: File              // file : ProjectDashboardAll.png 
): Promise<{ fileUrl: string; fileName: string }> {
    const doUpload = async (): Promise<{ fileUrl: string; fileName: string }> => {
        const uploadUrl =
            `${siteUrl + relativePath}/_api/web/GetFolderByServerRelativeUrl('${relativePath + folderPath + folderName}')` +
            `/Files/add(url='${file.name}',overwrite=true)`;

        console.log(`DoUpload uploadUrl: ${uploadUrl}`);

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
            console.log("Folder not found, ensuring folder path:", siteUrl + relativePath + folderPath + folderName);
            await ensureFolder(spHttpClient, siteUrl, relativePath, folderPath, folderName);
            console.log(`DoUpload 2nd Attempt...`);
            // reintentar upload una vez
            return await doUpload();
        }

        throw error;
    }
}

export async function ensureFolder(
    spHttpClient: SPHttpClient,
    siteUrl: string,        // siteUrl : https://ed2corp.sharepoint.com/ 
    relativePath: string,   // siteRelativePath : / 
    folderPath: string,     // /Shared Documents/ProjectsEvidence/
    folderName: string,     // EvidenceRepository
): Promise<void> {
    console.log("Ensure folder RAW:", siteUrl + relativePath + folderPath + folderName);

    try {
        // Normalize web URL (no trailing slash)
        const webUrl = `${siteUrl.replace(/\/+$/, "")}${relativePath.replace(/\/+$/, "")}`;

        // Server-relative URL of the **parent folder**, no trailing slash
        const parentFolderServerRelative =
            `${relativePath.replace(/\/+$/, "")}${folderPath}`.replace(/\/+$/, "");

        // Escape single quotes for safety in OData
        const safeParent = parentFolderServerRelative.replace(/'/g, "''");
        const safeFolderName = folderName.replace(/'/g, "''");

        const addUrl =
            `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${safeParent}')/folders/add(url='${safeFolderName}')`;

        console.log("Creating folder via:", addUrl);

        const res = await spHttpClient.post(
            addUrl,
            SPHttpClient.configurations.v1,
            {
                headers: {
                    "Accept": "application/json;odata=verbose"
                }
            }
        );

        if (!res.ok && res.status !== 409) {
            // 409 = ya existe → lo consideramos OK
            const txt = await res.text();
            throw new Error(`ensureFolder failed: ${res.status} - ${txt}`);
        }
    } catch (err) {
        console.error("[ensureFolder] Error :", err);
        //throw err;
    }
}
