import * as React from 'react';
import { useState, useMemo } from 'react';
import { SPFI } from '@pnp/sp';
import { useProjectsCatalog } from '../hooks/useProjectsCatalog';
import ProjectRow from './ProjectRow';
import { GetBucketStatus } from '../utils/GetGateStatus';
import { IProjectCatalogItem } from '../../../models/IProjectService';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'ontime' | 'delayed' | 'closed';

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
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 14px',
      borderRadius: 16,
      border: active ? `2px solid ${color}` : '1px solid #D3D1C7',
      background: active ? bg : 'white',
      cursor: 'pointer',
      fontSize: 12,
      color: color,
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
  onSelectProject: (project: IProjectCatalogItem) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectsCatalogCard: React.FC<IProjectsCatalogCardProps> = ({ sp, onSelectProject }) => {
  const { projects, projectData, isLoading, error } = useProjectsCatalog(sp);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── Aggregate counts ──────────────────────────────────────────────────────
  const counts = useMemo(() => {
    let onTime = 0, delayed = 0, closed = 0;
    for (const proj of projects) {
      if (proj.Status?.toLowerCase() === 'closed') { closed++; continue; }
      const key  = proj.ProjectId ?? proj.Title;
      const data = projectData[key ?? ''];
      if (!data) continue;
      const overall = GetBucketStatus(data.gates);
      if (overall === 'red' || overall === 'yellow') delayed++;
      else onTime++;
    }
    return { onTime, delayed, closed };
  }, [projects, projectData]);

  // ── Filtered project list ─────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    return projects.filter(proj => {
      const isClosed = proj.Status?.toLowerCase() === 'closed';
      if (statusFilter === 'closed')  return isClosed;
      if (isClosed)                   return statusFilter === 'all';

      const key     = proj.ProjectId ?? proj.Title;
      const data    = projectData[key ?? ''];
      const overall = data ? GetBucketStatus(data.gates) : 'white';
      const isDelayed = overall === 'red' || overall === 'yellow';

      if (statusFilter === 'delayed') return isDelayed;
      if (statusFilter === 'ontime')  return !isDelayed;
      return true; // 'all'
    });
  }, [projects, projectData, statusFilter]);

  const toggleFilter = (f: StatusFilter) =>
    setStatusFilter(prev => (prev === f ? 'all' : f));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      border: '1px solid #D3D1C7',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 16,
      background: 'white',
      fontFamily: 'Segoe UI, sans-serif',
    }}>
      {/* Header — always visible, controls collapse */}
      <div
        onClick={() => setIsCollapsed(c => !c)}
        style={{
          background: '#56b3fa',
          color: 'white',
          padding: '8px 16px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
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

      {!isCollapsed && (
        <>
          {/* Aggregator row */}
          <div style={{
            display: 'flex',
            gap: 8,
            padding: '8px 16px',
            background: '#f3f2f1',
            borderBottom: '1px solid #e1dfdd',
            flexWrap: 'wrap',
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

          {/* Project list */}
          <div style={{ padding: '8px 16px', maxHeight: 520, overflowY: 'auto' }}>
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
              filteredProjects.map(proj => {
                const key  = proj.ProjectId ?? proj.Title;
                const data = projectData[key ?? ''];
                if (!data) return null;
                return (
                  <ProjectRow
                    key={proj.ProjectId ?? proj.Title}
                    data={data}
                    onClick={() => onSelectProject(proj)}
                  />
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectsCatalogCard;
