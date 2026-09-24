'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState, type DragEvent } from 'react';
import { isOrgAdminRole, isOrgOwnerRole, formatOrgDateTime } from '@ellines-eip/shared';
import EllineaChatPanel from '@/components/ellinea-chat';
import {
  IconDragHandle,
  IconEllinea,
  IconFleet,
  IconGlance,
  IconOverview,
  IconPeople,
  IconSettings,
  NavIcon,
} from '@/components/nav-icons';
import {
  collectActiveGroupIds,
  isNavItemActive,
  resolveNavigation,
  type NavContext,
  type ResolvedNavGroup,
  type ResolvedNavItem,
} from '@/lib/app-navigation';
import { OrgSwitcher } from '@/components/org-switcher';
import {
  AuthSession,
  cacheOrgDateTimeSettings,
  clearSession,
  DATETIME_PREFS_EVENT,
  fetchOrgDateTimeSettings,
  getSession,
  listApprovals,
  PROFILE_UPDATED_EVENT,
  readCachedOrgDateTimeSettings,
  refreshSessionFlags,
  setSession,
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
  readNavGroupState,
  readNavOrder,
  reorderNavHrefs,
  writeNavGroupState,
  writeNavOrder,
} from '@/lib/nav-order';
import {
  ORG_UI_POLICY_EVENT,
  readOrgUiPolicy,
  type OrgUiPolicy,
} from '@/lib/org-ui-policy';
import styles from './shell.module.css';

