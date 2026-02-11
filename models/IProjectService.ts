
export interface IProjectService {
    createProject(baseData: any): Promise<string>;          // devuelve Id o algo equivalente
    deleteProject(projectId: string, evidenceFolderServerRelative: string): Promise<void>;
    archiveProject(projectId: string): Promise<void>;
    exportProject(projectId: string): Promise<Blob>;        // o string con URL
    importProject(file: File): Promise<string>;             // devuelve Id del nuevo proyecto
    replicateProject(projectId: string): Promise<string>;   // Id del proyecto replicado
}
