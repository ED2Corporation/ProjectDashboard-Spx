import * as React from 'react';
import { useMemo } from 'react';
import { IProjectCatalogItem } from '../../../models/IProjectService';

type StatusKey = 'ontime' | 'stalled' | 'delayed' | 'completed' | 'archived' | 'waiting-approval';

const LABEL: Record<string, string> = {
  completed:          'DELIVERED',
  ontime:             'ON TRACK',
  stalled:            'OFF TRACK',
  delayed:            'AT-RISK',
  archived:           'ARCHIVED',
  'waiting-approval': 'PENDING',
};

const COLOR: Record<string, string> = {
  completed:          '#16A34A',
  ontime:             '#0284C7',
  stalled:            '#D97706',
  delayed:            '#DC2626',
  archived:           '#94A3B8',
  'waiting-approval': '#7C3AED',
};

export interface SummaryModalProps {
  projects: IProjectCatalogItem[];
  statusMap: Record<string, StatusKey>;
  progressMap: Record<string, number>;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByPo(projects: IProjectCatalogItem[]): [string, IProjectCatalogItem[]][] {
  const map = new Map<string, IProjectCatalogItem[]>();
  for (const p of projects) {
    const po = p.poNumberCustomer || '—';
    if (!map.has(po)) map.set(po, []);
    map.get(po)!.push(p);
  }
  map.forEach(group => group.sort((a, b) => (a.ProjectNumber ?? '').localeCompare(b.ProjectNumber ?? '')));
  return [...map.entries()].sort(([a], [b]) => {
    if (a === '—') return 1;
    if (b === '—') return -1;
    return a.localeCompare(b);
  });
}

interface Counts { delivered: number; onTrack: number; offTrack: number; atRisk: number; total: number }

function countStatuses(projects: IProjectCatalogItem[], statusMap: Record<string, StatusKey>): Counts {
  let delivered = 0, onTrack = 0, offTrack = 0, atRisk = 0;
  for (const p of projects) {
    const k = statusMap[p.Title] ?? 'ontime';
    if      (k === 'completed') delivered++;
    else if (k === 'ontime')    onTrack++;
    else if (k === 'stalled')   offTrack++;
    else if (k === 'delayed')   atRisk++;
  }
  return { delivered, onTrack, offTrack, atRisk, total: projects.length };
}

// ─── Print HTML builder ───────────────────────────────────────────────────────

function buildPrintHtml(
  grouped: [string, IProjectCatalogItem[]][],
  statusMap: Record<string, StatusKey>,
  progressMap: Record<string, number>,
  counts: Counts,
  dateLabel: string
): string {
  const BADGE_DEFS = [
    { label: 'DELIVERED', count: counts.delivered, color: '#16A34A' },
    { label: 'ON TRACK',  count: counts.onTrack,   color: '#0284C7' },
    { label: 'OFF TRACK', count: counts.offTrack,  color: '#D97706' },
    { label: 'AT-RISK',   count: counts.atRisk,    color: '#DC2626' },
  ];

  const badgesHtml = BADGE_DEFS.map((b, i) => `
    <div style="display:flex;align-items:center;gap:10px;${i < BADGE_DEFS.length - 1 ? 'padding-right:28px;border-right:1px solid #E2E8F0;' : ''}">
      <span style="width:12px;height:12px;border-radius:50%;background:${b.color};flex-shrink:0;display:inline-block;"></span>
      <div>
        <div style="font-size:26px;font-weight:800;color:${b.color};line-height:1.1;">${b.count}</div>
        <div style="font-size:9px;font-weight:700;color:#64748B;letter-spacing:.08em;text-transform:uppercase;">${b.label}</div>
        <div style="font-size:9px;color:#94A3B8;">${b.count}/${counts.total}</div>
      </div>
    </div>`).join('');

  let rows = '';
  for (const [po, items] of grouped) {
    for (let i = 0; i < items.length; i++) {
      const p     = items[i];
      const key   = statusMap[p.Title] ?? 'ontime';
      const color = COLOR[key] ?? '#0284C7';
      const label = LABEL[key] ?? 'ON TRACK';
      const pct   = progressMap[p.Title] !== undefined ? `${progressMap[p.Title]}%` : '—';
      const isFirst   = i === 0;
      const isGroupTop = isFirst && po !== '—';
      const poCell = isFirst
        ? `<td rowspan="${items.length}" style="font-weight:700;color:#1E293B;vertical-align:middle;text-align:center;border-right:2px solid #CBD5E1;padding:8px 14px;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">${po}</td>`
        : '';
      rows += `
        <tr style="border-bottom:1px solid #F1F5F9;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">
          ${poCell}
          <td style="padding:7px 14px;color:#334155;font-weight:600;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">${p.ProjectNumber ?? '—'}</td>
          <td style="padding:7px 14px;color:#475569;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">${p.PartNumber ?? '—'}</td>
          <td style="padding:7px 14px;color:#334155;text-align:center;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">${p.Units !== null && p.Units !== undefined ? p.Units : '—'}</td>
          <td style="padding:7px 14px;font-weight:700;color:${color};text-align:center;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">${label}</td>
          <td style="padding:7px 14px;color:#185FA5;font-weight:600;text-align:center;${isGroupTop ? 'border-top:2px solid #CBD5E1;' : ''}">${pct}</td>
        </tr>`;
    }
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WO Executive Summary — ${dateLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px 40px; color: #1E293B; font-size: 12px; background: #fff; }
    h1 { font-size: 22px; font-weight: 800; color: #0F172A; margin-bottom: 4px; }
    .sub { font-size: 11px; color: #64748B; margin-bottom: 2px; }
    .date { font-size: 10px; font-weight: 700; color: #EF4444; letter-spacing: .06em; text-transform: uppercase; }
    hr { border: none; border-top: 1px solid #CBD5E1; margin: 12px 0 24px; }
    .badges { display: flex; gap: 28px; margin-bottom: 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: #F1F5F9; color: #475569; font-weight: 700; padding: 8px 14px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
    @media print { button { display: none; } body { padding: 18px 24px; } }
  </style>
</head>
<body>
  <h1>Work Order Executive Summary</h1>
  <p class="sub">Execution Readout</p>
  <p class="date">Updated: ${dateLabel}</p>
  <hr>
  <div class="badges">${badgesHtml}</div>
  <table>
    <thead>
      <tr>
        <th style="width:13%;border-right:2px solid #CBD5E1;">PO #</th>
        <th style="width:13%;">WO #</th>
        <th style="width:22%;">Part Number</th>
        <th style="width:9%;text-align:center;">Qty</th>
        <th style="width:18%;text-align:center;">Status</th>
        <th style="width:13%;text-align:center;">Overall %</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SummaryModal: React.FC<SummaryModalProps> = ({ projects, statusMap, progressMap, onClose }) => {
  const grouped = useMemo(() => groupByPo(projects), [projects]);
  const counts  = useMemo(() => countStatuses(projects, statusMap), [projects, statusMap]);
  const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleDownloadPdf = (): void => {
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups for this site to download the PDF.'); return; }
    win.document.open();
    win.document.write(buildPrintHtml(grouped, statusMap, progressMap, counts, dateLabel));
    win.document.close();
    window.setTimeout(() => {
      try { win.focus(); win.print(); } catch { /* browser may block */ }
    }, 350);
  };

  const BADGE_DEFS = [
    { label: 'DELIVERED', count: counts.delivered, color: '#16A34A' },
    { label: 'ON TRACK',  count: counts.onTrack,   color: '#0284C7' },
    { label: 'OFF TRACK', count: counts.offTrack,  color: '#D97706' },
    { label: 'AT-RISK',   count: counts.atRisk,    color: '#DC2626' },
  ];

  // ── Styles ────────────────────────────────────────────────────────────────

  const S = {
    overlay: {
      position: 'fixed' as const, inset: 0, zIndex: 9500,
      background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 20px', overflowY: 'auto' as const,
    },
    modal: {
      background: '#fff', borderRadius: 10,
      boxShadow: '0 12px 48px rgba(0,0,0,.22)',
      width: '100%', maxWidth: 920,
      padding: '28px 32px 32px',
      fontFamily: "'Segoe UI', Arial, sans-serif",
    },
    topBar: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 },
    subtitle: { fontSize: 11, color: '#64748B', margin: '3px 0 2px' },
    dateLabel: { fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '.06em', textTransform: 'uppercase' as const },
    divider: { border: 'none', borderTop: '1px solid #CBD5E1', margin: '12px 0 20px' },
    badgesRow: { display: 'flex', gap: 28, marginBottom: 24 },
    badge: { display: 'flex', alignItems: 'center', gap: 10, paddingRight: 24, borderRight: '1px solid #E2E8F0' },
    badgeLast: { display: 'flex', alignItems: 'center', gap: 10 },
    badgeCount: (color: string): React.CSSProperties => ({ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }),
    badgeLabel: { fontSize: 9, fontWeight: 700, color: '#64748B', letterSpacing: '.08em', textTransform: 'uppercase' as const },
    badgeSub: { fontSize: 9, color: '#94A3B8' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
    th: { background: '#F1F5F9', color: '#475569', fontWeight: 700, padding: '8px 14px', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' as const, textAlign: 'left' as const },
    thCenter: { background: '#F1F5F9', color: '#475569', fontWeight: 700, padding: '8px 14px', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' as const, textAlign: 'center' as const },
    actions: { display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' },
    btnPdf: {
      padding: '7px 18px', borderRadius: 6, border: '1px solid #185FA5',
      background: '#185FA5', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
    btnClose: {
      padding: '7px 18px', borderRadius: 6, border: '1px solid #CBD5E1',
      background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={S.topBar}>
          <div>
            <h2 style={S.title}>Work Order Executive Summary</h2>
            <p style={S.subtitle}>Execution Readout</p>
            <p style={S.dateLabel}>Updated: {dateLabel}</p>
          </div>
        </div>
        <hr style={S.divider} />

        {/* ── Status badges ────────────────────────────────────────────────── */}
        <div style={S.badgesRow}>
          {BADGE_DEFS.map((b, i) => (
            <div key={b.label} style={i < BADGE_DEFS.length - 1 ? S.badge : S.badgeLast}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: b.color, flexShrink: 0, display: 'inline-block' }} />
              <div>
                <div style={S.badgeCount(b.color)}>{b.count}</div>
                <div style={S.badgeLabel}>{b.label}</div>
                <div style={S.badgeSub}>{b.count}/{counts.total}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: '13%', borderRight: '2px solid #CBD5E1' }}>PO #</th>
              <th style={{ ...S.th, width: '13%' }}>WO #</th>
              <th style={{ ...S.th, width: '22%' }}>Part Number</th>
              <th style={{ ...S.thCenter, width: '9%' }}>Qty</th>
              <th style={{ ...S.thCenter, width: '18%' }}>Status</th>
              <th style={{ ...S.thCenter, width: '13%' }}>Overall %</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([po, items]) =>
              items.map((p, i) => {
                const key   = statusMap[p.Title] ?? 'ontime';
                const color = COLOR[key] ?? '#0284C7';
                const label = LABEL[key] ?? 'ON TRACK';
                const pct   = progressMap[p.Title] !== undefined ? `${progressMap[p.Title]}%` : '—';
                const groupTop = i === 0 && po !== '—';
                const groupBorder = groupTop ? '2px solid #CBD5E1' : undefined;
                return (
                  <tr key={p.Title} style={{ borderBottom: '1px solid #F1F5F9', borderTop: groupTop ? '2px solid #CBD5E1' : undefined }}>
                    {i === 0 && (
                      <td rowSpan={items.length} style={{
                        fontWeight: 700, color: '#1E293B', verticalAlign: 'middle',
                        textAlign: 'center', borderRight: '2px solid #CBD5E1',
                        padding: '8px 14px', borderTop: groupBorder,
                      }}>
                        {po}
                      </td>
                    )}
                    <td style={{ padding: '7px 14px', color: '#334155', fontWeight: 600, borderTop: groupBorder }}>{p.ProjectNumber ?? '—'}</td>
                    <td style={{ padding: '7px 14px', color: '#475569', borderTop: groupBorder }}>{p.PartNumber ?? '—'}</td>
                    <td style={{ padding: '7px 14px', color: '#334155', textAlign: 'center', borderTop: groupBorder }}>{p.Units !== null && p.Units !== undefined ? p.Units : '—'}</td>
                    <td style={{ padding: '7px 14px', fontWeight: 700, color, textAlign: 'center', borderTop: groupBorder }}>{label}</td>
                    <td style={{ padding: '7px 14px', color: '#185FA5', fontWeight: 600, textAlign: 'center', borderTop: groupBorder }}>{pct}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div style={S.actions}>
          <button type="button" style={S.btnPdf} onClick={handleDownloadPdf}>
            ⬇ Download PDF
          </button>
          <button type="button" style={S.btnClose} onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default SummaryModal;
