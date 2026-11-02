import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { UserManagementPanel } from '../components/UserManagementPanel';
import { ProjectForm } from '../components/ProjectForm';
import type { ClarificationLevel, LlmProvider } from '../lib/types';

const CLARIFICATION_LEVELS: { value: ClarificationLevel; label: string; description: string }[] = [
  { value: 'NONE', label: 'None', description: 'Never ask - always make its best assumption and attempt a fix.' },
  { value: 'LOW', label: 'Low', description: 'Only ask when a fix would very likely be wrong without more info.' },
  { value: 'MEDIUM', label: 'Medium', description: 'Ask when the ticket is genuinely ambiguous (default).' },
  { value: 'HIGH', label: 'High', description: 'Ask whenever there is any meaningful ambiguity.' },
];

type Tab = 'settings' | 'users' | 'newProject' | 'knowledge' | 'recovery';

const inputCls =
    'w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]';

function SettingsPanel() {
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(5);
  const [zohoPollIntervalSeconds, setZohoPollIntervalSeconds] = useState(60);
  const [clarificationLevel, setClarificationLevel] = useState<ClarificationLevel>('MEDIUM');
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('GPT');
  const [claudeApiToken, setClaudeApiToken] = useState('');
  const [hasClaudeApiToken, setHasClaudeApiToken] = useState(false);
  const [azureOpenAiEndpoint, setAzureOpenAiEndpoint] = useState('');
  const [azureOpenAiApiKey, setAzureOpenAiApiKey] = useState('');
  const [hasAzureOpenAiApiKey, setHasAzureOpenAiApiKey] = useState(false);
  const [azureOpenAiApiVersion, setAzureOpenAiApiVersion] = useState('2025-01-01-preview');
  const [azureOpenAiDeployment, setAzureOpenAiDeployment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [killSwitchArmed, setKillSwitchArmed] = useState(false);
  const [killSwitchReason, setKillSwitchReason] = useState('');
  const [requireChangePlanApproval, setRequireChangePlanApproval] = useState(true);
  const [testsMustPass, setTestsMustPass] = useState(true);
  const [securityScansEnabled, setSecurityScansEnabled] = useState(true);
  const [failClosedEnabled, setFailClosedEnabled] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
        .getSettings()
        .then((s) => {
          setMaxConcurrentJobs(s.maxConcurrentJobs);
          setZohoPollIntervalSeconds(s.zohoPollIntervalSeconds);
          setClarificationLevel(s.clarificationLevel);
          setLlmProvider(s.llmProvider === 'CLAUDE' ? 'CLAUDE' : 'GPT');
          setHasClaudeApiToken(s.hasClaudeApiToken);
          setHasAzureOpenAiApiKey(s.hasAzureOpenAiApiKey);
          setAzureOpenAiEndpoint(s.azureOpenAiEndpoint ?? '');
          setAzureOpenAiApiVersion(s.azureOpenAiApiVersion ?? '2025-01-01-preview');
          setAzureOpenAiDeployment(s.azureOpenAiDeployment ?? '');
          setKillSwitchArmed(!!s.killSwitchArmed);
          setKillSwitchReason(s.killSwitchReason ?? '');
          setRequireChangePlanApproval(s.requireChangePlanApproval !== false);
          setTestsMustPass(s.testsMustPass !== false);
          setSecurityScansEnabled(s.securityScansEnabled !== false);
          setFailClosedEnabled(s.failClosedEnabled !== false);
        })
        .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.updateSettings({
        maxConcurrentJobs,
        zohoPollIntervalSeconds,
        clarificationLevel,
        llmProvider,
        azureOpenAiEndpoint,
        azureOpenAiApiVersion,
        azureOpenAiDeployment,
        killSwitchArmed,
        killSwitchReason: killSwitchArmed ? killSwitchReason : '',
        requireChangePlanApproval,
        testsMustPass,
        securityScansEnabled,
        failClosedEnabled,
        ...(claudeApiToken ? { claudeApiToken } : {}),
        ...(azureOpenAiApiKey ? { azureOpenAiApiKey } : {}),
      });
      setMaxConcurrentJobs(res.maxConcurrentJobs);
      setZohoPollIntervalSeconds(res.zohoPollIntervalSeconds);
      setClarificationLevel(res.clarificationLevel);
      setLlmProvider(res.llmProvider === 'CLAUDE' ? 'CLAUDE' : 'GPT');
      setHasClaudeApiToken(res.hasClaudeApiToken);
      setHasAzureOpenAiApiKey(res.hasAzureOpenAiApiKey);
      setAzureOpenAiEndpoint(res.azureOpenAiEndpoint ?? '');
      setAzureOpenAiApiVersion(res.azureOpenAiApiVersion ?? '2025-01-01-preview');
      setAzureOpenAiDeployment(res.azureOpenAiDeployment ?? '');
      setKillSwitchArmed(!!res.killSwitchArmed);
      setKillSwitchReason(res.killSwitchReason ?? '');
      setRequireChangePlanApproval(res.requireChangePlanApproval !== false);
      setTestsMustPass(res.testsMustPass !== false);
      setSecurityScansEnabled(res.securityScansEnabled !== false);
      setFailClosedEnabled(res.failClosedEnabled !== false);
      setClaudeApiToken('');
      setAzureOpenAiApiKey('');
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function testGpt() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.testGptConnection({
        endpoint: azureOpenAiEndpoint,
        apiKey: azureOpenAiApiKey || undefined,
        apiVersion: azureOpenAiApiVersion,
        deployment: azureOpenAiDeployment,
      });
      if (res.ok) {
        setMessage(res.model ? `${res.message} (${res.model})` : res.message);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'GPT test failed');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[color:var(--color-text-400)]">Loading…</p>;
  }

  return (
      <div className="glow-border flex max-w-xl flex-col gap-5 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Fixer</label>
          <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value as LlmProvider)}
              className={inputCls}
          >
            <option value="GPT">GPT (Azure OpenAI)</option>
            <option value="CLAUDE">Claude Code CLI</option>
          </select>
          <p className="mt-1 text-xs text-[color:var(--color-text-600)]">
            GPT uses the Azure OpenAI key below. Claude uses the Claude Code CLI (token or /login session).
          </p>
        </div>

        {llmProvider === 'GPT' ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-border-800)] p-4">
              <p className="text-xs font-medium text-[color:var(--color-text-400)]">
                Azure OpenAI {hasAzureOpenAiApiKey ? '· key stored' : '· no key yet'}
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Endpoint</label>
                <input
                    className={inputCls}
                    placeholder="https://your-resource.openai.azure.com"
                    value={azureOpenAiEndpoint}
                    onChange={(e) => setAzureOpenAiEndpoint(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Deployment name</label>
                <input
                    className={inputCls}
                    placeholder="gpt-5.4-mini"
                    value={azureOpenAiDeployment}
                    onChange={(e) => setAzureOpenAiDeployment(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">API version</label>
                <input
                    className={inputCls}
                    value={azureOpenAiApiVersion}
                    onChange={(e) => setAzureOpenAiApiVersion(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">API key</label>
                <input
                    className={inputCls}
                    type="password"
                    placeholder={hasAzureOpenAiApiKey ? 'Leave blank to keep the current key' : 'Azure OpenAI key'}
                    value={azureOpenAiApiKey}
                    onChange={(e) => setAzureOpenAiApiKey(e.target.value)}
                />
              </div>
              <button
                  type="button"
                  onClick={testGpt}
                  disabled={testing}
                  className="w-fit rounded-lg border border-[color:var(--color-border-800)] px-3 py-1.5 text-xs font-medium hover:border-[color:var(--color-accent-primary)]/50 disabled:opacity-50"
              >
                {testing ? 'Testing…' : 'Test GPT connection'}
              </button>
            </div>
        ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">
                Claude API token {hasClaudeApiToken ? '· stored' : ''}
              </label>
              <input
                  className={inputCls}
                  type="password"
                  placeholder={hasClaudeApiToken ? 'Leave blank to keep the current token' : 'sk-ant-… or leave empty to use CLI login'}
                  value={claudeApiToken}
                  onChange={(e) => setClaudeApiToken(e.target.value)}
              />
            </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">
            Global max concurrent jobs
          </label>
          <input
              type="number"
              min={1}
              value={maxConcurrentJobs}
              onChange={(e) => setMaxConcurrentJobs(Number(e.target.value))}
              className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">
            Ticket poll interval (seconds)
          </label>
          <input
              type="number"
              min={15}
              value={zohoPollIntervalSeconds}
              onChange={(e) => setZohoPollIntervalSeconds(Number(e.target.value))}
              className={inputCls}
          />
          <p className="mt-1 text-xs text-[color:var(--color-text-600)]">
            How often projects check Zoho Sprints or Jira for new tickets. Takes effect on the next
            poll cycle, no restart needed. Minimum 15s.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">
            How readily the fixer asks a clarifying question
          </label>
          <select
              value={clarificationLevel}
              onChange={(e) => setClarificationLevel(e.target.value as ClarificationLevel)}
              className={inputCls}
          >
            {CLARIFICATION_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[color:var(--color-text-600)]">
            {CLARIFICATION_LEVELS.find((l) => l.value === clarificationLevel)?.description}{' '}
            A clarifying question pauses the ticket and posts as a comment on the Zoho or Jira ticket itself - see the
            job's status for details. Applies to every new task from the next poll cycle onward.
          </p>
        </div>

        <div className="rounded-xl border border-[color:var(--color-accent-red)]/30 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-accent-red)]">
            <input type="checkbox" checked={killSwitchArmed} onChange={(e) => setKillSwitchArmed(e.target.checked)} />
            Kill switch — stop all agent actions
          </label>
          <input
              className={`${inputCls} mt-2`}
              placeholder="Reason (shown to operators)"
              value={killSwitchReason}
              onChange={(e) => setKillSwitchReason(e.target.value)}
              disabled={!killSwitchArmed}
          />
          <p className="mt-1 text-xs text-[color:var(--color-text-600)]">
            In-flight work stops at the next Guard check. Existing ITSM and Git stay available for manual work.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requireChangePlanApproval} onChange={(e) => setRequireChangePlanApproval(e.target.checked)} />
          Require human approval of the change plan (coding) or L1 draft
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={testsMustPass} onChange={(e) => setTestsMustPass(e.target.checked)} />
          Fail the job if build or tests exit non-zero
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={securityScansEnabled} onChange={(e) => setSecurityScansEnabled(e.target.checked)} />
          Run SAST / secret / dependency scans before opening a PR
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={failClosedEnabled} onChange={(e) => setFailClosedEnabled(e.target.checked)} />
          Fail closed when Guard cannot evaluate policy
        </label>

        {message && <p className="text-sm text-[color:var(--color-accent-green)]">{message}</p>}
        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}

        <button
            onClick={save}
            disabled={saving}
            className="w-fit rounded-lg bg-[color:var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
  );
}

function AddProjectPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
      <div className="flex flex-col gap-4">
        {message && <p className="text-sm text-[color:var(--color-accent-green)]">{message}</p>}
        <ProjectForm
            key={formKey}
            onSaved={(project) => {
              setMessage(`Project "${project.name}" created.`);
              setFormKey((k) => k + 1);
            }}
        />
      </div>
  );
}

function KnowledgePanel() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [docs, setDocs] = useState<import('../lib/types').KnowledgeDocument[]>([]);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('runbook');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('PROJECT');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then((list) => {
      setProjects(list);
      if (list[0]) setProjectId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.listKnowledge(projectId).then(setDocs).catch((err) => setError(err instanceof ApiError ? err.message : 'Load failed'));
  }, [projectId]);

  async function ingest() {
    setError(null);
    try {
      const doc = await api.ingestKnowledge({ projectId, title, source, content, visibility });
      setDocs((d) => [doc, ...d]);
      setTitle('');
      setContent('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ingest failed');
    }
  }

  return (
      <div className="flex flex-col gap-4">
        <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="glow-border flex flex-col gap-3 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
          <input className={inputCls} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className={inputCls} placeholder="Source (runbook, policy, FAQ)" value={source} onChange={(e) => setSource(e.target.value)} />
          <select className={inputCls} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="PROJECT">Visible to project members and agents</option>
            <option value="ADMIN">Admin-only (agents will not retrieve this)</option>
          </select>
          <textarea className={`${inputCls} min-h-32`} placeholder="Document content" value={content} onChange={(e) => setContent(e.target.value)} />
          <button onClick={ingest} className="w-fit rounded-lg bg-[color:var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-accent)]">
            Ingest into Sage
          </button>
          {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}
        </div>
        <ul className="flex flex-col gap-3">
          {docs.map((doc) => (
              <li key={doc.id} className="rounded-xl border border-[color:var(--color-border-800)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{doc.title} <span className="text-xs text-[color:var(--color-text-400)]">v{doc.version}</span></p>
                    <p className="text-xs text-[color:var(--color-text-400)]">{doc.source} · {doc.visibility}</p>
                  </div>
                  <button
                      onClick={async () => {
                        await api.deleteKnowledge(doc.id);
                        setDocs((d) => d.filter((x) => x.id !== doc.id));
                      }}
                      className="text-xs text-[color:var(--color-accent-red)]"
                  >
                    Delete
                  </button>
                </div>
                <p className="mt-2 line-clamp-4 text-xs text-[color:var(--color-text-400)]">{doc.content}</p>
              </li>
          ))}
        </ul>
      </div>
  );
}

function RecoveryPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  async function downloadBackup() {
    setError(null);
    try {
      const payload = await api.recoveryBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eao-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Backup downloaded. Secrets are not included.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Backup failed');
    }
  }

  async function restore(file: File) {
    setError(null);
    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      const res = await api.recoveryRestore(payload);
      setMessage(`Restore complete at ${String(res.restoredAt ?? '')}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Restore failed');
    }
  }

  async function drill() {
    setError(null);
    try {
      setReport(await api.recoveryDrill());
      setMessage('Recovery drill finished.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Drill failed');
    }
  }

  return (
      <div className="glow-border flex max-w-xl flex-col gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
        <p className="text-sm text-[color:var(--color-text-400)]">
          Export Sage documents and Guard flags. Secrets never leave the server. A drill checks MongoDB, the job-runner, and fail-closed posture.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadBackup} className="rounded-lg border border-[color:var(--color-border-800)] px-4 py-2 text-sm">Download backup</button>
          <label className="rounded-lg border border-[color:var(--color-border-800)] px-4 py-2 text-sm">
            Restore JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </label>
          <button onClick={drill} className="rounded-lg bg-[color:var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--color-on-accent)]">Run recovery drill</button>
        </div>
        {message && <p className="text-sm text-[color:var(--color-accent-green)]">{message}</p>}
        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}
        {report && <pre className="overflow-x-auto font-mono-brand text-xs text-[color:var(--color-text-400)]">{JSON.stringify(report, null, 2)}</pre>}
      </div>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('settings');

  return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <p className="eyebrow">Control plane</p>
          <h1 className="page-title">Admin</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-400)]">
            Fixer (GPT or Claude), concurrency, polling, user access, and new projects. For Zoho
            Sprints / Jira / Cliq setup, see <strong>User Guide</strong>.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-2xl border border-[color:var(--color-border-800)] bg-[color:var(--color-panel-900)]/70 p-1">
          {([
            ['settings', 'Settings'],
            ['knowledge', 'Sage knowledge'],
            ['recovery', 'Backup & recovery'],
            ['users', 'User Management'],
            ['newProject', 'Add Project'],
          ] as [Tab, string][]).map(([key, label]) => (
              <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                      tab === key
                          ? 'bg-[color:var(--color-accent-primary)]/16 text-[color:var(--color-text-100)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent-primary)_40%,transparent)]'
                          : 'text-[color:var(--color-text-400)] wash-hover hover:text-[color:var(--color-text-100)]'
                  }`}
              >
                {label}
              </button>
          ))}
        </div>

        {tab === 'settings' && <SettingsPanel />}
        {tab === 'knowledge' && <KnowledgePanel />}
        {tab === 'recovery' && <RecoveryPanel />}
        {tab === 'users' && <UserManagementPanel />}
        {tab === 'newProject' && <AddProjectPanel />}
      </div>
  );
}
