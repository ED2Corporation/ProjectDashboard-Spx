import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './UserManualPanel.module.scss';
import { RELEASES, fmtReleaseDate, groupReleasesByMonth } from './userGuide/releases';

// ─── Tab type ─────────────────────────────────────────────────────────────────

type TabId = 'guide' | 'releases';

// ─── Nav sections ─────────────────────────────────────────────────────────────

const GUIDE_NAV = [
  { id: 's1', num: 1, label: 'Overview' },
  { id: 's2', num: 2, label: 'Header buttons' },
  { id: 's3', num: 3, label: 'Project statuses' },
  { id: 's4', num: 4, label: 'Search & sort' },
  { id: 's5', num: 5, label: 'Reading a row' },
  { id: 's6', num: 6, label: 'Typical workflow' },
];

const RELEASES_NAV = [
  { id: 'r-latest',  label: 'Latest release'  },
  { id: 'r-history', label: 'Release history' },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconClose: React.FC = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M3 3l10 10M13 3L3 13" />
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface UserManualPanelProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const UserManualPanel: React.FC<UserManualPanelProps> = ({ onClose }) => {
  const contentRef                    = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab]     = useState<TabId>('guide');
  const [activeId,  setActiveId]      = useState<string>('s1');

  const activeNav = activeTab === 'guide' ? GUIDE_NAV : RELEASES_NAV;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Reset active item on tab switch
  useEffect(() => {
    setActiveId(activeTab === 'guide' ? 's1' : 'r-latest');
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  // Scroll-spy
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const nav = activeTab === 'guide' ? GUIDE_NAV : RELEASES_NAV;

    const onScroll = (): void => {
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) {
        setActiveId(nav[nav.length - 1].id);
        return;
      }
      const threshold = root.scrollTop + root.clientHeight * 0.30;
      let current = nav[0].id;
      for (const { id } of nav) {
        const el = root.querySelector<HTMLElement>(`#${id}`);
        if (el && el.offsetTop <= threshold) current = id;
      }
      setActiveId(current);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener('scroll', onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const scrollTo = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Release history grouped data ────────────────────────────────────────────
  const [latestRelease, ...historyReleases] = RELEASES;
  const historyGroups = groupReleasesByMonth(historyReleases);

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="User Manual">
      <div className={styles.panel} onClick={e => e.stopPropagation()}>

        {/* ── Panel header ────────────────────────────────────────────── */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            Work Orders <span>User Manual</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close manual">
            <IconClose />
          </button>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className={styles.tabBar}>
          {(['guide', 'releases'] as TabId[]).map(tab => (
            <button
              key={tab}
              type="button"
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'guide' ? 'Guide' : 'Releases'}
            </button>
          ))}
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className={styles.body}>

          {/* Sidebar nav */}
          <nav className={styles.sidebar}>
            <div className={styles.navGroupLabel}>
              {activeTab === 'guide' ? 'Contents' : 'Releases'}
            </div>
            {activeNav.map(({ id, label }) => {
              const guideEntry = activeTab === 'guide' ? GUIDE_NAV.find(n => n.id === id) : undefined;
              return (
                <a
                  key={id}
                  className={`${styles.navLink} ${activeId === id ? styles.navActive : ''}`}
                  onClick={() => scrollTo(id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && scrollTo(id)}
                >
                  {guideEntry && <span className={styles.navNum}>{guideEntry.num}</span>}
                  {label}
                </a>
              );
            })}
            <div className={styles.sidebarFooter}>
              Work Orders v{RELEASES[0]?.version ?? '1.0'}<br />ED2 Corp &copy; 2026
            </div>
          </nav>

          {/* Scrollable content — Guide tab */}
          {activeTab === 'guide' && <div className={styles.content} ref={contentRef}>

            {/* Hero */}
            <div className={styles.hero}>
              <div className={styles.heroLabel}>ED2 Corp &middot; Engineering Dashboard</div>
              <div className={styles.heroTitle}>User Manual &mdash; Work Orders</div>
              <div className={styles.heroDesc}>
                Guide to the project catalog: navigation, filters, search, and reading status indicators.
              </div>
            </div>

            {/* ── 1. Overview ─────────────────────────────────────────── */}
            <div className={styles.section} id="s1">
              <div className={styles.sectionTitle}>
                <span className={styles.num}>1</span> Catalog overview
              </div>
              <p className={styles.itemDesc} style={{ marginBottom: 12 }}>
                The <strong>Work Orders catalog</strong> lists all active and historical work orders.
                It consists of a fixed header, a status badge row, and an expandable project list.
              </p>

              {/* Mockup */}
              <div className={styles.mockup}>
                <div className={styles.mockHeader}>
                  <span className={styles.mockTitle}>Work Orders <span style={{ color: '#999', fontWeight: 400 }}>(12)</span></span>
                  <div className={styles.mockBtns}>
                    {['+', '↻', '📖', '▲'].map((c, i) => <div key={i} className={styles.mockBtn}>{c}</div>)}
                  </div>
                </div>
                <div className={styles.mockBadges}>
                  <span className={`${styles.mockBadge} ${styles.bg}`}>9 On Time</span>
                  <span className={`${styles.mockBadge} ${styles.by}`}>2 Stalled</span>
                  <span className={`${styles.mockBadge} ${styles.br}`}>1 Delayed</span>
                  <span className={`${styles.mockBadge} ${styles.bn}`}>3 Archived</span>
                  <span className={`${styles.mockBadge} ${styles.bn}`}>1 Waiting Approval</span>
                </div>
                <div className={styles.mockSearch}>🔍 Search part number, job ID, customer…</div>
              </div>

              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#e8f2fb', color: '#0078d4' }}>📊</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Title bar</div>
                  <div className={styles.itemDesc}>Displays &ldquo;Work Orders&rdquo; and the count of open projects. Clicking the header collapses or expands the list. The badge row is always visible.</div>
                </div>
              </div>
              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#dff0de', color: '#107c10' }}>🏷️</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Status badge row</div>
                  <div className={styles.itemDesc}>Shows the count per status. Click a badge to <strong>filter</strong> the list; click again to <strong>clear</strong> the filter.</div>
                </div>
              </div>
              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#fef8e7', color: '#b7791f' }}>🔍</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Search &amp; sort bar</div>
                  <div className={styles.itemDesc}>Real-time text filter. Works on top of any active badge filter.</div>
                </div>
              </div>
            </div>

            {/* ── 2. Header buttons ────────────────────────────────────── */}
            <div className={styles.section} id="s2">
              <div className={styles.sectionTitle}>
                <span className={styles.num}>2</span> Header buttons
              </div>

              {[
                { bg: '#dff0de', fg: '#107c10', icon: '+', title: 'Create new project', desc: 'Opens the new work order form. Requires write permissions on the project catalog.' },
                { bg: '#e8f2fb', fg: '#0078d4', icon: '↻', title: 'Reload list',         desc: 'Fetches updated projects from SharePoint. Useful when another user has made recent changes.' },
                { bg: '#fef8e7', fg: '#b7791f', icon: '📖', title: 'User manual',         desc: 'Opens this panel. Available at any time without interrupting your work on the dashboard.' },
                { bg: '#f3f3f3', fg: '#6b6b6b', icon: '▲▼', title: 'Collapse / Expand',  desc: 'Hides or shows the project list. The status badge row remains visible at all times.' },
              ].map(({ bg, fg, icon, title, desc }) => (
                <div className={styles.item} key={title}>
                  <div className={styles.itemIcon} style={{ background: bg, color: fg }}>{icon}</div>
                  <div className={styles.itemBody}>
                    <div className={styles.itemTitle}>{title}</div>
                    <div className={styles.itemDesc}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── 3. Project statuses ──────────────────────────────────── */}
            <div className={styles.section} id="s3">
              <div className={styles.sectionTitle}>
                <span className={styles.num}>3</span> Project statuses
              </div>
              <p className={styles.itemDesc} style={{ marginBottom: 4 }}>
                Status is calculated automatically from each project&rsquo;s gate progress.
              </p>
              <div className={styles.badgeGrid}>
                {[
                  { cls: styles.bcGreen,  chipCls: styles.chipGreen,  dot: '#107c10', label: 'On Time',          desc: 'All gates progressing as planned. No critical overdue tasks.' },
                  { cls: styles.bcYellow, chipCls: styles.chipYellow, dot: '#d69e2e', label: 'Stalled',          desc: 'A gate shows moderate delay. Can be recovered with immediate action.' },
                  { cls: styles.bcRed,    chipCls: styles.chipRed,    dot: '#c42b1c', label: 'Delayed',          desc: 'One or more gates have significant delay. Requires priority attention.' },
                  { cls: styles.bcGray,   chipCls: styles.chipGray,   dot: '#999',    label: 'Archived',         desc: 'Project closed. Task list exported and removed from SharePoint.' },
                  { cls: styles.bcGray,   chipCls: styles.chipGray,   dot: '#999',    label: 'Waiting Approval', desc: 'Pending management approval before continuing its lifecycle.' },
                  { cls: styles.bcGray,   chipCls: styles.chipGray,   dot: '#bbb',    label: 'Hidden',           desc: 'Manually hidden. Only visible when the "Hidden" filter is selected.' },
                ].map(({ cls, chipCls, dot, label, desc }) => (
                  <div key={label} className={`${styles.bc} ${cls}`}>
                    <div className={styles.bcName}>
                      <span className={`${styles.chip} ${chipCls}`}>
                        <span className={styles.dot} style={{ background: dot }} />
                        {label}
                      </span>
                    </div>
                    <div className={styles.bcDesc}>{desc}</div>
                  </div>
                ))}
              </div>
              <div className={styles.tip}>
                <strong>Note:</strong> On Time, Stalled, and Delayed apply to open projects only.
                The other statuses display in separate groups when their badge is selected.
              </div>
            </div>

            {/* ── 4. Search & sort ─────────────────────────────────────── */}
            <div className={styles.section} id="s4">
              <div className={styles.sectionTitle}>
                <span className={styles.num}>4</span> Search &amp; sort
              </div>

              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#f3f3f3' }}>🔍</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Search box</div>
                  <div className={styles.itemDesc}>
                    Filters in real time by <strong>Part Number</strong>, <strong>Job ID / Project Number</strong>,
                    and <strong>Customer</strong>. Applied on top of any active badge filter.
                  </div>
                </div> 
              </div>
              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#f3f3f3' }}>↕</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Sort pills</div>
                  <div className={styles.itemDesc}>
                    Cyclic behavior per field:
                    <div className={styles.sortDemo}>
                      <span className={styles.sortLabel}>Sort:</span>
                      <span className={`${styles.sortPill} ${styles.sortPillActive}`}>Part Number ▲</span>
                      <span className={styles.sortPill}>Job ID</span>
                    </div>
                    <ul style={{ margin: '8px 0 0 18px', fontSize: 12, color: '#555', lineHeight: 1.9 }}>
                      <li>1st click &rarr; sort <strong>ascending ▲</strong></li>
                      <li>2nd click &rarr; sort <strong>descending ▼</strong></li>
                      <li>3rd click &rarr; <strong>no sort</strong> (original order)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 5. Reading a row ─────────────────────────────────────── */}
            <div className={styles.section} id="s5">
              <div className={styles.sectionTitle}>
                <span className={styles.num}>5</span> Reading a project row
              </div>

              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#e8f2fb', color: '#0078d4' }}>📋</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Project information (left)</div>
                  <div className={styles.itemDesc}>
                    <ul style={{ margin: '6px 0 0 16px', fontSize: 12, color: '#555', lineHeight: 1.9 }}>
                      <li><strong>Part Number</strong> &mdash; primary identifier (bold title)</li>
                      <li><strong>PO#</strong> &mdash; customer Purchase Order number</li>
                      <li><strong>Project Number</strong> &mdash; internal project number</li>
                      <li><strong>Units</strong> &mdash; quantity to produce</li>
                      <li><strong>Customer</strong> &mdash; customer name</li>
                    </ul>
                    <div style={{ marginTop: 7, fontSize: 12, color: '#555' }}>
                      Clicking this area activates &ldquo;All Tasks&rdquo; mode, showing all project tasks.
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.item}>
                <div className={styles.itemIcon} style={{ background: '#dff0de', color: '#107c10' }}>📈</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>Gate progress bar (right)</div>
                  <div className={styles.itemDesc}>
                    Shows completion percentage per phase. Color indicates status:
                    <div className={styles.chipRow}>
                      <span className={`${styles.chip} ${styles.chipGreen}`}><span className={styles.dot} style={{ background: '#107c10' }} />Green = On Track</span>
                      <span className={`${styles.chip} ${styles.chipYellow}`}><span className={styles.dot} style={{ background: '#d69e2e' }} />Yellow = Stalled</span>
                      <span className={`${styles.chip} ${styles.chipRed}`}><span className={styles.dot} style={{ background: '#c42b1c' }} />Red = Delayed</span>
                      <span className={`${styles.chip} ${styles.chipGray}`}><span className={styles.dot} style={{ background: '#bbb' }} />Gray = Not started</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.tip}>
                <strong>Note:</strong> Projects with legacy storage (v1) display a ⚠ icon next to the Part Number.
                They work identically to standard projects.
              </div>
            </div>

            {/* ── 6. Typical workflow ──────────────────────────────────── */}
            <div className={styles.section} id="s6">
              <div className={styles.sectionTitle}>
                <span className={styles.num}>6</span> Typical workflow
              </div>
              <ol className={styles.steps}>
                {[
                  'Load the dashboard. The project list appears automatically.',
                  'Review the status badges for a quick portfolio overview.',
                  <>Click <strong>Delayed</strong> to see only overdue projects, or use the search box to find a specific one.</>,
                  'Click a gate name to expand the task list for that phase.',
                  'Click a task to open its detail card and update progress.',
                  <>Use the ⚙ gear icon on the gate bar to access project administration options.</>,
                ].map((text, i) => (
                  <li key={i} className={styles.step}>{text}</li>
                ))}
              </ol>
            </div>

            <div className={styles.manualFooter}>
              ED2 Corp &middot; Engineering Dashboard &middot; Work Orders User Manual v1.0 &middot; 2026
            </div>

          </div>}

          {/* ── Releases content (shown only when releases tab active) ── */}
          {activeTab === 'releases' && (
            <div className={styles.content} ref={contentRef}>

              {/* Latest release ─────────────────────────────────────── */}
              <h2 className={styles.releasesH2} id="r-latest">Latest release</h2>
              {latestRelease ? (
                <div className={styles.releaseCard}>
                  <div className={styles.releaseHead}>
                    <span className={styles.releaseVersion}>Version {latestRelease.version}</span>
                    <span className={styles.releaseDate}>{fmtReleaseDate(latestRelease.date)}</span>
                  </div>
                  <ul className={styles.releaseList}>
                    {latestRelease.items.map((item, i) => (
                      <li key={i} className={styles.releaseItem}>
                        <span className={styles.releaseArea}>{item.area}:</span> {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>No releases registered.</p>
              )}

              {/* Release history ─────────────────────────────────────── */}
              <h2 className={styles.releasesH2} id="r-history">Release history</h2>
              {historyGroups.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#888' }}>No earlier releases.</p>
              ) : (
                <details className={styles.fold}>
                  <summary>Earlier releases ({historyReleases.length}) &mdash; by year and month</summary>
                  <div className={styles.foldInner}>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                      Each build is listed with the version that first carried the change.
                    </p>
                    {historyGroups.map(({ year, months }) => (
                      <React.Fragment key={year}>
                        <div className={styles.histYear}>{year}</div>
                        {months.map(({ month, monthName, releases: mReleases }) => (
                          <details key={month} className={styles.fold}>
                            <summary>
                              {monthName} {year} &middot; {mReleases.length} release{mReleases.length !== 1 ? 's' : ''}
                            </summary>
                            <div className={styles.foldInner}>
                              {mReleases.map(r => (
                                <div key={r.version} className={styles.releaseCard}>
                                  <div className={styles.releaseHead}>
                                    <span className={styles.releaseVersion}>Version {r.version}</span>
                                    <span className={styles.releaseDate}>{fmtReleaseDate(r.date)}</span>
                                  </div>
                                  <ul className={styles.releaseList}>
                                    {r.items.map((item, i) => (
                                      <li key={i} className={styles.releaseItem}>
                                        <span className={styles.releaseArea}>{item.area}:</span> {item.text}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </details>
              )}

              <div className={styles.manualFooter}>
                ED2 Corp &middot; Work Orders &middot; {RELEASES[0]?.version ?? ''} &middot; 2026
              </div>
            </div>
          )}

        </div>{/* /.body */}
      </div>{/* /.panel */}
    </div>
  );
};

export default UserManualPanel;
