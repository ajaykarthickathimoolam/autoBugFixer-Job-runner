import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from '../lib/theme';
import type { PageKey } from '../lib/types';
import logo from '../assets/logo.png';

const NAV_ITEMS: { to: string; label: string; page: PageKey; icon: ReactNode }[] = [
  { to: '/dashboard', label: 'Dashboard', page: 'DASHBOARD', icon: <IconGrid /> },
  { to: '/projects', label: 'Projects', page: 'PROJECTS', icon: <IconFolder /> },
  { to: '/board', label: 'Board', page: 'BOARD', icon: <IconBoard /> },
  { to: '/admin', label: 'Admin', page: 'ADMIN', icon: <IconSliders /> },
  { to: '/guide', label: 'User Guide', page: 'GUIDE', icon: <IconBook /> },
];

export function Layout() {
  const { username, pageAccess, logout } = useAuth();
  const visibleNavItems = NAV_ITEMS.filter((item) => pageAccess === null || pageAccess.includes(item.page));
  const initials = (username ?? '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="app-shell text-[color:var(--color-text-100)]">
      <aside className="app-sidebar">
        <div className="flex items-center gap-3 px-5 pb-2 pt-5">
          <img src={logo} alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-tight">
              Code<span className="text-[color:var(--color-accent-primary)]">Healer</span>
            </p>
            <p className="text-[11px] text-[color:var(--color-text-600)]">Governed fixes</p>
          </div>
        </div>
        <nav className="mt-3 flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[color:var(--color-accent-primary)]/14 text-[color:var(--color-text-100)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent-primary)_35%,transparent)] [&_svg]:text-[color:var(--color-accent-primary)]'
                    : 'text-[color:var(--color-text-400)] wash-hover hover:text-[color:var(--color-text-100)]'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <ThemeToggle className="mb-2 w-full" />
          <div className="rounded-2xl border border-[color:var(--hairline)] wash p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--color-accent-primary)]/18 text-xs font-semibold text-[color:var(--color-accent-primary)]">
                {initials || 'CH'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{username}</p>
                <p className="text-[11px] text-[color:var(--color-text-600)]">Signed in</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-3 w-full rounded-xl border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-400)] transition-colors hover:border-[color:var(--color-accent-red)]/40 hover:text-[color:var(--color-accent-red)]"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
    </svg>
  );
}

function IconBoard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16M16 4v16" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="17" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 4.5h6.5A2.5 2.5 0 0 1 14 7v12.5H7.5A2.5 2.5 0 0 0 5 22V4.5Z" />
      <path d="M19 4.5h-6.5A2.5 2.5 0 0 0 10 7v12.5h6.5A2.5 2.5 0 0 1 19 22V4.5Z" />
    </svg>
  );
}
