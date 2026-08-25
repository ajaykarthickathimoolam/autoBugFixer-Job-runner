import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { PageKey } from '../lib/types';
import logo from '../assets/logo.png';

const NAV_ITEMS: { to: string; label: string; page: PageKey }[] = [
  { to: '/dashboard', label: 'Dashboard', page: 'DASHBOARD' },
  { to: '/projects', label: 'Projects', page: 'PROJECTS' },
  { to: '/board', label: 'Board', page: 'BOARD' },
  { to: '/admin', label: 'Admin', page: 'ADMIN' },
  { to: '/guide', label: 'User Guide', page: 'GUIDE' },
];

export function Layout() {
  const { username, pageAccess, logout } = useAuth();
  const visibleNavItems = NAV_ITEMS.filter((item) => pageAccess === null || pageAccess.includes(item.page));

  return (
      <div className="bg-app-wallpaper flex h-screen w-full overflow-hidden text-[color:var(--color-text-100)]">
        <aside className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)]/80 backdrop-blur-md">
          <div className="flex items-center gap-3 px-5 py-6">
            <img src={logo} alt="CodeHealer" className="h-9 w-9 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">CodeHealer</span>
          </div>
          <nav className="mt-2 flex flex-col gap-1 px-3">
            {visibleNavItems.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                        `rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                            isActive
                                ? 'bg-[color:var(--color-accent-primary)]/15 text-[color:var(--color-accent-primary)]'
                                : 'text-[color:var(--color-text-400)] hover:bg-[color:var(--color-panel-900)] hover:text-[color:var(--color-text-100)]'
                        }`
                    }
                >
                  {item.label}
                </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2 border-t border-[color:var(--color-border-800)] px-5 py-4">
            <span className="text-xs text-[color:var(--color-text-400)]">Signed in as</span>
            <span className="text-sm font-medium">{username}</span>
            <button
                onClick={logout}
                className="mt-2 rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-400)] transition-colors hover:border-[color:var(--color-accent-red)]/40 hover:text-[color:var(--color-accent-red)]"
            >
              Log out
            </button>
          </div>
        </aside>
        <main className="h-full flex-1 overflow-y-auto px-8 py-8 [scrollbar-gutter:stable]">
          <Outlet />
        </main>
      </div>
  );
}
