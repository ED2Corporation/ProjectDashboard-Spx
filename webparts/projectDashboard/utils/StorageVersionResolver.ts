import { IProjectCatalogItem } from '../../../models/IProjectService';

const TENANT_ROOT = 'https://ed2corp.sharepoint.com';

export const STORAGE_CONFIG = {
  v1: {
    siteRelPath: '/sites/ED2-Team',
    evidenceLibrary: 'ProjectsEvidence',
    evidenceBasePath: undefined as string | undefined,
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

export function buildListName(title: string): string {
  return `${title}-List`;
}

export function buildRepoName(title: string): string {
  return `${title}-Evidence`;
}

export interface StorageEndpoint {
  siteUrl: string;
  siteRelPath: string;
  evidenceLibrary: string;
  evidenceBasePath?: string;
}

function parseProjectDetails(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'string') return undefined;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function resolveEnvironmentFromPath(value: string): 'staging' | 'production' {
  const normalized = value.toLowerCase();
  return normalized.includes('/sites/ed2-team') ? 'staging' : 'production';
}

export function resolveStorageVersion(project: IProjectCatalogItem): 'v1' | 'v2' {
  const details = parseProjectDetails(project.ProjectDetails);
  return details?.storageVersion === 'v2' ? 'v2' : 'v1';
}

export function parseWorkOrder(project: IProjectCatalogItem): string | null {
  const details = parseProjectDetails(project.ProjectDetails);
  const wo = details?.WorkOrder;
  return typeof wo === 'string' && wo.trim() ? wo.trim() : null;
}

export function getStorageEndpoint(
  version: 'v1' | 'v2',
  fallbackRelPath: string
): StorageEndpoint {
  if (version === 'v2') {
    const env = resolveEnvironmentFromPath(fallbackRelPath);
    const config = STORAGE_CONFIG.v2[env];

    return {
      siteUrl: TENANT_ROOT,
      siteRelPath: config.siteRelPath,
      evidenceLibrary: config.evidenceLibrary,
      evidenceBasePath: config.evidenceBasePath,
    };
  }

  return {
    siteUrl: TENANT_ROOT,
    siteRelPath: fallbackRelPath,
    evidenceLibrary: STORAGE_CONFIG.v1.evidenceLibrary,
    evidenceBasePath: STORAGE_CONFIG.v1.evidenceBasePath,
  };
}

export function getProjectWebUrl(version: 'v1' | 'v2', fallbackWebUrl: string): string {
  if (version !== 'v2') return fallbackWebUrl;

  const env = resolveEnvironmentFromPath(fallbackWebUrl);
  return `${TENANT_ROOT}${STORAGE_CONFIG.v2[env].siteRelPath}`;
}
