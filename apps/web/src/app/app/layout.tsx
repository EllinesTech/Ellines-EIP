'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState, type DragEvent } from 'react';
import { isOrgAdminRole, isOrgOwnerRole, formatOrgDateTime } from '@ellines-eip/shared';
import EllineaChatPanel from '@/components/ellinea-chat';
import {
  AuthSession,
  cacheOrgDateTimeSettings,
  clearSession,
  DATETIME_PREFS_EVENT,
  fetchOrgDateTimeSettings,
  getSession,
  PROFILE_UPDATED_EVENT,
  readCachedOrgDateTimeSettings,
  refreshSessionFlags,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import {
  DEFAULT_UI_PREFS,
  readUiPrefs,
  UI_PREFS_EVENT,
  type UiPrefs,
} from '@/lib/ui-prefs';
import {
  mergeNavOrder,
  readNavOrder,
  reorderNavHrefs,
  writeNavOrder,
} from '@/lib/nav-order';
import {
  ORG_UI_POLICY_EVENT,
  readOrgUiPolicy,
  type OrgUiPolicy,
} from '@/lib/org-ui-policy';
import styles from './shell.module.css';

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  platformOnly?: boolean;
  icon: ReactNode;
};

const COLLAPSE_KEY = 'eip_nav_collapsed';

function IconOverview() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconEllinea() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  );
}

function IconConnectors() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 12h8" />
      <path d="M6 8a3 3 0 110 6H5a3 3 0 010-6h1z" />
      <path d="M18 8h1a3 3 0 110 6h-1a3 3 0 110-6z" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
    </svg>
  );
}

function IconPlatform() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </svg>
  );
}

function IconTimeline() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4v16" />
      <circle cx="12" cy="7" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
    </svg>
  );
}

function IconNotifications() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 9a6 6 0 0112 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  );
}

function IconApprovals() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 11l3 3L20 6" />
      <path d="M4 6h8M4 12h5M4 18h12" />
    </svg>
  );
}

function IconReports() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconRules() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7h14M5 12h10M5 17h7" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </svg>
  );
}

function IconAudit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 6h11M8 12h11M8 18h8" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" />
    </svg>
  );
}

function IconDragHandle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 7h8M8 12h8M8 17h8" />
    </svg>
  );
}

