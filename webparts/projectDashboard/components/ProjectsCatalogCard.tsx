import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { SPFI } from '@pnp/sp';
import { BaseComponentContext } from '@microsoft/sp-component-base';
import { SPHttpClient } from '@microsoft/sp-http';

import { useProjectsCatalog } from '../hooks/useProjectsCatalog';
import ProjectRowDashboard from './ProjectRowDashboard';
import { IProjectCatalogItem } from '../../../models/IProjectService';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'ontime' | 'delayed' | 'closed';
type StatusKey    = 'ontime' | 'delayed' | 'closed';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

// ─── AggregatorBadge ──────────────────────────────────────────────────────────

interface AggregatorBadgeProps {
  label: string;
  count: number;
  color: string;
  bg: string;
  active: boolean;
  onClick: () => void;
}

const AggregatorBadge: React.FC<AggregatorBadgeProps> = ({ label, count, color, bg, active, onClick }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 14px', borderRadius: 16,
      border: active ? `2px solid ${color}` : '1px solid #D3D1C7',
      background: active ? bg : 'white',
      cursor: 'pointer', fontSize: 12, color,
      fontWeight: active ? 600 : 400,
      transition: 'all 0.15s',
    }}
  >
    <span style={{ fontSize: 15, fontWeight: 700 }}>{count}</span>
    <span>{label}</span>
  </button>
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface IProjectsCatalogCardProps {
  sp: SPFI;
  context: AnyContext;
  onSelectProject?: (project: IProjectCatalogItem) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectsCatalogCard: React.FC<IProjectsCatalogCardProps> = ({ sp, context, onSelectProject }) => {
  const { projects, isLoading, error } = useProjectsCatalog(sp);

  const [isCollapsed,  setIsCollapsed]  = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // statusMap is populated by each ProjectRowDashboard via onStatusReady
  const [statusMap, setStatusMap] = useState<Record<string, StatusKey>>({});

  const handleStatusReady = useCallback((projectId: string, key: StatusKey) => {
    setStatusMap(prev => {
      if (prev[projectId] === key) return prev; // avoid re-render if same
      return { ...prev, [projectId]: key };
    });
  }, []);

  // ── Aggregate counts ──────────────────────────────────────────────────────
  const counts = useMemo(() => {
    let onTime = 0, delayed = 0, closed = 0;
    for (const proj of projects) {
      const isClosed = proj.Status?.toLowerCase() === 'closed';
      const key = statusMap[proj.ProjectId ?? proj.Title] ?? (isClosed ? 'closed' : 'ontime');
      if (key === 'closed')   closed++;
      else if (key === 'delayed') delayed++;
      else onTime++;
    }
    return { onTime, delayed, closed };
  }, [projects, statusMap]);

  // ── Filtered project list ─────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    if (statusFilter === 'all') return projects;
    return projects.filter(proj => {
      const isClosed = proj.Status?.toLowerCase() === 'closed';
      const key = statusMap[proj.ProjectId ?? proj.Title] ?? (isClosed ? 'closed' : 'ontime');
      return key === statusFilter;
    });
  }, [projects, statusMap, statusFilter]);

  const toggleFilter = (f: StatusFilter) => setStatusFilter(prev => prev === f ? 'all' : f);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      border: '1px solid #D3D1C7', borderRadius: 10, overflow: 'hidden',
      marginBottom: 16, background: 'white', fontFamily: 'Segoe UI, sans-serif',
    }}>
      {/* Header — always visible, controls collapse */}
      <div
        onClick={() => setIsCollapsed(c => !c)}
        style={{
          background: '#56b3fa', color: 'white', padding: '8px 16px',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          Projects Dashboard{' '}
          <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.85 }}>
            ({projects.length})
          </span>
        </span>
        <span style={{ fontSize: 11 }}>{isCollapsed ? '▼' : '▲'}</span>
      </div>

      {/* Aggregator row — always visible */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px',
        background: '#f3f2f1', borderBottom: '1px solid #e1dfdd', flexWrap: 'wrap',
      }}>
        <AggregatorBadge
          label="On Time"  count={counts.onTime}
          color="#185FA5"  bg="#E6F1FB"
          active={statusFilter === 'ontime'}
          onClick={() => toggleFilter('ontime')}
        />
        <AggregatorBadge
          label="Delayed"  count={counts.delayed}
          color="#A32D2D"  bg="#FCEBEB"
          active={statusFilter === 'delayed'}
          onClick={() => toggleFilter('delayed')}
        />
        <AggregatorBadge
          label="Closed"   count={counts.closed}
          color="#3B6D11"  bg="#EAF3DE"
          active={statusFilter === 'closed'}
          onClick={() => toggleFilter('closed')}
        />
      </div>

      {/* Project rows — collapsible */}
      {!isCollapsed && (
        <div style={{ padding: '8px 16px', maxHeight: 720, overflowY: 'auto' }}>
          {error && (
            <div style={{ color: '#A32D2D', fontSize: 12, padding: '8px 0' }}>
              Error loading projects: {error}
            </div>
          )}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 28, color: '#888780', fontSize: 13 }}>
              Loading projects...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#B4B2A9', fontSize: 12 }}>
              No projects match the selected filter.
            </div>
          ) : (
            filteredProjects.map(proj => (
              <ProjectRowDashboard
                key={proj.ProjectId ?? proj.Title}
                project={proj}
                context={context}
                sp={sp}
                onStatusReady={handleStatusReady}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectsCatalogCard;
