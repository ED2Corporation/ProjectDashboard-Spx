import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import { BaseComponentContext } from '@microsoft/sp-component-base';
import { SPHttpClient } from '@microsoft/sp-http';

import { useProjectsCatalog } from '../hooks/useProjectsCatalog';
import ProjectRowDashboard from './ProjectRowDashboard';
import ProjectRowArchived from './ProjectRowArchived';
import UserManualPanel from './UserManualPanel';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import { ProjectService } from '../services/ProjectService';
import styles from './ProjectsCatalogCard.module.scss';

type StatusFilter = 'all' | 'ontime' | 'stalled' | 'delayed' | 'archived' | 'hidden' | 'waiting-approval';
type StatusKey = 'ontime' | 'stalled' | 'delayed' | 'archived' | 'waiting-approval';
type SortField = 'partNumber' | 'jobId';
type SortDir   = 'asc' | 'desc';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

type BadgeVariant = StatusKey | 'hidden' | 'stalled';
type CatalogStatus = 'open' | 'archived' | 'waiting-approval' | 'hidden';


interface AggregatorBadgeProps {
  label: string;
  count: number;
  variant: BadgeVariant;
  active: boolean;
  onClick: () => void;
}

const IconPlus: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M10 4v12" strokeLinecap="round" />
    <path d="M4 10h12" strokeLinecap="round" />
  </svg>
);

const IconRotateCw: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M16 10a6 6 0 10-1.76 4.24" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconUserManual: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M4 4.5A2.5 2.5 0 016.5 2H16v14H6.5A2.5 2.5 0 004 18.5v-14z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 4.5A2.5 2.5 0 016.5 7H16" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 10h5M8 12.5h4" strokeLinecap="round" />
  </svg>
);

const IconChevronUp: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M5 12l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconChevronDown: React.FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const variantClass: Record<BadgeVariant, string> = {
  ontime:            styles.badgeOntime,
  stalled:           styles.badgeStalled,
  delayed:           styles.badgeDelayed,
  archived:          styles.badgeNeutral,
  hidden:            styles.badgeNeutral,
  'waiting-approval': styles.badgeNeutral,
};

const normalizeStatus = (status?: string): string =>
  (status || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

const getCatalogStatus = (project: IProjectCatalogItem): CatalogStatus => {
  const normalizedStatus = normalizeStatus(project.Status);

  if (normalizedStatus === 'archived' || normalizedStatus === 'closed') return 'archived';
  if (normalizedStatus === 'waiting approval') return 'waiting-approval';
  if (normalizedStatus === 'hidden') return 'hidden';

  return 'open';
};

const getProjectStatusKey = (
  project: IProjectCatalogItem,
  statusMap: Record<string, StatusKey>
): StatusKey => {
  const catalogStatus = getCatalogStatus(project);

  if (catalogStatus === 'waiting-approval') return 'waiting-approval';
  if (catalogStatus === 'archived') return 'archived';

  return statusMap[project.Title] ?? 'ontime';
};

const AggregatorBadge: React.FC<AggregatorBadgeProps> = ({ label, count, variant, active, onClick }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`${styles.badge} ${variantClass[variant]} ${active ? styles.badgeActive : ''}`}
  >
    <span className={styles.badgeCount}>{count}</span>
    <span>{label}</span>
  </button>
);

export interface IProjectsCatalogCardProps {
  sp: SPFI;
  context: AnyContext;
  onSelectProject?: (project: IProjectCatalogItem) => void;
  onNewProject?: () => void;
}

