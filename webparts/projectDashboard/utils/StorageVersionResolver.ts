import { IProjectCatalogItem } from '../../../models/IProjectService';

// ─── Constants ────────────────────────────────────────────────────────────────
const TENANT_ROOT = 'https://ed2corp.sharepoint.com';

export const STORAGE_CONFIG = {
  v1: {
    siteRelPath:     '/sites/ED2-Team',   // overridden at runtime by context.pageContext.web.serverRelativeUrl
    evidenceLibrary: 'ProjectsEvidence',
    evidenceBasePath: null as null,        // null → let UploadService compute via isRootSite logic
  },
  v2: {
    staging: {
      siteRelPath: '/sites/ED2-Team/WO-Plans',
      evidenceLibrary: 'WODocs',
      evidenceBasePath: '/sites/ED2-Team/WO-Plans/WODocs',
    },
    production: {
      siteRelPath: '/WO-Plans',
      evidenceLibrary: 'WODocs',
      evidenceBasePath: '/WO-Plans/WODocs',
    },
  },
} as const;

/** Builds the task-list name for a project — same convention for v1 and v2. */
export function buildListName(title: string): string {
  return `${title}-List`;
}

/** Builds the evidence folder name for a project — same convention for v1 and v2. */
export function buildRepoName(title: string): string {
  return `${title}-Evidence`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StorageEndpoint {
  /** Tenant root URL — always https://ed2corp.sharepoint.com */
  siteUrl: string;
  /** Server-relative path of the target web */
  siteRelPath: string;
  /** Document library name for evidence files */
  evidenceLibrary: string;
  /**
   * When set, overrides isRootSite path logic in UploadService.
   * null = use default v1 logic.
   */
  evidenceBasePath: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseProjectDetails(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return null; }
}

function resolveEnvironmentFromPath(value: string): 'staging' | 'production' {
  const normalized = (value || '').toLowerCase();
  return normalized.includes('/sites/ed2-team') ? 'staging' : 'production';
}

export function resolveStorageVersion(project: IProjectCatalogItem): 'v1' | 'v2' {
  const details = parseProjectDetails(project.ProjectDetails);
  return details?.storageVersion === 'v2' ? 'v2' : 'v1';
}

/** Returns the WorkOrder string from ProjectDetails, or null if absent/empty. */
export function parseWorkOrder(project: IProjectCatalogItem): string | null {
  const details = parseProjectDetails(project.ProjectDetails);
  const wo = details?.WorkOrder;
  return typeof wo === 'string' && wo.trim() ? wo.trim() : null;
}

/**
 * Returns the fully resolved StorageEndpoint for a project.
 * @param version         Resolved storage version for this project.
 * @param fallbackRelPath context.pageContext.web.serverRelativeUrl — used as v1 siteRelPath.
 */
export function getStorageEndpoint(
  version: 'v1' | 'v2',
  fallbackRelPath: string
): StorageEndpoint {
  if (version === 'v2') {
    const env = resolveEnvironmentFromPath(fallbackRelPath);
    const config = STORAGE_CONFIG.v2[env];
    return {
      siteUrl:          TENANT_ROOT,
      siteRelPath:      config.siteRelPath,
      evidenceLibrary:  config.evidenceLibrary,
      evidenceBasePath: config.evidenceBasePath,
    };
  }
  return {
    siteUrl:          TENANT_ROOT,
    siteRelPath:      fallbackRelPath,
    evidenceLibrary:  STORAGE_CONFIG.v1.evidenceLibrary,
    evidenceBasePath: STORAGE_CONFIG.v1.evidenceBasePath,
  };
}

/** Returns the absolute web URL for creating a storage-version-specific SPFI instance. */
export function getProjectWebUrl(version: 'v1' | 'v2', fallbackWebUrl: string): string {
  if (version !== 'v2') return fallbackWebUrl;
  const env = resolveEnvironmentFromPath(fallbackWebUrl);
  return `${TENANT_ROOT}${STORAGE_CONFIG.v2[env].siteRelPath}`;
}
