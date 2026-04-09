import { useState, useEffect, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { resolveStorageVersion } from '../utils/StorageVersionResolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IProjectsCatalogState {
  projects: IProjectCatalogItem[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Loads the ED2-Projects catalog list only.
// Task data is loaded per-project inside each ProjectRowDashboard (via useProjectState).

export function useProjectsCatalog(sp: SPFI): IProjectsCatalogState {
  const [projects, setProjects] = useState<IProjectCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await sp.web.lists
        .getByTitle('ED2-Projects')
        .items.select('Id', 'Title', 'ProjectNumber', 'ProjectId', 'Year', 'Team', 'Status', 'Customer', 'BoardView', 'Units', 'ProjectDetails')
        .top(500)();

      const enriched = (items as IProjectCatalogItem[]).map(item => {
        const num = item.ProjectNumber ?? '';
        item.PartNumber = num && item.Title?.startsWith(`${num}-`)
          ? item.Title.slice(num.length + 1)
          : item.Title;
        item.Units = item.Units ?? 0;
        item.resolvedStorageVersion = resolveStorageVersion(item);
        return item;
      });
      setProjects(enriched);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(e.message ?? 'Failed to load projects catalog');
    } finally {
      setIsLoading(false);
    }
  }, [sp]);

  useEffect(() => { load(); }, [load]);

  return { projects, isLoading, error, reload: load };
}
