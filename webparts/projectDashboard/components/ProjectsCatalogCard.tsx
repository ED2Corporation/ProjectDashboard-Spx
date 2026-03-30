import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import { BaseComponentContext } from '@microsoft/sp-component-base';
import { SPHttpClient } from '@microsoft/sp-http';

import { useProjectsCatalog } from '../hooks/useProjectsCatalog';
import ProjectRowDashboard from './ProjectRowDashboard';
import { IProjectCatalogItem } from '../../../models/IProjectService';
import styles from './ProjectsCatalogCard.module.scss';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'ontime' | 'delayed' | 'archived' | 'hidden';
type StatusKey    = 'ontime' | 'delayed' | 'archived';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

// ─── AggregatorBadge ──────────────────────────────────────────────────────────

type BadgeVariant = StatusKey | 'hidden';

interface AggregatorBadgeProps {
  label: string;
  count: number;
  variant: BadgeVariant;
  active: boolean;
  onClick: () => void;
}

const variantClass: Record<BadgeVariant, string> = {
  ontime:   styles.badgeOntime,
  delayed:  styles.badgeDelayed,
  archived: styles.badgeArchived,
  hidden:   styles.badgeHidden,
};

const AggregatorBadge: React.FC<AggregatorBadgeProps> = ({ label, count, variant, active, onClick }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`${styles.badge} ${variantClass[variant]} ${active ? styles.badgeActive : ''}`}
  >
    <span className={styles.badgeCount}>{count}</span>
    <span>{label}</span>
  </button>
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface IProjectsCatalogCardProps {
  sp: SPFI;
  context: AnyContext;
  onSelectProject?: (project: IProjectCatalogItem) => void;
  onNewProject?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectsCatalogCard: React.FC<IProjectsCatalogCardProps> = ({ sp, context, onSelectProject, onNewProject }) => {
  const { projects, isLoading, error, reload } = useProjectsCatalog(sp);

  const [isCollapsed,  setIsCollapsed]  = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // statusMap is populated by each ProjectRowDashboard via onStatusReady
  const [statusMap, setStatusMap] = useState<Record<string, StatusKey>>({});

  const handleStatusReady = useCallback((projectId: string, key: StatusKey) => {
    setStatusMap(prev => {
      if (prev[projectId] === key) return prev;
      return { ...prev, [projectId]: key };
    });
  }, []);

  // ── Split hidden vs visible ───────────────────────────────────────────────
  const { visibleProjects, hiddenCount } = useMemo(() => {
    const visible = projects.filter(p => p.Status?.toLowerCase() !== 'hidden');
    return { visibleProjects: visible, hiddenCount: projects.length - visible.length };
  }, [projects]);

  // ── Aggregate counts (from visible projects only) ─────────────────────────
  const counts = useMemo(() => {
    let onTime = 0, delayed = 0, archived = 0;
    for (const proj of visibleProjects) {
      const s = proj.Status?.toLowerCase();
      const isArchived = s === 'archived' || s === 'closed'; // backward compat
      const key = statusMap[proj.ProjectId ?? proj.Title] ?? (isArchived ? 'archived' : 'ontime');
      if (key === 'archived')      archived++;
      else if (key === 'delayed')  delayed++;
      else                         onTime++;
    }
    return { onTime, delayed, archived };
  }, [visibleProjects, statusMap]);

  // ── Filtered project list ─────────────────────────────────────────────────
  // When 'hidden' filter is active, show only hidden projects (otherwise they are excluded).
  const filteredProjects = useMemo(() => {
    if (statusFilter === 'hidden') {
      return projects.filter(p => p.Status?.toLowerCase() === 'hidden');
    }
    if (statusFilter === 'all') return visibleProjects;
    return visibleProjects.filter(proj => {
      const s = proj.Status?.toLowerCase();
      const isArchived = s === 'archived' || s === 'closed';
      const key = statusMap[proj.ProjectId ?? proj.Title] ?? (isArchived ? 'archived' : 'ontime');
      return key === statusFilter;
    });
  }, [projects, visibleProjects, statusMap, statusFilter]);

  const toggleFilter = (f: StatusFilter): void => setStatusFilter(prev => prev === f ? 'all' : f);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.card}>

      {/* Header — always visible, controls collapse */}
      <div onClick={() => setIsCollapsed(c => !c)} className={styles.header}>
        <span className={styles.headerTitle}>
          Projects Dashboard
          <span className={styles.headerCount}>({visibleProjects.length})</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onNewProject && (
            <button
              type="button"
              className={styles.headerAddBtn}
              title="New project"
              onClick={e => { e.stopPropagation(); onNewProject(); }}
            >
              +
            </button>
          )}
          <span className={styles.headerChevron}>{isCollapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* Aggregator row — always visible */}
      <div className={styles.aggregatorRow}>
        <AggregatorBadge
          label="On Time"  count={counts.onTime}
          variant="ontime" active={statusFilter === 'ontime'}
          onClick={() => toggleFilter('ontime')}
        />
        <AggregatorBadge
          label="Delayed"  count={counts.delayed}
          variant="delayed" active={statusFilter === 'delayed'}
          onClick={() => toggleFilter('delayed')}
        />
        <AggregatorBadge
          label="Archived"   count={counts.archived}
          variant="archived" active={statusFilter === 'archived'}
          onClick={() => toggleFilter('archived')}
        />
        {hiddenCount > 0 && (
          <AggregatorBadge
            label="Hidden"   count={hiddenCount}
            variant="hidden" active={statusFilter === 'hidden'}
            onClick={() => toggleFilter('hidden')}
          />
        )}
      </div>

      {/* Project rows — collapsible */}
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
            filteredProjects.map(proj => (
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
