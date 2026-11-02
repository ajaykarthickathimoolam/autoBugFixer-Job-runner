import { useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { CredentialGuide } from './CredentialGuide';
import type { AgilePlatform, MissionType, ProjectInput, ProjectResponse, ServiceConfigInput } from '../lib/types';

const EMPTY_SERVICE: ServiceConfigInput = {
  name: '',
  repoUrl: '',
  baseBranch: 'main',
  architectureMd: '',
  buildCommand: '',
  testCommand: '',
};

function emptyForm(): ProjectInput {
  return {
    name: '',
    architectureMd: '',
    zohoCliqWebhookUrl: '',
    githubSshPrivateKey: '',
    githubPat: '',
    clearGithubPat: false,
    clearGithubSshKey: false,
    githubAppId: '',
    githubAppInstallationId: '',
    githubAppPrivateKey: '',
    clearGithubAppPrivateKey: false,
    zohoTeamId: '',
    zohoProjectIdExternal: '',
    zohoOAuthClientId: '',
    zohoOAuthClientSecret: '',
    zohoRefreshToken: '',
    agilePlatform: 'ZOHO',
    jiraBaseUrl: '',
    jiraProjectKey: '',
    jiraEmail: '',
    jiraApiToken: '',
    jiraIssueTypes: 'Bug',
    jiraWebhookSecret: '',
    agentMode: 'CODING',
    services: [],
  };
}

function formFromProject(p: ProjectResponse): ProjectInput {
  return {
    name: p.name,
    architectureMd: p.architectureMd ?? '',
    zohoCliqWebhookUrl: '',
    githubSshPrivateKey: '',
    githubPat: '',
    clearGithubPat: false,
    clearGithubSshKey: false,
    githubAppId: p.githubAppId ?? '',
    githubAppInstallationId: p.githubAppInstallationId ?? '',
    githubAppPrivateKey: '',
    clearGithubAppPrivateKey: false,
    zohoTeamId: p.zohoTeamId ?? '',
    zohoProjectIdExternal: p.zohoProjectIdExternal ?? '',
    zohoOAuthClientId: '',
    zohoOAuthClientSecret: '',
    zohoRefreshToken: '',
    agilePlatform: p.agilePlatform ?? 'ZOHO',
    jiraBaseUrl: p.jiraBaseUrl ?? '',
    jiraProjectKey: p.jiraProjectKey ?? '',
    jiraEmail: p.jiraEmail ?? '',
    jiraApiToken: '',
    jiraIssueTypes: p.jiraIssueTypes ?? 'Bug',
    jiraWebhookSecret: '',
    agentMode: p.agentMode === 'L1_SUPPORT' ? 'L1_SUPPORT' : 'CODING',
    services: p.services.map((s) => ({ ...s })),
  };
}

export function ProjectForm({
  editingProject,
  onSaved,
  onCancel,
}: {
  editingProject?: ProjectResponse;
  onSaved: (project: ProjectResponse) => void;
  onCancel?: () => void;
}) {
  const editingId = editingProject?.id ?? null;
  const [form, setForm] = useState<ProjectInput>(editingProject ? formFromProject(editingProject) : emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = editingId ? await api.updateProject(editingId, form) : await api.createProject(form);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function updateService(index: number, patch: Partial<ServiceConfigInput>) {
    setForm((f) => ({
      ...f,
      services: f.services.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function addService() {
    setForm((f) => ({ ...f, services: [...f.services, { ...EMPTY_SERVICE }] }));
  }

  function removeService(index: number) {
    setForm((f) => ({ ...f, services: f.services.filter((_, i) => i !== index) }));
  }

  return (
      <div className="flex flex-col gap-6">
        <div className="glow-border flex flex-col gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <Field label="Project name">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Agile platform">
            <select
                className={inputCls}
                value={form.agilePlatform ?? 'ZOHO'}
                onChange={(e) => setForm({ ...form, agilePlatform: e.target.value as AgilePlatform })}
            >
              <option value="ZOHO">Zoho Sprints</option>
              <option value="JIRA">Jira Cloud</option>
            </select>
          </Field>
          <Field label="Agent">
            <select
                className={inputCls}
                value={form.agentMode ?? 'CODING'}
                onChange={(e) => setForm({ ...form, agentMode: e.target.value as MissionType })}
            >
              <option value="CODING">Coding agent (investigate, tests, scans, PR)</option>
              <option value="L1_SUPPORT">L1 support agent (Sage + draft + approval)</option>
            </select>
          </Field>

          {(form.agilePlatform ?? 'ZOHO') === 'ZOHO' ? (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-[color:var(--color-border-800)] p-4">
            <p className="col-span-2 text-xs font-medium text-[color:var(--color-text-400)]">
              Zoho Sprints (polling) - get these from User Guide → Zoho Sprints connection setup
            </p>
            <Field label="Zoho Team ID">
              <input
                  className={inputCls}
                  value={form.zohoTeamId}
                  onChange={(e) => setForm({ ...form, zohoTeamId: e.target.value })}
              />
            </Field>
            <Field label="Zoho Project ID">
              <input
                  className={inputCls}
                  value={form.zohoProjectIdExternal}
                  onChange={(e) => setForm({ ...form, zohoProjectIdExternal: e.target.value })}
              />
            </Field>
            <Field label="OAuth Client ID" hint={editingId ? 'Leave blank to keep the current value' : 'From a Self Client at api-console.zoho.com'}>
              <input
                  className={inputCls}
                  value={form.zohoOAuthClientId}
                  onChange={(e) => setForm({ ...form, zohoOAuthClientId: e.target.value })}
              />
            </Field>
            <Field label="OAuth Client Secret" hint={editingId ? 'Leave blank to keep the current value' : undefined}>
              <input
                  className={inputCls}
                  type="password"
                  value={form.zohoOAuthClientSecret}
                  onChange={(e) => setForm({ ...form, zohoOAuthClientSecret: e.target.value })}
              />
            </Field>
            <Field label="OAuth Refresh Token" full hint={editingId ? 'Leave blank to keep the current value' : undefined}>
              <input
                  className={inputCls}
                  type="password"
                  value={form.zohoRefreshToken}
                  onChange={(e) => setForm({ ...form, zohoRefreshToken: e.target.value })}
              />
            </Field>
          </div>
          ) : (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-[color:var(--color-border-800)] p-4">
            <p className="col-span-2 text-xs font-medium text-[color:var(--color-text-400)]">
              Jira Cloud — test the token in User Guide → Jira Cloud connection setup, then paste values here
            </p>
            <Field label="Jira site URL" full>
              <input
                  className={inputCls}
                  placeholder="https://yourorg.atlassian.net"
                  value={form.jiraBaseUrl}
                  onChange={(e) => setForm({ ...form, jiraBaseUrl: e.target.value })}
              />
            </Field>
            <Field label="Project key">
              <input
                  className={inputCls}
                  placeholder="PAY"
                  value={form.jiraProjectKey}
                  onChange={(e) => setForm({ ...form, jiraProjectKey: e.target.value })}
              />
            </Field>
            <Field label="Issue types" hint="Comma-separated. Default Bug.">
              <input
                  className={inputCls}
                  value={form.jiraIssueTypes}
                  onChange={(e) => setForm({ ...form, jiraIssueTypes: e.target.value })}
              />
            </Field>
            <Field label="Account email">
              <input
                  className={inputCls}
                  value={form.jiraEmail}
                  onChange={(e) => setForm({ ...form, jiraEmail: e.target.value })}
              />
            </Field>
            <Field label="API token" hint={editingId ? 'Leave blank to keep the current value' : 'From id.atlassian.com — not your password'}>
              <input
                  className={inputCls}
                  type="password"
                  value={form.jiraApiToken}
                  onChange={(e) => setForm({ ...form, jiraApiToken: e.target.value })}
              />
            </Field>
            <Field
                label="Webhook secret (optional)"
                full
                hint={editingId ? 'Leave blank to keep the current value. Used as ?secret= on /api/webhooks/jira' : 'Optional. Polling works without a webhook.'}
            >
              <input
                  className={inputCls}
                  type="password"
                  value={form.jiraWebhookSecret}
                  onChange={(e) => setForm({ ...form, jiraWebhookSecret: e.target.value })}
              />
            </Field>
          </div>
          )}

          <Field label="Project architecture.md">
            <textarea
                className={`${inputCls} h-28 font-mono-brand`}
                value={form.architectureMd}
                onChange={(e) => setForm({ ...form, architectureMd: e.target.value })}
            />
          </Field>
          <Field label="Zoho Cliq webhook URL" hint={editingId ? 'Leave blank to keep the current value' : undefined}>
            <input
                className={inputCls}
                value={form.zohoCliqWebhookUrl}
                onChange={(e) => setForm({ ...form, zohoCliqWebhookUrl: e.target.value })}
            />
          </Field>
          <Field label="GitHub App ID" hint="Preferred. CodeHealer mints a short-lived installation token for clone and pull requests.">
            <input
                className={inputCls}
                value={form.githubAppId ?? ''}
                onChange={(e) => setForm({ ...form, githubAppId: e.target.value })}
            />
          </Field>
          <Field label="GitHub App installation ID">
            <input
                className={inputCls}
                value={form.githubAppInstallationId ?? ''}
                onChange={(e) => setForm({ ...form, githubAppInstallationId: e.target.value })}
            />
          </Field>
          <Field label="GitHub App private key" hint={editingId ? 'Leave blank to keep the current key' : 'PEM from the GitHub App'}>
            <textarea
                className={`${inputCls} h-24 font-mono-brand`}
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                value={form.githubAppPrivateKey ?? ''}
                onChange={(e) => setForm({ ...form, githubAppPrivateKey: e.target.value, clearGithubAppPrivateKey: false })}
            />
            {editingProject?.hasGithubApp && (
                <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-text-400)]">
                  <input
                      type="checkbox"
                      checked={!!form.clearGithubAppPrivateKey}
                      onChange={(e) => setForm({ ...form, clearGithubAppPrivateKey: e.target.checked, githubAppPrivateKey: '' })}
                  />
                  Remove the stored App private key. This does not uninstall the App on GitHub.
                </label>
            )}
          </Field>
          <Field label="GitHub SSH private key" hint={editingId ? 'Leave blank to keep the current value' : 'Optional. Used for git clone and push.'}>
            <textarea
                className={`${inputCls} h-24 font-mono-brand`}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                value={form.githubSshPrivateKey}
                onChange={(e) => setForm({ ...form, githubSshPrivateKey: e.target.value, clearGithubSshKey: false })}
            />
            {editingProject?.hasGithubSshKey && (
                <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-text-400)]">
                  <input
                      type="checkbox"
                      checked={!!form.clearGithubSshKey}
                      onChange={(e) => setForm({ ...form, clearGithubSshKey: e.target.checked, githubSshPrivateKey: '' })}
                  />
                  Remove the stored SSH key. Delete the matching deploy key on GitHub as well.
                </label>
            )}
            <p className="mt-2 text-xs text-[color:var(--color-text-600)]">
              A classic personal access token or a write-capable SSH key can still merge on GitHub if branch protection allows it. CodeHealer never calls the merge API. Require a pull-request review on the default branch.
            </p>
          </Field>
          <Field label="GitHub personal access token" hint="Fallback when a GitHub App is not configured. Leave blank to keep the current value.">
            <input
                className={inputCls}
                type="password"
                value={form.githubPat}
                onChange={(e) => setForm({ ...form, githubPat: e.target.value, clearGithubPat: false })}
            />
            {editingProject?.hasGithubPat && (
                <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-text-400)]">
                  <input
                      type="checkbox"
                      checked={!!form.clearGithubPat}
                      onChange={(e) => setForm({ ...form, clearGithubPat: e.target.checked, githubPat: '' })}
                  />
                  Remove the stored token. This does not revoke it on GitHub.
                </label>
            )}
            <CredentialGuide
                steps={[
                  { text: 'Prefer a GitHub App installed on the repositories CodeHealer should change. Grant contents and pull requests. CodeHealer exchanges that for a short-lived token.' },
                  { text: 'If you use a personal access token instead, create a fine-grained token that can write contents and pull requests on those repositories, and set an expiration.' },
                  { text: 'Enable branch protection on the default branch: require a review, and do not allow direct pushes. CodeHealer opens a pull request and does not merge it.' },
                ]}
            />
          </Field>
        </div>

        <div className="glow-border flex flex-col gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-text-400)]">Services</h2>
            <button
                onClick={addService}
                className="rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs font-medium hover:border-[color:var(--color-accent-primary)]/50"
            >
              + Add service
            </button>
          </div>

          {form.services.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-600)]">No services yet. Add at least one.</p>
          )}

          {form.services.map((svc, i) => (
              <div key={i} className="rounded-xl border border-[color:var(--color-border-800)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{svc.name || `Service ${i + 1}`}</span>
                  <button
                      onClick={() => removeService(i)}
                      className="text-xs text-[color:var(--color-accent-red)] hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name">
                    <input className={inputCls} value={svc.name} onChange={(e) => updateService(i, { name: e.target.value })} />
                  </Field>
                  <Field label="Base branch">
                    <input
                        className={inputCls}
                        value={svc.baseBranch}
                        onChange={(e) => updateService(i, { baseBranch: e.target.value })}
                    />
                  </Field>
                  <Field label="Repo URL (SSH)" full>
                    <input
                        className={inputCls}
                        placeholder="git@github.com:org/repo.git"
                        value={svc.repoUrl}
                        onChange={(e) => updateService(i, { repoUrl: e.target.value })}
                    />
                  </Field>
                  <Field label="Build command">
                    <input
                        className={inputCls}
                        value={svc.buildCommand}
                        onChange={(e) => updateService(i, { buildCommand: e.target.value })}
                    />
                  </Field>
                  <Field label="Test command (optional)">
                    <input
                        className={inputCls}
                        value={svc.testCommand}
                        onChange={(e) => updateService(i, { testCommand: e.target.value })}
                    />
                  </Field>
                  <Field label="Service architecture.md" full>
                    <textarea
                        className={`${inputCls} h-20 font-mono-brand`}
                        value={svc.architectureMd}
                        onChange={(e) => updateService(i, { architectureMd: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
          ))}
        </div>

        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}

        <div className="flex gap-3">
          <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[color:var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save project'}
          </button>
          {onCancel && (
              <button
                  onClick={onCancel}
                  className="rounded-lg border border-[color:var(--color-border-800)] px-5 py-2.5 text-sm font-medium text-[color:var(--color-text-400)]"
              >
                Cancel
              </button>
          )}
        </div>
      </div>
  );
}

const inputCls =
    'w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]';

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: ReactNode }) {
  return (
      <div className={full ? 'col-span-2' : undefined}>
        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">{label}</label>
        {children}
        {hint && <p className="mt-1 text-xs text-[color:var(--color-text-600)]">{hint}</p>}
      </div>
  );
}