function IconFleet() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 16h13V8H3z" />
      <path d="M16 10h3l2 3v3h-5v-6z" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c1.2-2.8 3.2-4.2 6-4.2S16.8 16.2 18 19" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M19.5 19c.7-1.6 1.5-2.6 2.5-3.2" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/app', label: 'Overview', icon: <IconOverview /> },
  { href: '/app/timeline', label: 'Timeline', icon: <IconTimeline /> },
  { href: '/app/notifications', label: 'Notifications', icon: <IconNotifications /> },
  { href: '/app/approvals', label: 'Approvals', icon: <IconApprovals /> },
  { href: '/app/fleet', label: 'Fleet', icon: <IconFleet /> },
  { href: '/app/people', label: 'People', icon: <IconPeople /> },
  { href: '/app/rules', label: 'Rules', icon: <IconRules />, adminOnly: true },
  { href: '/app/reports', label: 'Reports', icon: <IconReports />, adminOnly: true },
  { href: '/app/connectors', label: 'Connectors', icon: <IconConnectors />, adminOnly: true },
  { href: '/app/admin', label: 'Org Admin', icon: <IconAdmin />, adminOnly: true },
  { href: '/app/audit', label: 'Audit', icon: <IconAudit />, adminOnly: true },
  { href: '/app/platform', label: 'Platform', icon: <IconPlatform />, platformOnly: true },
  { href: '/app/ellinea-console', label: 'Ellinea Console', icon: <IconEllinea />, adminOnly: true },
  { href: '/app/settings', label: 'System Settings', icon: <IconSettings /> },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);
  const [searchQ, setSearchQ] = useState('');
  const [dateTimePrefs, setDateTimePrefs] = useState<OrgDateTimeSettingsDto>({
    timeFormat: '12h',
    dateStyle: 'short',
  });
  const [clock, setClock] = useState<{ day: string; time: string; iso: string } | null>(null);
  const [navOrder, setNavOrder] = useState<string[] | null>(null);
  const [editingNav, setEditingNav] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const [dropTargetHref, setDropTargetHref] = useState<string | null>(null);
  const [orgUiPolicy, setOrgUiPolicy] = useState<OrgUiPolicy>({
    hideAskFromWorkUsers: false,
  });

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSessionState(s);
    setUiPrefs(readUiPrefs());
    const cached = readCachedOrgDateTimeSettings(s.organization.id);
    if (cached) setDateTimePrefs(cached);
    const orgAdmin = isOrgAdminRole(s.user.role);
    const platformAdmin = Boolean(s.isPlatformAdmin);
    const isAdminShell = orgAdmin || platformAdmin;
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === '1' || stored === '0') {
      setCollapsed(stored === '1');
    } else {
      setCollapsed(!isAdminShell);
    }
    if (orgAdmin) {
      setNavOrder(readNavOrder(s.organization.id, s.user.id));
    }
    setOrgUiPolicy(readOrgUiPolicy(s.organization.id));
    setReady(true);
    refreshSessionFlags()
      .then((next) => {
        if (next) setSessionState(next);
      })
      .catch(() => {
        /* keep local session if /me is briefly unavailable */
      });
    fetchOrgDateTimeSettings()
      .then((prefs) => {
        setDateTimePrefs(prefs);
        cacheOrgDateTimeSettings(s.organization.id, prefs);
      })
      .catch(() => {
        /* keep defaults / cache if settings endpoint is briefly unavailable */
      });
  }, [router]);

  useEffect(() => {
    function onPrefs(e: Event) {
      const detail = (e as CustomEvent<{ orgId: string; settings: OrgDateTimeSettingsDto }>).detail;
      const s = getSession();
      if (!detail || !s || detail.orgId !== s.organization.id) return;
      setDateTimePrefs(detail.settings);
    }
    function onProfile(e: Event) {
      const detail = (e as CustomEvent<AuthSession>).detail;
      if (detail) setSessionState(detail);
    }
    function onUiPrefs(e: Event) {
      const detail = (e as CustomEvent<UiPrefs>).detail;
      if (detail) setUiPrefs(detail);
    }
    function onOrgPolicy(e: Event) {
      const detail = (e as CustomEvent<{ orgId: string; policy: OrgUiPolicy }>).detail;
      const s = getSession();
      if (!detail || !s || detail.orgId !== s.organization.id) return;
      setOrgUiPolicy(detail.policy);
    }
    window.addEventListener(DATETIME_PREFS_EVENT, onPrefs);
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfile);
    window.addEventListener(UI_PREFS_EVENT, onUiPrefs);
    window.addEventListener(ORG_UI_POLICY_EVENT, onOrgPolicy);
    return () => {
      window.removeEventListener(DATETIME_PREFS_EVENT, onPrefs);
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfile);
      window.removeEventListener(UI_PREFS_EVENT, onUiPrefs);
      window.removeEventListener(ORG_UI_POLICY_EVENT, onOrgPolicy);
    };
  }, []);

  useEffect(() => {
    const tick = () => setClock(formatOrgDateTime(new Date(), dateTimePrefs));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [dateTimePrefs]);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!ready || !session) {
    return (
      <div className={styles.loading} suppressHydrationWarning>
        <div className={styles.loadingInner}>
          <img src="/brand/logo-hex.png" alt="" className={styles.loadingMark} />
          <p>Loading Ellines EIP…</p>
        </div>
      </div>
    );
  }

  const orgAdmin = isOrgAdminRole(session.user.role);
  const platformAdmin = Boolean(session.isPlatformAdmin);
  const isClientShell = !orgAdmin && !platformAdmin;
  const filteredNav = NAV.filter((item) => {
    if (item.adminOnly && !orgAdmin) return false;
    if (item.platformOnly && !platformAdmin) return false;
    if (item.href === '/app/approvals' && !uiPrefs.showApprovalsNav) return false;
    return true;
  }).map((item) =>
    item.href === '/app/admin'
      ? {
          ...item,
          label: isOrgOwnerRole(session.user.role) ? 'Org Admin' : 'IT Admin',
        }
      : item,
  );
  const defaultHrefs = filteredNav.map((item) => item.href);
  const orderedHrefs = orgAdmin
    ? mergeNavOrder(defaultHrefs, navOrder)
    : defaultHrefs;
  const byHref = new Map(filteredNav.map((item) => [item.href, item]));
  const visibleNav = orderedHrefs
    .map((href) => byHref.get(href))
    .filter((item): item is NavItem => Boolean(item));

  function persistNavOrder(hrefs: string[]) {
    if (!session) return;
    setNavOrder(hrefs);
    writeNavOrder(session.organization.id, session.user.id, hrefs);
  }

  function onNavDragStart(href: string, e: DragEvent) {
    if (!editingNav) return;
    setDragHref(href);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', href);
  }

  function onNavDragOver(href: string, e: DragEvent) {
    if (!editingNav) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragHref && dragHref !== href) {
      setDropTargetHref(href);
    }
  }

  function onNavDrop(href: string, e: DragEvent) {
    if (!editingNav) return;
    e.preventDefault();
    const from = dragHref || e.dataTransfer.getData('text/plain');
    setDragHref(null);
    setDropTargetHref(null);
    if (!from || from === href) return;
    persistNavOrder(reorderNavHrefs(orderedHrefs, from, href));
  }

  function onNavDragEnd() {
    setDragHref(null);
    setDropTargetHref(null);
  }
  const pageTitle =
    pathname.startsWith('/app/ellinea-console')
      ? 'Ellinea Console'
      : pathname.startsWith('/app/ellinea')
      ? 'Ask Ellinea'
      : pathname.startsWith('/app/connectors')
        ? 'Connectors'
        : pathname.startsWith('/app/admin')
          ? 'IT Admin'
          : pathname.startsWith('/app/platform')
            ? 'Platform'
              : pathname.startsWith('/app/notifications')
                ? 'Notifications'
                : pathname.startsWith('/app/approvals')
                  ? 'Approvals'
                : pathname.startsWith('/app/audit')
                  ? 'Audit Center'
                : pathname.startsWith('/app/rules')
                  ? 'Business Rules'
                : pathname.startsWith('/app/reports')
                  ? 'Scheduled Reports'
                : pathname.startsWith('/app/notify-policy')
                  ? 'Delivery policy'
                : pathname.startsWith('/app/fleet')
                  ? 'Fleet'
                : pathname.startsWith('/app/people')
                  ? 'People'
                : pathname.startsWith('/app/search')
                  ? 'Enterprise Search'
                  : pathname.startsWith('/app/timeline')
                    ? 'Enterprise Timeline'
                    : pathname.startsWith('/app/profile')
                      ? 'Profile'
                      : pathname.startsWith('/app/settings')
                        ? 'System Settings'
                        : 'EIP Dashboard — Overview';

  const profileActive = pathname.startsWith('/app/profile');
  const showAskFloat =
    uiPrefs.ellineaShowAskFloat !== false &&
    (orgAdmin || !orgUiPolicy.hideAskFromWorkUsers);
  const phoneNav = [
    { href: '/app', label: 'Home', icon: <IconOverview />, match: (p: string) => p === '/app' || p === '/app/' },
    {
      href: '/app/fleet',
      label: 'Fleet',
      icon: <IconFleet />,
      match: (p: string) => p.startsWith('/app/fleet'),
    },
    {
      href: '/app/people',
      label: 'People',
      icon: <IconPeople />,
      match: (p: string) => p.startsWith('/app/people'),
    },
    {
      href: '/app/notifications',
      label: 'Alerts',
      icon: <IconNotifications />,
      match: (p: string) => p.startsWith('/app/notifications'),
    },
    {
      href: '/app/settings',
      label: 'More',
      icon: <IconSettings />,
      match: (p: string) =>
        p.startsWith('/app/settings') || p.startsWith('/app/profile'),
    },
  ];

  return (
    <div
      className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`}
      data-theme={uiPrefs.theme}
      data-accent={uiPrefs.accent}
      data-density={uiPrefs.density}
      data-reduce-motion={uiPrefs.reduceMotion ? 'true' : 'false'}
    >
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/brand/logo-hex.png" alt="" className={styles.brandIcon} />
          <div className={styles.brandText}>
            <div className={styles.brandName}>
              Ellines <span>EIP</span>
            </div>
            <div className={styles.brandSub}>Intelligence Platform</div>
          </div>
        </div>

        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {collapsed ? (
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>

        <nav
          className={`${styles.nav} ${editingNav ? styles.navEditing : ''}`}
          aria-label="Workspace"
        >
          {orgAdmin && !collapsed ? (
            <div className={styles.navEditBar}>
              <button
                type="button"
                className={styles.navEditBtn}
                onClick={() => {
                  setEditingNav((v) => !v);
                  setDragHref(null);
                }}
                aria-pressed={editingNav}
              >
                {editingNav ? 'Done' : 'Edit nav'}
              </button>
            </div>
          ) : null}
          {visibleNav.map((item) => {
            const active =
              item.href === '/app'
                ? pathname === '/app' || pathname === '/app/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const dragging = dragHref === item.href;
            const dropTarget = dropTargetHref === item.href && dragHref !== item.href;
            if (editingNav) {
              return (
                <div
                  key={item.href}
                  className={[
                    styles.navRow,
                    dragging ? styles.navRowDragging : '',
                    dropTarget ? styles.navRowDropTarget : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable
                  onDragStart={(e) => onNavDragStart(item.href, e)}
                  onDragOver={(e) => onNavDragOver(item.href, e)}
                  onDrop={(e) => onNavDrop(item.href, e)}
                  onDragEnd={onNavDragEnd}
                >
                  <span className={styles.navHandle} aria-hidden title="Drag to reorder">
                    <IconDragHandle />
                  </span>
                  <span
                    className={
                      active ? `${styles.navLink} ${styles.navActive}` : styles.navLink
                    }
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? `${styles.navLink} ${styles.navActive}` : styles.navLink}
                title={item.label}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          {clock ? (
            <time className={styles.railClock} dateTime={clock.iso} title="Local date and time">
              <span className={styles.railClockDay}>{clock.day}</span>
              <span className={styles.railClockTime}>{clock.time}</span>
            </time>
          ) : (
            <div className={styles.railClock} aria-hidden>
              <span className={styles.railClockDay}>···</span>
            </div>
          )}
          <Link
            href="/app/profile"
            className={profileActive ? `${styles.profile} ${styles.profileActive}` : styles.profile}
            title="Open profile"
            aria-label={`Open profile for ${session.user.fullName}`}
          >
            <div className={styles.avatar}>
              {session.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.avatarUrl} alt="" className={styles.avatarImg} />
              ) : (
                initials(session.user.fullName)
              )}
              <span className={styles.avatarStatus} aria-hidden />
            </div>
            <div className={styles.profileMeta}>
              <div className={styles.profileName}>{session.user.fullName}</div>
              <div className={styles.profileRole}>
                {session.user.title || session.user.role}
                {platformAdmin ? ' · platform' : ''}
              </div>
            </div>
            <span className={styles.profileChevron} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            {isClientShell ? (
              <div className={styles.workspaceTabs}>
                <span className={`${styles.workspaceTab} ${styles.workspaceTabActive}`}>Overview</span>
              </div>
            ) : (
              <div className={styles.orgBlock}>
                <div className={styles.orgName}>{pageTitle}</div>
                <div className={styles.roleLabel}>
                  {session.organization.name} · {session.user.role}
                  {platformAdmin ? ' · platform' : ''}
                </div>
              </div>
            )}
          </div>

          <div className={styles.topCenter}>
            <form
              className={styles.search}
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchQ.trim();
                router.push(q ? `/app/search/?q=${encodeURIComponent(q)}` : '/app/search/');
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                type="search"
                placeholder="Search anything..."
                aria-label="Search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </form>
          </div>

          <div className={styles.topRight}>
            <Link
              href="/app/notifications"
              className={styles.iconBtn}
              aria-label="Notifications"
              title="Notifications"
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9a6 6 0 0112 0c0 7 3 7 3 7H3s3 0 3-7" />
                <path d="M10 19a2 2 0 004 0" />
              </svg>
              {uiPrefs.notifyBadge ? <span className={styles.badge} /> : null}
            </Link>
            <Link
              href="/app/profile"
              className={styles.topAvatar}
              title="Profile"
              aria-label="Open profile"
            >
              {session.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.avatarUrl} alt="" className={styles.topAvatarImg} />
              ) : (
                initials(session.user.fullName)
              )}
            </Link>
            <button type="button" className={styles.signOut} onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
        <footer className={styles.appFooter}>
          <div className={styles.appFooterInner}>
            <span className={styles.appFooterBrand}>Ellines EIP</span>
            <span className={styles.appFooterDot} aria-hidden>
              ·
            </span>
            <span>Developed by Ellines Tech</span>
            <span className={styles.appFooterDot} aria-hidden>
              ·
            </span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>

      {!chatOpen && showAskFloat ? (
        <button type="button" className={styles.fab} onClick={() => setChatOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M21 12a8.5 8.5 0 01-8.5 8.5H7l-4 3V12A8.5 8.5 0 0112.5 3.5 8.5 8.5 0 0121 12z" />
          </svg>
          Ask Ellinea AI
        </button>
      ) : null}

      <nav className={styles.phoneBottomNav} aria-label="Phone companion">
        {phoneNav.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? `${styles.phoneNavLink} ${styles.phoneNavActive}` : styles.phoneNavLink}
            >
              <span className={styles.phoneNavIcon}>{item.icon}</span>
              <span className={styles.phoneNavLabel}>{item.label}</span>
            </Link>
          );
        })}
        {showAskFloat ? (
          <button
            type="button"
            className={
              chatOpen || pathname.startsWith('/app/ellinea')
                ? `${styles.phoneNavLink} ${styles.phoneNavActive}`
                : styles.phoneNavLink
            }
            onClick={() => setChatOpen(true)}
            aria-label="Ask Ellinea AI"
          >
            <span className={styles.phoneNavIcon}>
              <IconEllinea />
            </span>
            <span className={styles.phoneNavLabel}>Ask</span>
          </button>
        ) : null}
      </nav>

      <EllineaChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
