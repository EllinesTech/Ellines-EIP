'use client';

/**
 * ClientSidebar — Single navigation surface for client organization users.
 *
 * Rules:
 * - This is the ONLY sidebar for client org users. No second rail exists.
 * - Navigation is sourced exclusively from CLIENT_NAV_GROUPS + CLIENT_NAV_ITEMS in app-navigation.ts.
 * - resolveClientNavigation() enforces role + package filtering.
 * - No PlatformSectionId items are ever rendered here.
 *
 * Requirements: 1.2, 8.1, 8.2, 8.3, 8.8, 11.1, 11.5
 */

import React, { useState, useCallback, useRef, KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CLIENT_NAV_ITEMS,
  ClientNavGroupDef,
  resolveClientNavigation,
} from '../../lib/app-navigation';
import styles from './ClientSidebar.module.css';

// ─── Icon component ───────────────────────────────────────────────────────────

/** Minimal icon renderer — maps icon IDs to Unicode symbols or SVG fallbacks. */
function NavIcon({ id }: { id: string }) {
  // Simple symbol map — replace with SVG icon library as needed
  const symbols: Record<string, string> = {
    'dashboard': '⊞',
    'my-work': '✓',
    'attention': '⚠',
    'alerts': '🔔',
    'approvals': '✅',
    'timeline': '◷',
    'business-overview': '🏢',
    'performance': '📈',
    'analytics': '📊',
    'reports': '📋',
    'sales': '💰',
    'purchases': '🛒',
    'inventory': '📦',
    'customers': '👥',
    'suppliers': '🏭',
    'payments': '💳',
    'expenses': '💸',
    'assets': '🖥',
    'branches': '🏪',
    'warehouses': '🏗',
    'employees': '👤',
    'departments': '🏛',
    'attendance': '🕐',
    'leave': '📅',
    'payroll': '💵',
    'leads': '🎯',
    'opportunities': '✨',
    'activities': '📌',
    'follow-ups': '🔁',
    'connected-systems': '🔗',
    'connector-health': '❤',
    'integration-requests': '📬',
    'schedules': '⏱',
    'executions': '▶',
    'insights': '💡',
    'recommendations': '⭐',
    'business-settings': '⚙',
    'data-privacy': '🔒',
    'ellinea-ai': '🤖',
    // Fallbacks for shared NavIconIds used in CLIENT_NAV_ITEMS
    'people': '👥',
    'approvals-icon': '✅',
    'rules': '📏',
    'automation': '⚙',
    'connectors': '🔗',
    'notifications': '🔔',
    'audit': '📜',
    'access-control': '🔑',
  };
  return (
    <span aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>
      {symbols[id] ?? '•'}
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSidebarProps {
  role: 'owner' | 'executive' | 'admin' | 'manager' | 'member' | 'viewer';
  packageFeatures: string[];
  grantedPermissions: string[];
  orgName: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientSidebar({
  role,
  packageFeatures,
  grantedPermissions,
  orgName,
  collapsed,
  onToggleCollapse,
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

  const itemById = new Map(CLIENT_NAV_ITEMS.map((i) => [i.id, i]));

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

  // Nav list ref for arrow-key navigation
  const navRef = useRef<HTMLElement>(null);

  const handleNavKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const focusable = Array.from(
      navRef.current?.querySelectorAll<HTMLElement>('a:not([aria-disabled="true"]), button') ?? [],
    );
    const current = document.activeElement as HTMLElement;
    const idx = focusable.indexOf(current);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? focusable[idx + 1] : focusable[idx - 1];
    next?.focus();
  }, []);

  return (
    <aside
      className={styles.sidebar}
      data-collapsed={collapsed}
      aria-label="Business navigation"
    >
      {/* Skip nav link — first focusable element */}
      <a href="#main-content" className="srOnly" style={{ position: 'absolute' }}>
        Skip to main content
      </a>

      <div className={styles.sidebarHeader}>
        {!collapsed && (
          <span className={styles.orgName} title={orgName}>
            {orgName}
          </span>
        )}
        <button
          className={styles.collapseBtn}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      <nav
        ref={navRef}
        aria-label="Business navigation"
        onKeyDown={handleNavKeyDown}
      >
        <ul className={styles.nav} role="list">
          {resolvedGroups.map((group) => {
            const isOpen = openGroups.has(group.id) || !group.collapsible;

            return (
              <li key={group.id} className={styles.group} role="none">
                {group.collapsible && !collapsed && (
                  <button
                    className={styles.groupHeader}
                    onClick={() => toggleGroup(group.id)}
                    onKeyDown={(e) => handleGroupKeyDown(e, group.id)}
                    aria-expanded={isOpen}
                    aria-controls={`group-${group.id}`}
                  >
                    <span>{group.label}</span>
                    <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  </button>
                )}

                {(isOpen || collapsed) && (
                  <ul
                    id={`group-${group.id}`}
                    className={styles.groupItems}
                    role="list"
                  >
                    {group.itemIds.map((itemId) => {
                      const item = itemById.get(itemId);
                      if (!item) return null;

                      const isActive =
                        pathname === item.href ||
                        (item.href !== '/app' && pathname.startsWith(item.href + '/'));

                      if (!item.available) {
                        return (
                          <li key={item.id} role="none">
                            <span
                              className={`${styles.navLink} ${styles.navLinkDisabled}`}
                              aria-disabled="true"
                              title={item.note}
                              role="link"
                              aria-label={`${item.label} — Planned`}
                            >
                              <NavIcon id={item.icon} />
                              <span className={styles.itemLabel}>{item.label}</span>
                              <span className={styles.plannedBadge}>Planned</span>
                            </span>
                          </li>
                        );
                      }

                      return (
                        <li key={item.id} role="none">
                          <Link
                            href={item.href}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={item.label}
                          >
                            <NavIcon id={item.icon} />
                            <span className={styles.itemLabel}>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
