'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { isOrgAdminRole } from '@ellines-eip/shared';
import {
  AuthSession,
  clearSession,
  getSession,
  refreshSessionFlags,
} from '@/lib/api';
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

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: '/app', label: 'Overview', icon: <IconOverview /> },
  { href: '/app/ellinea', label: 'Ask Ellinea', icon: <IconEllinea /> },
  { href: '/app/connectors', label: 'Connectors', icon: <IconConnectors />, adminOnly: true },
  { href: '/app/admin', label: 'IT Admin', icon: <IconAdmin />, adminOnly: true },
  { href: '/app/platform', label: 'Platform', icon: <IconPlatform />, platformOnly: true },
  { href: '/app/settings', label: 'Settings', icon: <IconSettings /> },
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

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSessionState(s);
    const orgAdmin = isOrgAdminRole(s.user.role);
    const platformAdmin = Boolean(s.isPlatformAdmin);
    const isAdminShell = orgAdmin || platformAdmin;
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === '1' || stored === '0') {
      setCollapsed(stored === '1');
    } else {
      setCollapsed(!isAdminShell);
    }
    setReady(true);
    refreshSessionFlags()
      .then((next) => {
        if (next) setSessionState(next);
      })
      .catch(() => {
        /* keep local session if /me is briefly unavailable */
      });
  }, [router]);

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
  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly && !orgAdmin) return false;
    if (item.platformOnly && !platformAdmin) return false;
    return true;
  });
  const pageTitle =
    pathname.startsWith('/app/ellinea')
      ? 'Ask Ellinea'
      : pathname.startsWith('/app/connectors')
        ? 'Connectors'
        : pathname.startsWith('/app/admin')
          ? 'IT Admin'
          : pathname.startsWith('/app/platform')
            ? 'Platform'
            : pathname.startsWith('/app/settings')
              ? 'Settings'
              : 'EIP Dashboard — Overview';

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`}>
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

        <nav className={styles.nav} aria-label="Workspace">
          {visibleNav.map((item) => {
            const active =
              item.href === '/app'
                ? pathname === '/app' || pathname === '/app/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          <Link
            href="/app/settings"
            className={
              pathname.startsWith('/app/settings')
                ? `${styles.profile} ${styles.profileActive}`
                : styles.profile
            }
            title="Profile & settings"
          >
            <div className={styles.avatar}>
              {initials(session.user.fullName)}
              <span className={styles.avatarStatus} aria-hidden />
            </div>
            <div className={styles.profileMeta}>
              <div className={styles.profileName}>{session.user.fullName}</div>
              <div className={styles.profileRole}>
                {session.user.role}
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
            <label className={styles.search}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input type="search" placeholder="Search anything..." aria-label="Search" />
            </label>
          </div>

          <div className={styles.topRight}>
            <button type="button" className={styles.iconBtn} aria-label="Notifications" title="Notifications">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 9a6 6 0 0112 0c0 7 3 7 3 7H3s3 0 3-7" />
                <path d="M10 19a2 2 0 004 0" />
              </svg>
              <span className={styles.badge} />
            </button>
            <Link
              href="/app/settings"
              className={styles.topAvatar}
              title="Profile & settings"
              aria-label="Profile and settings"
            >
              {initials(session.user.fullName)}
            </Link>
            <button type="button" className={styles.signOut} onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>

      <Link href="/app/ellinea" className={styles.fab}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M21 12a8.5 8.5 0 01-8.5 8.5H7l-4 3V12A8.5 8.5 0 0112.5 3.5 8.5 8.5 0 0121 12z" />
        </svg>
        Ask Ellinea AI
      </Link>
    </div>
  );
}
