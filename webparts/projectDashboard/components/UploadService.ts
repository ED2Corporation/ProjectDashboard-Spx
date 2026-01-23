import { SPHttpClient, ISPHttpClientOptions } from "@microsoft/sp-http";
//import { spfi, SPFx } from "@pnp/sp";

export async function uploadEvidenceFile(
    spHttpClient: SPHttpClient,
    context: any,  // Pasa this.context del web part
    siteUrl: string,
    folderPath: string,
    file: File
): Promise<{ fileUrl: string; fileName: string }> {
    try {
        const uploadUrl = `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${folderPath}')/Files/add(url='${file.name}',overwrite=true)`;
        console.log(`uploadUrl: ${uploadUrl}`);

        const opts: ISPHttpClientOptions = {
            headers: {
                "Content-Type": "application/octet-stream",
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
    } catch (error) {
        console.error("Error in uploadEvidenceFile:", error);
        throw error;
    }

}
