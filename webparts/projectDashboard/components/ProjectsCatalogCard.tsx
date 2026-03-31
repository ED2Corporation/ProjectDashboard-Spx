import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import { BaseComponentContext } from '@microsoft/sp-component-base';
import { SPHttpClient } from '@microsoft/sp-http';

import { useProjectsCatalog } from '../hooks/useProjectsCatalog';
import ProjectRowDashboard from './ProjectRowDashboard';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import styles from './ProjectsCatalogCard.module.scss';

type StatusFilter = 'all' | 'ontime' | 'delayed' | 'archived' | 'hidden' | 'waiting-approval';
type StatusKey = 'ontime' | 'delayed' | 'archived' | 'waiting-approval';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

type BadgeVariant = StatusKey | 'hidden';
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
  ontime: styles.badgeOntime,
  delayed: styles.badgeDelayed,
  archived: styles.badgeNeutral,
  hidden: styles.badgeNeutral,
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

  return statusMap[project.ProjectId ?? project.Title] ?? 'ontime';
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

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusMap, setStatusMap] = useState<Record<string, StatusKey>>({});

  const handleStatusReady = useCallback((projectId: string, key: StatusKey) => {
    setStatusMap((prev) => {
      if (prev[projectId] === key) return prev;
      return { ...prev, [projectId]: key };
    });
  }, []);

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
    let onTime = 0;
    let delayed = 0;

    for (const project of openProjects) {
      const key = getProjectStatusKey(project, statusMap);
      if (key === 'delayed') delayed++;
      else onTime++;
    }

    return {
      onTime,
      delayed,
      archived: archivedProjects.length,
      waitingApproval: waitingApprovalProjects.length,
      hidden: hiddenProjects.length,
    };
  }, [openProjects, archivedProjects.length, waitingApprovalProjects.length, hiddenProjects.length, statusMap]);

  const filteredProjects = useMemo(() => {
    if (statusFilter === 'all') return openProjects;
    if (statusFilter === 'hidden') return hiddenProjects;
    if (statusFilter === 'archived') return archivedProjects;
    if (statusFilter === 'waiting-approval') return waitingApprovalProjects;

    return openProjects.filter((project) => getProjectStatusKey(project, statusMap) === statusFilter);
  }, [archivedProjects, hiddenProjects, openProjects, waitingApprovalProjects, statusMap, statusFilter]);

  const toggleFilter = (filter: StatusFilter): void => setStatusFilter((prev) => (prev === filter ? 'all' : filter));

  return (
    <div className={styles.card}>
      <div onClick={() => setIsCollapsed((current) => !current)} className={styles.header}>
        <span className={styles.headerTitle}>
          Projects Dashboard
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
            filteredProjects.map((proj) => (
              <ProjectRowDashboard
                key={proj.ProjectId ?? proj.Title}
                project={proj}
                context={context}
                sp={sp}
                onStatusReady={handleStatusReady}
                onCatalogItemSaved={reload}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectsCatalogCard;
