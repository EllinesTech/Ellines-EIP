'use client';

/**
 * /app/admin/users — Users & Access management.
 * The full implementation lives at /app/admin (admin/page.tsx).
 * This route provides a direct deep-link into the admin panel's users section.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isOrgAdminRole } from '@ellines-eip/shared';
import { getSession } from '@/lib/api';
import AdminPage from '../page';

export default function AdminUsersPage() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace('/login'); return; }
    if (!isOrgAdminRole(session.user.role)) { router.replace('/app'); return; }
  }, [router]);

  // Render the full admin page — users section is the primary content
  return <AdminPage />;
}
