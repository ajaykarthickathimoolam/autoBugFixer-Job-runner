import { useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { JiraConnectionTestResponse } from '../lib/types';
import { CopyButton } from './CopyButton';

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">{label}</label>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-xs">
            {value}
          </code>
          <CopyButton value={value} />
        </div>
      </div>
  );
}

const inputCls =
    'w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]';

export function JiraConnectionWizard() {
  const [baseUrl, setBaseUrl] = useState('https://');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JiraConnectionTestResponse | null>(null);

  async function testConnection() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.testJiraConnection({ baseUrl, email, apiToken });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  return (
      <div className="glow-border flex flex-col gap-5 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
        <div>
          <h2 className="text-lg font-semibold">Jira Cloud connection setup</h2>
          <p className="text-sm text-[color:var(--color-text-400)]">
            Verifies email + API token against <code>/rest/api/3/myself</code>, then lists projects so you can
            paste the key into a CodeHealer project. Jira Cloud does not accept an account password.
          </p>
        </div>

        <ol className="flex flex-col gap-3 text-sm">
          <li>
            <span className="font-medium">1.</span> Create an API token at{' '}
            <a
                className="text-[color:var(--color-accent-primary)] underline"
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
            >
              id.atlassian.com/manage-profile/security/api-tokens
            </a>
            .
          </li>
          <li>
            <span className="font-medium">2.</span> Enter the site URL (e.g. <code>https://yourorg.atlassian.net</code>),
            the Atlassian account email, and that token. Test before saving them on the project.
          </li>
        </ol>

        <Field label="Jira site URL">
          <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
        <Field label="Account email">
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="API token">
          <input className={inputCls} type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
        </Field>

        <button
            onClick={testConnection}
            disabled={testing}
            className="w-fit rounded-lg bg-[color:var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>

        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}

        {result && (
            <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-accent-green)]/30 p-4">
              <p className="text-sm text-[color:var(--color-accent-green)]">
                Authenticated as {result.displayName} ({result.email})
                {result.timeZone ? ` · timezone ${result.timeZone}` : ''}
              </p>
              <CopyableField label="Site URL (paste into the project)" value={baseUrl.replace(/\/$/, '')} />
              <p className="text-xs font-medium text-[color:var(--color-text-400)]">Projects this token can see</p>
              <ul className="flex flex-col gap-1 text-sm">
                {result.projects.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-2">
                      <span>
                        <code className="text-[color:var(--color-accent-green)]">{p.key}</code> {p.name}
                      </span>
                      <CopyButton value={p.key} />
                    </li>
                ))}
                {result.projects.length === 0 && (
                    <li className="text-[color:var(--color-text-600)]">No projects returned.</li>
                )}
              </ul>
              <p className="text-xs text-[color:var(--color-text-600)]">
                Optional webhook (faster than polling): in Jira go to Settings → System → Webhooks. URL{' '}
                <code>/api/webhooks/jira?projectId=YOUR_CODEHEALER_PROJECT_ID&amp;secret=YOUR_SECRET</code>, events
                issue created / updated and comment created. Polling still runs even if the webhook is not set.
              </p>
            </div>
        )}
      </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">{label}</label>
        {children}
      </div>
  );
}
