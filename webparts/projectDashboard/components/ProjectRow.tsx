import * as React from 'react';
import { IProjectWithData } from '../hooks/useProjectsCatalog';
import DoughnutChart from './Doughnut';
import { GetGateStatus, GetBucketStatus, StatusToColor } from '../utils/GetGateStatus';

// ─── Status badge config (JobItem color palette) ──────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ontime:  { color: '#185FA5', bg: '#E6F1FB', label: 'On Time'  },
  delayed: { color: '#A32D2D', bg: '#FCEBEB', label: 'Delayed'  },
  closed:  { color: '#3B6D11', bg: '#EAF3DE', label: 'Closed'   },
};

function getProjectStatusKey(status: string | undefined, gates: any[]): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (status?.toLowerCase() === 'closed') return 'closed';
  const overall = GetBucketStatus(gates);
  if (overall === 'red' || overall === 'yellow') return 'delayed';
  return 'ontime';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProjectRowProps {
  data: IProjectWithData;
  onClick: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectRow: React.FC<ProjectRowProps> = ({ data, onClick }) => {
  const { project, tasks, gates } = data;
  const [hovered, setHovered] = React.useState(false);

  // Overall project completion = average of all tasks
  const complete = tasks.length > 0
    ? Math.round(tasks.reduce((sum, t) => sum + (t.Complete || 0), 0) / tasks.length)
    : 0;

  const statusKey   = getProjectStatusKey(project.Status, gates);
  const statusStyle = STATUS_CONFIG[statusKey];

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        border: '0.5px solid #D3D1C7',
        borderRadius: 8,
        marginBottom: 6,
        background: 'white',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* ── Left: mini doughnut + project identifiers ─────────────────── */}
      <div style={{
        width: 150,
        padding: '8px 10px',
        borderRight: '0.5px solid #E8E6E0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}>
        <div style={{ width: 70, height: 60 }}>
          <DoughnutChart gates={gates} tasks={tasks} complete={complete} showLegend={false} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#2C2C2A', textAlign: 'center' }}>
          {project.ProjectNumber}
        </div>
        <div style={{ fontSize: 10, color: '#888780', textAlign: 'center', lineHeight: 1.2 }}>
          {project.Customer}
        </div>
      </div>

      {/* ── Right: title + gate status bars + footer ──────────────────── */}
      <div style={{
        flex: 1,
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 4,
        minWidth: 0,
      }}>
        {/* Title */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.Title}
        </div>

        {/* Gate status bars */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          {gates.length > 0 ? (
            gates.map((gate, idx) => {
              const gStatus = GetGateStatus(gate.Complete, gate.Start, gate.Finish, gate.ActualFinish);
              const color   = StatusToColor(gStatus, true);
              const border  = gStatus === 'white' ? '0.5px solid #D3D1C7' : 'none';
              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                  <div style={{ width: '100%', height: 8, borderRadius: 3, background: color, border }} />
                  <span style={{ fontSize: 8, color: '#B4B2A9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {gate.Gate.substring(0, 10)}
                  </span>
                </div>
              );
            })
          ) : (
            <span style={{ fontSize: 10, color: '#D3D1C7', fontStyle: 'italic' }}>No tasks</span>
          )}
        </div>

        {/* Footer: team / year + status badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#888780' }}>
            {[project.Team, project.Year].filter(Boolean).join(' · ')}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: statusStyle.color,
            background: statusStyle.bg,
            padding: '2px 8px',
            borderRadius: 10,
          }}>
            {statusStyle.label}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProjectRow;