const ProjectsCatalogCard: React.FC<IProjectsCatalogCardProps> = ({ sp, context, onSelectProject, onNewProject }) => {
  const { projects, isLoading, error, reload } = useProjectsCatalog(sp);

  const [isCollapsed, setIsCollapsed]   = useState(false);
  const [showManual, setShowManual]     = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusMap, setStatusMap]       = useState<Record<string, StatusKey>>({});
  const [searchText, setSearchText]     = useState('');
  const [sortField, setSortField]       = useState<SortField | null>(null);
  const [sortDir, setSortDir]           = useState<SortDir>('asc');
  const [isReordering, setIsReordering] = useState(false);

  const catalogService = useMemo(() => new ProjectService(sp), [sp]);

  const handleStatusReady = useCallback((projectId: string, key: "ontime" | "stalled" | "delayed" | "archived") => {
    setStatusMap((prev) => {
      if (prev[projectId] === key) return prev;
      return { ...prev, [projectId]: key };
    });
  }, []);

  const handleMove = useCallback(async (title: string, direction: 'first' | 'up' | 'down' | 'last') => {
    if (isReordering) return;
    setIsReordering(true);
    try {
      // Build the same base list the user currently sees, sorted by sortOrder
      let base: IProjectCatalogItem[];
      if (statusFilter === 'hidden')                base = projects.filter(p => getCatalogStatus(p) === 'hidden');
      else if (statusFilter === 'archived')          base = projects.filter(p => getCatalogStatus(p) === 'archived');
      else if (statusFilter === 'waiting-approval')  base = projects.filter(p => getCatalogStatus(p) === 'waiting-approval');
      else if (statusFilter === 'all')               base = projects.filter(p => getCatalogStatus(p) === 'open');
      else                                           base = projects.filter(p => getCatalogStatus(p) === 'open' && (statusMap[p.Title] ?? 'ontime') === statusFilter);

      const sorted = [...base].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
      const idx = sorted.findIndex(p => p.Title === title);
      if (idx === -1) return;

      // Bounds check
      if (direction === 'up'   && idx === 0)                  return;
      if (direction === 'down' && idx === sorted.length - 1)  return;
      if (direction === 'first' && idx === 0)                 return;
      if (direction === 'last'  && idx === sorted.length - 1) return;

      // Reorder in memory
      const reordered = [...sorted];
      const [moved] = reordered.splice(idx, 1);
      if (direction === 'first')     reordered.unshift(moved);
      else if (direction === 'last') reordered.push(moved);
      else if (direction === 'up')   reordered.splice(idx - 1, 0, moved);
      else                           reordered.splice(idx + 1, 0, moved);

      // Assign sequential sortOrders — only update items that changed
      const updates: Array<{ t: string; pd: string }> = [];
      reordered.forEach((p, i) => {
        const newOrder = i + 1;
        if (p.sortOrder !== newOrder) {
          const existing: Record<string, unknown> = p.ProjectDetails ? JSON.parse(p.ProjectDetails) : {};
          existing.sortOrder = newOrder;
          updates.push({ t: p.Title, pd: JSON.stringify(existing) });
        }
      });

      await Promise.all(updates.map(u => catalogService.updateCatalogItem(u.t, { ProjectDetails: u.pd })));
      reload();
    } catch (e) {
      console.error('[handleMove] Error reordering:', e);
    } finally {
      setIsReordering(false);
    }
  }, [isReordering, statusFilter, projects, statusMap, catalogService, reload]);

  const { openProjects, archivedProjects, waitingApprovalProjects, hiddenProjects } = useMemo(() => {
    const open = projects.filter((project) => getCatalogStatus(project) === 'open');
    const archived = projects.filter((project) => getCatalogStatus(project) === 'archived');
    const waitingApproval = projects.filter((project) => getCatalogStatus(project) === 'waiting-approval');
    const hidden = projects.filter((project) => getCatalogStatus(project) === 'hidden');

    return {
      openProjects: open,
      archivedProjects: archived,
      waitingApprovalProjects: waitingApproval,
      hiddenProjects: hidden,
    };
  }, [projects]);

  const counts = useMemo(() => {
    let onTime = 0, stalled = 0, delayed = 0;

    for (const project of openProjects) {
      const key = getProjectStatusKey(project, statusMap);
      if (key === 'delayed')      delayed++;
      else if (key === 'stalled') stalled++;
      else                        onTime++;
    }

    return {
      onTime, stalled, delayed,
      archived:        archivedProjects.length,
      waitingApproval: waitingApprovalProjects.length,
      hidden:          hiddenProjects.length,
    };
  }, [openProjects, archivedProjects.length, waitingApprovalProjects.length, hiddenProjects.length, statusMap]);

  const filteredProjects = useMemo(() => {
    // 1. Pick base list by status filter
    let base: IProjectCatalogItem[];
    if (statusFilter === 'hidden')           base = hiddenProjects;
    else if (statusFilter === 'archived')    base = archivedProjects;
    else if (statusFilter === 'waiting-approval') base = waitingApprovalProjects;
    else if (statusFilter === 'all')         base = openProjects;
    else base = openProjects.filter(p => getProjectStatusKey(p, statusMap) === statusFilter);

    // 2. Text search across PartNumber, ProjectId/JobId, Customer
    const q = searchText.trim().toLowerCase();
    if (q) {
      base = base.filter(p =>
        (p.PartNumber  ?? '').toLowerCase().includes(q) ||
        (p.ProjectId   ?? '').toLowerCase().includes(q) ||
        (p.ProjectNumber ?? '').toLowerCase().includes(q) ||
        (p.Customer    ?? '').toLowerCase().includes(q)
      );
    }

    // 3. Sort — column sort takes precedence; otherwise use persisted sortOrder
    if (sortField) {
      base = [...base].sort((a, b) => {
        const va = sortField === 'partNumber'
          ? (a.PartNumber ?? a.Title ?? '').toLowerCase()
          : (a.ProjectNumber ?? a.ProjectId ?? '').toLowerCase();
        const vb = sortField === 'partNumber'
          ? (b.PartNumber ?? b.Title ?? '').toLowerCase()
          : (b.ProjectNumber ?? b.ProjectId ?? '').toLowerCase();
        const cmp = va.localeCompare(vb);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    } else {
      base = [...base].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
    }

    return base;
  }, [archivedProjects, hiddenProjects, openProjects, waitingApprovalProjects, statusMap, statusFilter, searchText, sortField, sortDir]);

  const toggleFilter = (filter: StatusFilter): void => setStatusFilter(prev => prev === filter ? 'all' : filter);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  return (
    <>
    <div className={styles.card}>
      <div onClick={() => setIsCollapsed((current) => !current)} className={styles.header}>
        <span className={styles.headerTitle}>
          Work Orders
          <span className={styles.headerCount}>({openProjects.length})</span>
        </span>
        <div className={styles.headerActions}>
          {onNewProject && (
            <button
              type="button"
              className={styles.headerAddBtn}
              title="Create project"
              onClick={(e) => {
                e.stopPropagation();
                onNewProject();
              }}
            >
              <IconPlus />
            </button>
          )}
          <button
            type="button"
            className={styles.headerIconBtn}
            title="Reload projects"
            onClick={(e) => {
              e.stopPropagation();
              reload();
            }}
          >
            <IconRotateCw />
          </button>
          <button
            type="button"
            className={styles.headerIconBtn}
            title="Open user manual"
            onClick={(e) => {
              e.stopPropagation();
              setShowManual(true);
            }}
          >
            <IconUserManual />
          </button>
          <span className={styles.headerChevron}>
            {isCollapsed ? <IconChevronDown /> : <IconChevronUp />}
          </span>
        </div>
      </div>

      <div className={styles.aggregatorRow}>
        <div className={styles.aggregatorCard}>
          <AggregatorBadge
            label="On Time"
            count={counts.onTime}
            variant="ontime"
            active={statusFilter === 'ontime'}
            onClick={() => toggleFilter('ontime')}
          />
          <AggregatorBadge
            label="Stalled"
            count={counts.stalled}
            variant="stalled"
            active={statusFilter === 'stalled'}
            onClick={() => toggleFilter('stalled')}
          />
          <AggregatorBadge
            label="Delayed"
            count={counts.delayed}
            variant="delayed"
            active={statusFilter === 'delayed'}
            onClick={() => toggleFilter('delayed')}
          />
        </div>
        <div className={styles.aggregatorCard}>
          <AggregatorBadge
            label="Archived"
            count={counts.archived}
            variant="archived"
            active={statusFilter === 'archived'}
            onClick={() => toggleFilter('archived')}
          />
          <AggregatorBadge
            label="Waiting Approval"
            count={counts.waitingApproval}
            variant="waiting-approval"
            active={statusFilter === 'waiting-approval'}
            onClick={() => toggleFilter('waiting-approval')}
          />
          {counts.hidden > 0 && (
            <AggregatorBadge
              label="Hidden"
              count={counts.hidden}
              variant="hidden"
              active={statusFilter === 'hidden'}
              onClick={() => toggleFilter('hidden')}
            />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles.searchSortBar}>
          {/* Search */}
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search part number, job ID, customer…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />

          {/* Sort pills */}
          <div className={styles.sortPills}>
            <span className={styles.sortLabel}>Sort:</span>
            {(['partNumber', 'jobId'] as SortField[]).map(field => {
              const active = sortField === field;
              const label  = field === 'partNumber' ? 'Part Number' : 'Job ID';
              return (
                <button
                  key={field}
                  type="button"
                  className={`${styles.sortPill} ${active ? styles.sortPillActive : ''}`}
                  onClick={() => handleSort(field)}
                >
                  {label}
                  {active && <span className={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className={styles.projectList}>
          {error && (
            <div className={styles.errorMessage}>
              Error loading projects: {error}
            </div>
          )}
          {isLoading ? (
            <div className={styles.message}>Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className={styles.message}>No projects match the selected filter.</div>
          ) : (
            filteredProjects.map((proj, idx) => (
              getCatalogStatus(proj) === 'archived' ? (
                <ProjectRowArchived
                  key={proj.Title}
                  project={proj}
                />
              ) : (
                <ProjectRowDashboard
                  key={proj.Title}
                  project={proj}
                  context={context}
                  sp={sp}
                  onStatusReady={handleStatusReady}
                  onCatalogItemSaved={reload}
                  isMoveFirst={idx === 0}
                  isMoveLast={idx === filteredProjects.length - 1}
                  isReordering={isReordering}
                  onMoveFirst={() => { handleMove(proj.Title, 'first').catch(() => undefined); }}
                  onMoveUp={() => { handleMove(proj.Title, 'up').catch(() => undefined); }}
                  onMoveDown={() => { handleMove(proj.Title, 'down').catch(() => undefined); }}
                  onMoveLast={() => { handleMove(proj.Title, 'last').catch(() => undefined); }}
                />
              )
            ))
          )}
        </div>
      )}
    </div>
    {showManual && <UserManualPanel onClose={() => setShowManual(false)} />}
    </>
  );
};

export default ProjectsCatalogCard;
