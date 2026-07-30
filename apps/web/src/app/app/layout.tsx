'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { AuthSession, clearSession, getSession } from '@/lib/api';
import styles from './shell.module.css';

const NAV = [
  { href: '/app', label: 'Command Center', short: 'Command' },
  { href: '/app/ellinea', label: 'Ask Ellinea', short: 'Ellinea' },
  { href: '/app/connectors', label: 'Connectors', short: 'Connect' },
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
          {NAV.map((item) => {
            const active = pathname === item.href;
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
            <div className={styles.roleLabel}>{session.user.role}</div>
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
