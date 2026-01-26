import { SPHttpClient, ISPHttpClientOptions } from "@microsoft/sp-http";

export async function uploadEvidenceFile(
    spHttpClient: SPHttpClient,
    context: any,
    siteUrl: string,      // ej: "https://ed2corp.sharepoint.com/sites/ED2-Team"
    relativePath: string,   // ej: "Shared Documents/ProjectsEvidence/RF Cascade"
    folderPath: string,   // ej: "Shared Documents/ProjectsEvidence/RF Cascade"
    file: File
): Promise<{ fileUrl: string; fileName: string }> {
    const doUpload = async (): Promise<{ fileUrl: string; fileName: string }> => {
        const uploadUrl =
            `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${relativePath}${folderPath}')` +
            `/Files/add(url='${file.name}',overwrite=true)`;

        console.log(`uploadUrl: ${uploadUrl}`);

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
        return await doUpload();
    } catch (error: any) {
        console.error("Error in initial uploadEvidenceFile:", error);

        // Si es 404 por carpeta inexistente, crea el folder y reintenta
        const msg = String(error?.message || "");
        if (msg.includes("404") && msg.includes("DirectoryNotFoundException")) {
            console.log("Folder not found, ensuring folder path:", siteUrl, folderPath);
            await ensureFolder(spHttpClient, siteUrl, folderPath);
            // reintentar upload una vez
            return await doUpload();
        }

        throw error;
    }
}

async function ensureFolder(
    spHttpClient: SPHttpClient,
    siteUrl: string,      // "https://ed2corp.sharepoint.com/sites/ED2-Team"
    folderPath: string    // puede venir como "/sites/ED2-Team/Shared Documents/ProjectsEvidence/EvidenceRepository"
): Promise<void> {
    console.log("Ensure folder RAW:", siteUrl, folderPath);

    const webServerRelative = new URL(siteUrl).pathname; // "/sites/ED2-Team"

    let normalized = folderPath.trim();

    // Quita el prefijo del web si viene incluido
    if (normalized.startsWith(webServerRelative)) {
        normalized = normalized.substring(webServerRelative.length);
    }
    // Quita "/" inicial
    normalized = normalized.replace(/^\//, "");

    console.log("Ensure folder NORMALIZED:", normalized);
    if (!normalized) {
        throw new Error("ensureFolder: normalized folderPath is empty");
    }

    // Usamos rootFolder/folders/add para crear toda la ruta de golpe
    const addUrl = `${siteUrl}/_api/web/rootFolder/folders/add('${encodeURIComponent(normalized)}')`;
    console.log("Creating folder via:", addUrl);

    const res = await spHttpClient.post(
        addUrl,
        SPHttpClient.configurations.v1,
        {
            headers: {
                "Accept": "application/json;odata=nometadata",
                "Content-Type": "application/json;odata=nometadata"
            }
        }
    );

    if (!res.ok && res.status !== 409) {
        // 409 = ya existe → lo consideramos OK
        const txt = await res.text();
        throw new Error(`ensureFolder failed: ${res.status} - ${txt}`);
    }
}
