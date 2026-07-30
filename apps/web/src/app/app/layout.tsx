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
  short: string;
  adminOnly?: boolean;
  platformOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: '/app', label: 'Command Center', short: 'Command' },
  { href: '/app/ellinea', label: 'Ask Ellinea', short: 'Ellinea' },
  { href: '/app/admin', label: 'IT Admin', short: 'Admin', adminOnly: true },
  { href: '/app/connectors', label: 'Connectors', short: 'Connect', adminOnly: true },
  { href: '/app/platform', label: 'Platform', short: 'Platform', platformOnly: true },
  { href: '/app/settings', label: 'Settings', short: 'Settings' },
];

export default function AppShellLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSessionState(s);
    setReady(true);
    refreshSessionFlags()
      .then((next) => {
        if (next) setSessionState(next);
      })
      .catch(() => {
        /* keep local session if /me is briefly unavailable */
      });
  }, [router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!ready || !session) {
    return (
      <div className={styles.loading} suppressHydrationWarning>
        <div className={styles.loadingInner}>
          <img src="/brand/logo-mark.png" alt="" className={styles.loadingMark} />
          <p>Loading Ellines EIP…</p>
        </div>
      </div>
    );
  }

  const orgAdmin = isOrgAdminRole(session.user.role);
  const platformAdmin = Boolean(session.isPlatformAdmin);
  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly && !orgAdmin) return false;
    if (item.platformOnly && !platformAdmin) return false;
    return true;
  });

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/brand/logo-mark.png" alt="" className={styles.brandIcon} />
          <div>
            <div className={styles.brandName}>
              Ellines <span>EIP</span>
            </div>
            <div className={styles.brandSub}>Intelligence Platform</div>
          </div>
        </div>

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
              >
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.navShort}>{item.short}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.powered}>
            <span>Powered by</span>
            <img src="/brand/ellinea-mark.png" alt="Ellinea AI" className={styles.ellineaFoot} />
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.orgBlock}>
            <div className={styles.orgName}>{session.organization.name}</div>
            <div className={styles.roleLabel}>
              {session.user.role}
              {platformAdmin ? ' · platform' : ''}
            </div>
          </div>
          <div className={styles.topRight}>
            <span className={styles.userName}>{session.user.fullName}</span>
            <button type="button" className={styles.signOut} onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
