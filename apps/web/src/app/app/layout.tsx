'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { AuthSession, clearSession, getSession } from '@/lib/api';
import styles from './shell.module.css';

const NAV = [
  { href: '/app', label: 'Command Center' },
  { href: '/app/ellinea', label: 'Ask Ellinea' },
  { href: '/app/connectors', label: 'Connectors' },
  { href: '/app/settings', label: 'Settings' },
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
      <div className={styles.loading}>
        <p>Loading Ellines EIP…</p>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/brand/logo-icon.png" alt="" className={styles.brandIcon} />
          <div>
            <div className={styles.brandName}>Ellines EIP</div>
            <div className={styles.brandSub}>Intelligence Platform</div>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? `${styles.navLink} ${styles.navActive}` : styles.navLink}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>Powered by Ellinea AI</div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.orgName}>{session.organization.name}</div>
            <div className={styles.roleLabel}>{session.user.role}</div>
          </div>
          <div className={styles.topRight}>
            <span className={styles.userName}>{session.user.fullName}</span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
