'use client';

/**
 * ClientSidebar — The single navigation surface for all non-platform-admin users.
 *
 * Design mirrors the Super Admin rail exactly:
 *  - same CSS tokens (--dash-*) from shell.module.css
 *  - same NavIcon component from nav-icons.tsx
 *  - same brand header, collapse button, group headers, nav links, footer
 *
 * Structure: brand → collapse btn → grouped nav → footer (clock + profile)
 *
 * Grouped by CLIENT_NAV_GROUPS from app-navigation.ts.
 * Planned items render disabled — never carry fake data.
 */

import React, { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon } from '@/components/nav-icons';
import {
  CLIENT_NAV_ITEMS,
  type ClientNavGroupDef,
  type ClientNavItem,
  resolveClientNavigation,
} from '@/lib/app-navigation';
import styles from './ClientSidebar.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSidebarProps {
  role: 'owner' | 'executive' | 'admin' | 'manager' | 'member' | 'viewer';
  packageFeatures: string[];
  grantedPermissions: string[];
  orgName: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  clock?: { day: string; time: string; iso: string } | null;
  userFullName?: string;
  userAvatarUrl?: string | null;
  userRole?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientSidebar({
  role,
  packageFeatures,
  grantedPermissions,
  orgName,
  collapsed,
  onToggleCollapse,
  clock,
  userFullName = '',
  userAvatarUrl,
  userRole = '',
}: ClientSidebarProps) {
  const pathname = usePathname() ?? '';

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(['client-home', 'client-integrations', 'client-intelligence']),
  );

  const resolvedGroups: ClientNavGroupDef[] = resolveClientNavigation({
    role,
    packageFeatures,
    grantedPermissions,
  });

  const itemById = new Map<string, ClientNavItem>(CLIENT_NAV_ITEMS.map((i) => [i.id, i]));

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleGroupKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, groupId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleGroup(groupId);
      }
    },
    [toggleGroup],
  );

  const navRef = useRef<HTMLElement>(null);
  const handleNavKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const focusable = Array.from(
      navRef.current?.querySelectorAll<HTMLElement>(
        'a:not([aria-disabled="true"]), button',
      ) ?? [],
    );
    const current = document.activeElement as HTMLElement;
    const idx = focusable.indexOf(current);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? focusable[idx + 1] : focusable[idx - 1];
    next?.focus();
  }, []);

  const profileActive = pathname.startsWith('/app/profile');

  return (
    <aside
      className={`${styles.sidebar}${collapsed ? ` ${styles.sidebarCollapsed}` : ''}`}
      aria-label="Main navigation"
    >
      {/* ── Skip link ── */}
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>

      {/* ── Brand ── */}
      <div className={styles.brand}>
        <img src="/brand/logo-hex.png" alt="" className={styles.brandIcon} />
        {!collapsed && (
          <div className={styles.brandText}>
            <div className={styles.brandName}>
              Ellines <span>EIP</span>
            </div>
            <div className={styles.brandSub}>Intelligence Platform</div>
          </div>
        )}
      </div>

      {/* ── Collapse toggle ── */}
      <button
        type="button"
        className={styles.collapseBtn}
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {collapsed ? (
            <path d="M9 6l6 6-6 6" />
          ) : (
            <path d="M15 6l-6 6 6 6" />
          )}
        </svg>
      </button>

      {/* ── Navigation ── */}
      <nav
        ref={navRef}
        className={styles.nav}
        aria-label="Main navigation"
        onKeyDown={handleNavKeyDown}
      >
        {resolvedGroups.map((group) => {
          const isOpen = openGroups.has(group.id) || !group.collapsible;

          return (
            <div key={group.id} className={styles.navGroup}>
              {/* Group header */}
              {group.collapsible ? (
                <button
                  type="button"
                  className={styles.navGroupHeader}
                  onClick={() => toggleGroup(group.id)}
                  onKeyDown={(e) => handleGroupKeyDown(e, group.id)}
                  aria-expanded={isOpen}
                  aria-controls={`csg-${group.id}`}
                >
                  {!collapsed && (
                    <span className={styles.navGroupLabel}>{group.label}</span>
                  )}
                  <span
                    className={`${styles.navGroupChevron}${isOpen ? ` ${styles.navGroupChevronOpen}` : ''}`}
                    aria-hidden
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>
              ) : (
                !collapsed && group.label ? (
                  <div className={styles.navGroupLabel}>{group.label}</div>
                ) : null
              )}

              {/* Group items */}
              {(isOpen || collapsed) && (
                <div id={`csg-${group.id}`}>
                  {group.itemIds.map((itemId) => {
                    const item = itemById.get(itemId);
                    if (!item) return null;

                    const isActive =
                      pathname === item.href ||
                      (item.href !== '/app' && pathname.startsWith(`${item.href}/`));

                    if (!item.available) {
                      return (
                        <span
                          key={item.id}
                          className={`${styles.navLink} ${styles.navLinkPlanned}`}
                          aria-disabled="true"
                          title={item.note ?? `${item.label} — planned`}
                          role="link"
                          aria-label={`${item.label} — Planned`}
                        >
                          <span className={styles.navIcon}>
                            <NavIcon id={item.icon} />
                          </span>
                          {!collapsed && (
                            <span className={styles.navLabel}>{item.label}</span>
                          )}
                        </span>
                      );
                    }

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={`${styles.navLink}${isActive ? ` ${styles.navActive}` : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className={styles.navIcon}>
                          <NavIcon id={item.icon} />
                        </span>
                        {!collapsed && (
                          <span className={styles.navLabel}>{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Footer: clock + profile ── */}
      <div className={styles.sidebarFooter}>
        {clock && (
          <time className={styles.railClock} dateTime={clock.iso} title="Local date and time">
            <span className={styles.railClockDay}>{clock.day}</span>
            <span className={styles.railClockTime}>{clock.time}</span>
          </time>
        )}

        <Link
          href="/app/profile"
          className={`${styles.profile}${profileActive ? ` ${styles.profileActive}` : ''}`}
          title={collapsed ? userFullName : 'Open profile'}
          aria-label={`Open profile for ${userFullName}`}
        >
          <div className={styles.avatar}>
            {userAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userAvatarUrl} alt="" className={styles.avatarImg} />
            ) : (
              initials(userFullName)
            )}
            <span className={styles.avatarStatus} aria-hidden />
          </div>
          {!collapsed && (
            <>
              <div className={styles.profileMeta}>
                <div className={styles.profileName}>{userFullName}</div>
                <div className={styles.profileRole}>{userRole}</div>
              </div>
              <span className={styles.profileChevron} aria-hidden>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </>
          )}
        </Link>
      </div>
    </aside>
  );
}