const COLLAPSE_KEY = 'eip_nav_collapsed';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw ?? '';
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [platformSection, setPlatformSection] = useState('');
  const [orgUiPolicy, setOrgUiPolicy] = useState<OrgUiPolicy>({
    hideAskFromWorkUsers: false,
    allowWorkRolesOrgSystem: false,
  });
  const [notifyUnread, setNotifyUnread] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPlatformSection(new URLSearchParams(window.location.search).get('section') ?? '');
  }, [pathname]);

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
    setOpenGroups(readNavGroupState());
    setReady(true);
    refreshSessionFlags()
      .then((next) => {
        if (next) setSessionState(next);
      })
      .catch(() => {
        /* keep local session if /me is briefly unavailable */
      });
    
    // Skip org-scoped API calls when on platform page (Super Admin control plane)
    const onPlatformPage = pathname === '/app/platform';
    
    if (!onPlatformPage) {
      fetchOrgDateTimeSettings()
        .then((prefs) => {
          setDateTimePrefs(prefs);
          cacheOrgDateTimeSettings(s.organization.id, prefs);
        })
        .catch(() => {
          /* keep defaults / cache if settings endpoint is briefly unavailable */
        });
      // Poll notification unread count every 30s
      function pollNotifyCount() {
        listApprovals()
          .then((appr) => {
            const pending = appr.filter((a) => a.status === 'pending').length;
            setNotifyUnread(pending);
          })
          .catch(() => {/* ignore */});
      }
      pollNotifyCount();
      const pollId = window.setInterval(pollNotifyCount, 30_000);
      return () => window.clearInterval(pollId);
    }
  }, [router]);

  /**
   * The rail is one hierarchy: keep the group that owns the active destination open so the
   * current view is always visible, while still letting the operator collapse it afterwards.
   */
  useEffect(() => {
    if (!ready || !session) return;
    const ctx: NavContext = {
      isPlatformAdmin: Boolean(session.isPlatformAdmin),
      isOrgAdmin: isOrgAdminRole(session.user.role),
      isOwner: isOrgOwnerRole(session.user.role),
      orgSystemAccess: isOrgAdminRole(session.user.role) || orgUiPolicy.allowWorkRolesOrgSystem,
      showApprovals: uiPrefs.showApprovalsNav,
    };
    const activeGroupIds = resolveNavigation(ctx).reduce<string[]>(
      (acc, group) =>
        collectActiveGroupIds(group, (item) => isNavItemActive(item, pathname, platformSection), acc),
      [],
    );
    if (!activeGroupIds.length) return;
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of activeGroupIds) {
        if (next[id] === false) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ready, session, pathname, platformSection, orgUiPolicy, uiPrefs.showApprovalsNav]);

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
  const orgSystemAllowed = orgAdmin || orgUiPolicy.allowWorkRolesOrgSystem;

  /** Build the navigation tree for the current operator. */
  const navCtx: NavContext = {
    isPlatformAdmin: platformAdmin,
    isOrgAdmin: orgAdmin,
    isOwner: isOrgOwnerRole(session.user.role),
    orgSystemAccess: orgSystemAllowed,
    showApprovals: uiPrefs.showApprovalsNav,
  };
  const navGroups = resolveNavigation(navCtx);

  /**
   * For the Work Console (non-platform-admin) we still support drag-reorder.
   * The flat ordered href list is derived from the single workspace group.
   */
  const workspaceItems = platformAdmin
    ? []
    : (navGroups[0]?.items ?? []);
  const defaultHrefs = workspaceItems.map((item) => item.href);
  const orderedHrefs = orgAdmin ? mergeNavOrder(defaultHrefs, navOrder) : defaultHrefs;
  const byHref = new Map(workspaceItems.map((item) => [item.href, item]));
  const orderedWorkspaceItems = orderedHrefs
    .map((href) => byHref.get(href))
    .filter((item): item is ResolvedNavItem => Boolean(item));

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

  /** Toggle a nav group open/closed and persist the choice. */
  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeNavGroupState(next);
      return next;
    });
  }

  /** Whether a group is expanded (default open unless explicitly closed). */
  function isGroupOpen(group: ResolvedNavGroup): boolean {
    if (group.id in openGroups) return openGroups[group.id];
    return group.defaultOpen;
  }

  /** Render a single nav item as a Link (live) or span (planned/disabled). */
  function renderNavItem(item: ResolvedNavItem, activeOverride?: boolean, isPlannedOverride?: boolean) {
    const active = activeOverride ?? isNavItemActive(item, pathname, platformSection);
    const isPlanned = isPlannedOverride ?? (item.available === false);
    const linkClass = [
      styles.navLink,
      active ? styles.navActive : '',
      isPlanned ? styles.navLinkPlanned : '',
    ]
      .filter(Boolean)
      .join(' ');
    const navLabel = item.resolvedLabel;
    const title = isPlanned ? `${navLabel} — planned` : navLabel;
    if (isPlanned) {
      return (
        <span key={item.id} className={linkClass} title={title} aria-disabled="true">
          <span className={styles.navIcon}><NavIcon id={item.icon} /></span>
          <span className={styles.navLabel}>{navLabel}</span>
        </span>
      );
    }
    return (
      <Link key={item.id} href={item.href} className={linkClass} title={navLabel}>
        <span className={styles.navIcon}><NavIcon id={item.icon} /></span>
        <span className={styles.navLabel}>{navLabel}</span>
      </Link>
    );
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
                : pathname.startsWith('/app/automation')
                  ? 'Automation Agents'
                : pathname.startsWith('/app/notify-policy')
                  ? 'Delivery policy'
                : pathname.startsWith('/app/fleet')
                  ? 'Fleet'
                : pathname.startsWith('/app/people')
                  ? 'People'
                : pathname.startsWith('/app/glance')
                  ? 'Live glance'
                : pathname.startsWith('/app/inbox')
                  ? 'Work email'
                : pathname.startsWith('/app/org-data')
                  ? 'Organization Data'
                : pathname.startsWith('/app/org-system')
                  ? 'Organization System'
                : pathname.startsWith('/app/search')
                  ? 'Enterprise Search'
                  : pathname.startsWith('/app/documents')
                    ? 'Document Hub'
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
      href: '/app/glance',
      label: 'Glance',
      icon: <IconGlance />,
      match: (p: string) => p.startsWith('/app/glance'),
    },
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
      href: '/app/settings',
      label: 'More',
      icon: <IconSettings />,
      match: (p: string) =>
        p.startsWith('/app/settings') ||
        p.startsWith('/app/profile') ||
        p.startsWith('/app/inbox') ||
        p.startsWith('/app/notifications'),
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
          {/* ── Super Admin grouped rail (platform admins only) ── */}
          {platformAdmin ? (
            <>
              {navGroups.map((group) => {
                const groupOpen = group.id in openGroups ? openGroups[group.id] : group.defaultOpen;
                return (
                  <div key={group.id} className={styles.navGroup}>
                    {group.label ? (
                      <button
                        type="button"
                        className={styles.navGroupHeader}
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={groupOpen}
                      >
                        <span className={styles.navGroupLabel}>{group.label}</span>
                        <span className={`${styles.navGroupChevron} ${groupOpen ? styles.navGroupChevronOpen : ''}`} aria-hidden>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                    ) : null}
                    {groupOpen ? (
                      <>
                        {group.items.map((item) => renderNavItem(item))}
                        {group.subGroups.map((sub) => {
                          const subOpen = sub.id in openGroups ? openGroups[sub.id] : sub.defaultOpen;
                          return (
                            <div key={sub.id} className={styles.navSubGroup}>
                              {sub.label ? (
                                <button
                                  type="button"
                                  className={styles.navSubGroupHeader}
                                  onClick={() => toggleGroup(sub.id)}
                                  aria-expanded={subOpen}
                                >
                                  <span className={styles.navGroupLabel}>{sub.label}</span>
                                  <span className={`${styles.navGroupChevron} ${subOpen ? styles.navGroupChevronOpen : ''}`} aria-hidden>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </span>
                                </button>
                              ) : null}
                              {subOpen
                                ? sub.items.map((item) => renderNavItem(item))
                                : null}
                            </div>
                          );
                        })}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : (
            /* ── Work Console flat rail (all other roles) ── */
            <>
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
              {orderedWorkspaceItems.map((item) => {
                const active = isNavItemActive(item, pathname, platformSection);
                const dragging = dragHref === item.href;
                const dropTarget = dropTargetHref === item.href && dragHref !== item.href;
                const isPlanned = item.available === false;
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
                      <span className={[styles.navLink, active ? styles.navActive : ''].filter(Boolean).join(' ')}>
                        <span className={styles.navIcon}><NavIcon id={item.icon} /></span>
                        <span className={styles.navLabel}>{item.resolvedLabel}</span>
                      </span>
                    </div>
                  );
                }
                return renderNavItem(item, active, isPlanned);
              })}
            </>
          )}
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
                <div className={styles.roleLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <OrgSwitcher
                    session={session}
                    onSwitch={(next) => {
                      setSessionState(next);
                      setSession(next);
                    }}
                  />
                  <span style={{ opacity: 0.5 }}>·</span>
                  {session.user.role}
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
              aria-label={notifyUnread ? `Notifications (${notifyUnread} unread)` : 'Notifications'}
              title={notifyUnread ? `${notifyUnread} pending approval${notifyUnread > 1 ? 's' : ''}` : 'Notifications'}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9a6 6 0 0112 0c0 7 3 7 3 7H3s3 0 3-7" />
                <path d="M10 19a2 2 0 004 0" />
              </svg>
              {notifyUnread > 0 ? (
                <span className={styles.badge} style={{ background: '#ef4444', minWidth: 16, height: 16, borderRadius: 99, fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: '0 3px' }}>
                  {notifyUnread > 9 ? '9+' : notifyUnread}
                </span>
              ) : null}
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
