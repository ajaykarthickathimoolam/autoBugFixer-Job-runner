import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import type { PageKey } from '../lib/types';

export function PageGuard({ page, children }: { page: PageKey; children: ReactNode }) {
  const { pageAccess } = useAuth();
  if (pageAccess !== null && !pageAccess.includes(page)) {
    return (
        <div className="mx-auto max-w-lg rounded-2xl border border-[color:var(--color-border-800)] bg-[color:var(--color-panel-900)]/80 p-6 text-center">
          <p className="text-sm text-[color:var(--color-text-400)]">
            You don't have access to this page. Ask an admin to grant it in Admin → User Management.
          </p>
        </div>
    );
  }
  return <>{children}</>;
}
