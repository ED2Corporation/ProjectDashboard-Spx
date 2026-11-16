
// ─── Lot (PO delivery lot — owned by PO-Inbounds, read-only here) ─────────────

export interface IProjectDetailsLot {
  lotNo: number;
  rowNumber: number;
  part: string;
  units: number;
  eta: string;
  taskId?: string;
}

// ─── Execution status (owned by WO-Dashboard) ─────────────────────────────────

export type ExecutionStatusValue = 'in-progress' | 'completed' | 'stalled' | 'delayed';

export interface IExecutionStatus {
  status: ExecutionStatusValue;
  overallPct: number;
  updatedAt: string;
}

// ─── Release record ───────────────────────────────────────────────────────────

export interface IReleaseRecord {
  /** Stable id — idempotent upsert key; never change once written */
  id: string;
  date: string;
  units: number;
  approvedBy: string;
  taskId: string;
  taskTitle: string;
  notes?: string;
  /** WBS of the LOT task at the time of release — informative, ignored by PO-Inbounds */
  wbs?: string;
  /** PO delivery lot number — links this release to ED2-Projects.lots[].lotNo */
  lotNo?: number;
  /** Set by PO-Inbounds when the release has been invoiced — never written by WO-Dashboard */
  isInvoiced?: boolean;
}

export interface IProjectService {
    createProject(baseData: Record<string, unknown>): Promise<string>;          // returns the new project Id
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
    /** Resolved at catalog load time from ProjectDetails.WorkOrder */
    WorkOrder?: string;
    /** Resolved at catalog load time from ProjectDetails.sortOrder — controls display order in catalog */
    sortOrder?: number;
    /** Resolved at catalog load time from ProjectDetails.releases */
    releases?: IReleaseRecord[];
    /** Resolved at catalog load time from ProjectDetails.poNumberCustomer */
    poNumberCustomer?: string;
    /** Resolved at catalog load time from ProjectDetails.poNumberED2 */
    poNumberED2?: string;
}
