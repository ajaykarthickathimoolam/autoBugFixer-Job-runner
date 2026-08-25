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

type Tab = 'settings' | 'users' | 'newProject';

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

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('settings');

  return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="text-sm text-[color:var(--color-text-400)]">
            Fixer (GPT or Claude), concurrency, polling, user access, and new projects. For Zoho
            Sprints / Jira / Cliq setup, see <strong>User Guide</strong>.
          </p>
        </div>

        <div className="flex gap-2 border-b border-[color:var(--color-border-800)]">
          {([
            ['settings', 'Settings'],
            ['users', 'User Management'],
            ['newProject', 'Add Project'],
          ] as [Tab, string][]).map(([key, label]) => (
              <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                      tab === key
                          ? 'border-b-2 border-[color:var(--color-accent-primary)] text-[color:var(--color-accent-primary)]'
                          : 'text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]'
                  }`}
              >
                {label}
              </button>
          ))}
        </div>

        {tab === 'settings' && <SettingsPanel />}
        {tab === 'users' && <UserManagementPanel />}
        {tab === 'newProject' && <AddProjectPanel />}
      </div>
  );
}
