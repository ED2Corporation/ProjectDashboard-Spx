
export interface IProjectService {
    createProject(baseData: any): Promise<string>;          // returns the new project Id
    deleteProject(listName: string, projectTitle: string, evidenceFolderServerRelative?: string): Promise<void>;
    archiveProject(listName: string, evidenceFolderServerRelative: string, projectId?: string, projectMetadata?: IProjectCatalogItem): Promise<void>;
    exportProject(projectId: string): Promise<Blob>;        // or string with URL
    importProject(projectId: string, file: File): Promise<string>;             // returns the new project Id
    replicateProject(projectId: string): Promise<string>;   // Id of the replicated project
}

export interface IProjectCatalogItem {
    Title: string;
    ProjectNumber?: string;
    ProjectId?: string;
    Year?: number;
    Team?: string;
    Status?: string;
    Customer?: string;
    BoardView?: boolean;
    /** Part identifier extracted from Title after the first dash (e.g. "ED2-0030 Rev-B" from "1003028-ED2-0030 Rev-B") */
    PartNumber?: string;
    /** Number of units from PO — default 0 until sourced from SP */
    Units?: number;
    /** Raw JSON blob from ED2-Projects.ProjectDetails — may contain storageVersion and other metadata */
    ProjectDetails?: string;
    /** Resolved at catalog load time from ProjectDetails.storageVersion. Defaults to 'v1'. */
    resolvedStorageVersion?: 'v1' | 'v2';
}
