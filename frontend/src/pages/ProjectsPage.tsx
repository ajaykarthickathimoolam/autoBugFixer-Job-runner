import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ProjectForm } from '../components/ProjectForm';
import type { ProjectResponse } from '../lib/types';

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setProjects(await api.listProjects());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm('Delete this project? This removes it from CodeHealer. It does not revoke the GitHub token, GitHub App, or SSH key. Revoke those on GitHub separately.')) return;
    await api.deleteProject(id);
    await load();
  }

  const editingProject = projects.find((p) => p.id === editingId);

  if (editingProject) {
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <h1 className="page-title">Edit project</h1>
          <ProjectForm
              editingProject={editingProject}
              onSaved={() => {
                setEditingId(null);
                load();
              }}
              onCancel={() => setEditingId(null)}
          />
        </div>
    );
  }

  return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 className="page-title">Projects</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-400)]">
            Zoho or Jira projects, services, and credentials. New projects are added from Admin.
          </p>
        </div>

        {loading && <p className="text-sm text-[color:var(--color-text-400)]">Loading…</p>}

        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
              <div key={p.id} className="glow-border rounded-2xl bg-[color:var(--color-panel-900)]/80 p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    <p className="text-xs text-[color:var(--color-text-400)]">
                      {p.agilePlatform === 'JIRA' ? 'Jira' : 'Zoho'} project {p.agilePlatform === 'JIRA' ? (p.jiraProjectKey ?? '—') : (p.zohoProjectIdExternal ?? '—')}
                      {p.lastPolledAt && <> · last polled {new Date(p.lastPolledAt).toLocaleTimeString()}</>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                        onClick={() => setEditingId(p.id)}
                        className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1 text-xs hover:border-[color:var(--color-accent-primary)]/50"
                    >
                      Edit
                    </button>
                    <button
                        onClick={() => remove(p.id)}
                        className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1 text-xs text-[color:var(--color-accent-red)] hover:border-[color:var(--color-accent-red)]/50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <Pill ok={p.hasGithubSshKey} label="SSH key" />
                  <Pill ok={p.hasGithubPat} label="GitHub PAT" />
                  <Pill ok={p.hasCliqWebhook} label="Cliq webhook" />
                  {p.agilePlatform === 'JIRA' ? (
                      <Pill ok={p.hasJiraApiToken} label="Jira API token" />
                  ) : (
                      <Pill ok={p.hasZohoOAuthCredentials} label="Zoho OAuth" />
                  )}
                </div>
                <p className="text-xs font-medium text-[color:var(--color-text-400)]">
                  {p.services.length} service{p.services.length === 1 ? '' : 's'}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {p.services.map((s) => (
                      <li key={s.id} className="text-sm text-[color:var(--color-text-100)]">
                        {s.name} <span className="text-[color:var(--color-text-600)]">→ {s.baseBranch}</span>
                      </li>
                  ))}
                </ul>
              </div>
          ))}
          {!loading && projects.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-600)]">
                No projects assigned to you yet. Ask an admin to add one in Admin → Add Project.
              </p>
          )}
        </div>
      </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
      <span
          className={`rounded-full border px-2 py-0.5 ${
              ok
                  ? 'border-[color:var(--color-accent-green)]/30 text-[color:var(--color-accent-green)]'
                  : 'border-[color:var(--color-border-800)] text-[color:var(--color-text-600)]'
          }`}
      >
      {label}
    </span>
  );
}
