import { useState, useEffect, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { ITaskListItem, IGateListItem } from '../../../models';
import { GroupByGate } from '../utils/GroupByGate';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IProjectWithData {
  project: IProjectCatalogItem;
  tasks: ITaskListItem[];
  gates: IGateListItem[];
  loadError?: string;
}

export interface IProjectsCatalogState {
  projects: IProjectCatalogItem[];
  projectData: Record<string, IProjectWithData>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectsCatalog(sp: SPFI): IProjectsCatalogState {
  const [projects, setProjects]       = useState<IProjectCatalogItem[]>([]);
  const [projectData, setProjectData] = useState<Record<string, IProjectWithData>>({});
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1) Load the project catalog
      const items = await sp.web.lists
        .getByTitle('ED2-Projects')
        .items.select('Id', 'Title', 'ProjectNumber', 'ProjectId', 'Year', 'Team', 'Status', 'Customer', 'BoardView')
        .top(500)();

      const catalog = items as IProjectCatalogItem[];
      setProjects(catalog);

      // 2) Load tasks for every project in parallel (list name = ProjectId)
      const dataMap: Record<string, IProjectWithData> = {};

      await Promise.all(
        catalog.map(async (proj) => {
          const key = proj.ProjectId ?? proj.Title;
          if (!key) return;
          try {
            const tasks = await sp.web.lists
              .getByTitle(key)
              .items.select('Id', 'Title', 'Gate', 'Task', 'Complete', 'Start', 'Finish', 'ActualFinish', 'Effort')
              .top(5000)() as ITaskListItem[];

            const gates = GroupByGate(tasks);
            dataMap[key] = { project: proj, tasks, gates };
          } catch {
            // List not created yet — show empty bars
            dataMap[key] = { project: proj, tasks: [], gates: [], loadError: 'No task list found' };
          }
        })
      );

      setProjectData(dataMap);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(e.message ?? 'Failed to load projects catalog');
    } finally {
      setIsLoading(false);
    }
  }, [sp]);

  useEffect(() => { load(); }, [load]);

  return { projects, projectData, isLoading, error, reload: load };
}
