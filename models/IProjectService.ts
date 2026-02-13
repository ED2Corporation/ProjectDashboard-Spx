
export interface IProjectService {
    createProject(baseData: any): Promise<string>;          // devuelve Id o algo equivalente
    deleteProject(listName: string, projectId: string, evidenceFolderServerRelative?: string): Promise<void>;
    archiveProject(listName: string, evidenceFolderServerRelative: string, projectId?: string): Promise<void>;
    exportProject(projectId: string): Promise<Blob>;        // o string con URL
    importProject(projectId: string, file: File): Promise<string>;             // devuelve Id del nuevo proyecto
    replicateProject(projectId: string): Promise<string>;   // Id del proyecto replicado
}

export interface IProjectCatalogItem {
    Title: string;
    ProjectNumber?: string;
    ProjectId?: string;
    Year?: number;
    Team?: string;
    Status?: string;
    Customer?: string;
}