import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { PageKey, ProjectOption, UserAccount } from '../lib/types';

const PAGES: { key: PageKey; label: string }[] = [
  { key: 'DASHBOARD', label: 'Dashboard' },
  { key: 'PROJECTS', label: 'Projects' },
  { key: 'BOARD', label: 'Board' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'GUIDE', label: 'User Guide' },
];

/** Both Projects and Board respect the per-project restriction, so the picker must appear for either. */
function needsProjectPicker(pageAccess: PageKey[]): boolean {
  return pageAccess.includes('PROJECTS') || pageAccess.includes('BOARD');
}

const inputCls =
    'w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]';

function toggleId<T>(ids: T[], id: T): T[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPageAccess, setNewPageAccess] = useState<PageKey[]>([]);
  const [newAllowedProjectIds, setNewAllowedProjectIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    api
        .listUsers()
        .then(setUsers)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load users'))
        .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    api.listProjectOptions().then(setProjectOptions).catch(() => {});
  }, []);

  async function createUser() {
    setError(null);
    setCreating(true);
    try {
      await api.createUser({
        username: newUsername,
        password: newPassword,
        pageAccess: newPageAccess,
        allowedProjectIds: newAllowedProjectIds,
      });
      setNewUsername('');
      setNewPassword('');
      setNewPageAccess([]);
      setNewAllowedProjectIds([]);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function updatePageAccess(user: UserAccount, page: PageKey) {
    const updated = toggleId(user.pageAccess, page);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, pageAccess: updated } : u)));
    try {
      await api.updateUserAccess(user.id, updated, user.allowedProjectIds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update access');
      load();
    }
  }

  async function updateProjectAccess(user: UserAccount, projectId: string) {
    const updated = toggleId(user.allowedProjectIds, projectId);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, allowedProjectIds: updated } : u)));
    try {
      await api.updateUserAccess(user.id, user.pageAccess, updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update project access');
      load();
    }
  }

  async function resetPassword(user: UserAccount) {
    const password = prompt(`New password for ${user.username}:`);
    if (!password) return;
    try {
      await api.resetUserPassword(user.id, password);
      alert(`Password reset for ${user.username}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset password');
    }
  }

  async function deleteUser(user: UserAccount) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await api.deleteUser(user.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user');
    }
  }

  return (
      <div className="flex flex-col gap-6">
        <div className="glow-border flex flex-col gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <h3 className="text-sm font-semibold text-[color:var(--color-text-400)]">Add a user</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className={inputCls}
            />
            <input
                placeholder="Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            {PAGES.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-[color:var(--color-text-400)]">
                  <input
                      type="checkbox"
                      checked={newPageAccess.includes(p.key)}
                      onChange={() => setNewPageAccess((prev) => toggleId(prev, p.key))}
                  />
                  {p.label}
                </label>
            ))}
          </div>

          {needsProjectPicker(newPageAccess) && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">
                  Which projects can this user see?
                </label>
                <div className="flex flex-wrap gap-3">
                  {projectOptions.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-[color:var(--color-text-400)]">
                        <input
                            type="checkbox"
                            checked={newAllowedProjectIds.includes(p.id)}
                            onChange={() => setNewAllowedProjectIds((prev) => toggleId(prev, p.id))}
                        />
                        {p.name}
                      </label>
                  ))}
                  {projectOptions.length === 0 && (
                      <span className="text-xs text-[color:var(--color-text-600)]">No projects yet</span>
                  )}
                </div>
              </div>
          )}

          <button
              onClick={createUser}
              disabled={creating || !newUsername || !newPassword}
              className="w-fit rounded-lg bg-[color:var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] disabled:opacity-50"
          >
            {creating ? 'Adding…' : 'Add user'}
          </button>
        </div>

        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}

        <div className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <h3 className="mb-4 text-sm font-semibold text-[color:var(--color-text-400)]">Users</h3>
          {loading ? (
              <p className="text-sm text-[color:var(--color-text-400)]">Loading…</p>
          ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                  <tr className="text-xs text-[color:var(--color-text-400)]">
                    <th className="pb-2 pr-4">Username</th>
                    {PAGES.map((p) => (
                        <th key={p.key} className="pb-2 pr-4">{p.label}</th>
                    ))}
                    <th className="pb-2 pr-4">Projects</th>
                    <th className="pb-2 pr-4"></th>
                  </tr>
                  </thead>
                  <tbody>
                  {users.map((user) => (
                      <tr key={user.id} className="border-t border-[color:var(--color-border-800)]">
                        <td className="whitespace-nowrap py-2 pr-4 align-top font-medium">
                          {user.username}
                          {user.superAdmin && (
                              <span className="ml-2 rounded-full border border-[color:var(--color-accent-green)]/30 px-2 py-0.5 text-xs text-[color:var(--color-accent-green)]">
                                Super admin
                              </span>
                          )}
                        </td>
                        {PAGES.map((p) => (
                            <td key={p.key} className="py-2 pr-4 align-top">
                              {user.superAdmin ? (
                                  <span className="text-[color:var(--color-accent-green)]">✓</span>
                              ) : (
                                  <input
                                      type="checkbox"
                                      checked={user.pageAccess.includes(p.key)}
                                      onChange={() => updatePageAccess(user, p.key)}
                                  />
                              )}
                            </td>
                        ))}
                        <td className="py-2 pr-4 align-top">
                          {user.superAdmin ? (
                              <span className="text-xs text-[color:var(--color-text-600)]">All</span>
                          ) : !needsProjectPicker(user.pageAccess) ? (
                              <span className="text-xs text-[color:var(--color-text-600)]">—</span>
                          ) : (
                              <div className="flex max-w-xs flex-wrap gap-2">
                                {projectOptions.map((p) => (
                                    <label key={p.id} className="flex items-center gap-1 text-xs text-[color:var(--color-text-400)]">
                                      <input
                                          type="checkbox"
                                          checked={user.allowedProjectIds.includes(p.id)}
                                          onChange={() => updateProjectAccess(user, p.id)}
                                      />
                                      {p.name}
                                    </label>
                                ))}
                                {projectOptions.length === 0 && (
                                    <span className="text-xs text-[color:var(--color-text-600)]">No projects yet</span>
                                )}
                              </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 align-top">
                          <div className="flex items-center gap-2">
                            <button
                                onClick={() => resetPassword(user)}
                                className="rounded-lg border border-[color:var(--color-border-800)] px-2.5 py-1 text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]"
                            >
                              Reset password
                            </button>
                            {!user.superAdmin && (
                                <button
                                    onClick={() => deleteUser(user)}
                                    className="rounded-lg border border-[color:var(--color-border-800)] px-2.5 py-1 text-xs text-[color:var(--color-accent-red)] hover:border-[color:var(--color-accent-red)]/50"
                                >
                                  Delete
                                </button>
                            )}
                          </div>
                        </td>
                      </tr>
                  ))}
                  {users.length === 0 && (
                      <tr>
                        <td colSpan={PAGES.length + 3} className="py-6 text-center text-[color:var(--color-text-600)]">
                          No other users yet. You are signed in as the seeded super admin — add someone above.
                        </td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
          )}
        </div>
      </div>
  );
}
