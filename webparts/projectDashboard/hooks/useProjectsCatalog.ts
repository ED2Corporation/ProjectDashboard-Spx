import { useState, useEffect, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { resolveStorageVersion, parseWorkOrder } from '../utils/StorageVersionResolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IProjectsCatalogState {
  projects: IProjectCatalogItem[];
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Loads the ED2-Projects catalog list only.
// Task data is loaded per-project inside each ProjectRowDashboard (via useProjectState).

export function useProjectsCatalog(sp: SPFI): IProjectsCatalogState {
  const [projects, setProjects] = useState<IProjectCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const items = await sp.web.lists
        .getByTitle('ED2-Projects')
        .items.select('Id', 'Title', 'ProjectNumber', 'ProjectId', 'Year', 'Team', 'Status', 'Customer', 'BoardView', 'Units', 'ProjectDetails')
        .top(500)();

      const enriched = (items as IProjectCatalogItem[]).map(item => {
        // PartNumber: prefer ProjectId (canonical SP field); fallback to Title extraction
        const num = item.ProjectNumber ?? '';
        const extractedFromTitle = num && item.Title?.startsWith(`${num}-`)
          ? item.Title.slice(num.length + 1)
          : item.Title;
        item.PartNumber = item.ProjectId?.trim() || extractedFromTitle;
        item.Units = item.Units ?? 0;
        item.resolvedStorageVersion = resolveStorageVersion(item);
        item.WorkOrder = parseWorkOrder(item);

        // sortOrder + releases + PO numbers: extracted from ProjectDetails JSON blob
        try {
          const details = item.ProjectDetails ? JSON.parse(item.ProjectDetails) : {};
          item.sortOrder        = typeof details.sortOrder === 'number' ? details.sortOrder : undefined;
          item.releases         = Array.isArray(details.releases) ? details.releases : undefined;
          item.poNumberCustomer = typeof details['PO-Number-Customer'] === 'string' && details['PO-Number-Customer'].trim()
            ? details['PO-Number-Customer'].trim() : undefined;
          item.poNumberED2      = typeof details['PO-Number-ED2'] === 'string' && details['PO-Number-ED2'].trim()
            ? details['PO-Number-ED2'].trim() : undefined;
        } catch {
          item.sortOrder        = undefined;
          item.releases         = undefined;
          item.poNumberCustomer = undefined;
          item.poNumberED2      = undefined;
        }

        return item;
      });
      setProjects(enriched);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(e.message ?? 'Failed to load projects catalog');
    } finally {
      setIsLoading(false);
    }
  }, [sp]);

  useEffect(() => { void load(); }, [load]);

  return { projects, isLoading, error, reload: load };
}
