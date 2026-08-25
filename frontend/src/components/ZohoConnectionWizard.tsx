import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { ZohoConnectionTestResponse } from '../lib/types';
import { CopyButton } from './CopyButton';

const SCOPES =
    'ZohoSprints.teams.READ,ZohoSprints.projects.READ,ZohoSprints.sprints.READ,ZohoSprints.items.READ,ZohoSprints.comments.READ,ZohoSprints.comments.CREATE,ZohoSprints.comments.UPDATE,ZohoSprints.comments.DELETE';

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

export function ZohoConnectionWizard() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [code, setCode] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ZohoConnectionTestResponse | null>(null);
  const [showRefreshToken, setShowRefreshToken] = useState(false);

  async function testConnection() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.testZohoConnection({ clientId, clientSecret, code });
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
          <h2 className="text-lg font-semibold">Zoho Sprints connection setup</h2>
          <p className="text-sm text-[color:var(--color-text-400)]">
            For projects using Polling sync mode - generates the OAuth refresh token and looks up your Team ID and
            project IDs, so you don't need to run any curl commands yourself.
          </p>
        </div>

        <ol className="flex flex-col gap-3 text-sm">
          <li>
            <span className="font-medium">1.</span> Go to{' '}
            <a
                href="https://api-console.zoho.in/"
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--color-accent-teal)] hover:underline"
            >
              api-console.zoho.in
            </a>{' '}
            and sign in with your own account. (If your Zoho org is on a different data center, use that domain's
            console instead - e.g. api-console.zoho.com, .eu, .com.au, .jp.)
          </li>
          <li>
            <span className="font-medium">2.</span> Click <strong>Add Client → Self Client → Create</strong>. Copy
            the Client ID and Client Secret it shows you into the form below.
          </li>
          <li>
            <span className="font-medium">3.</span> Open that Self Client's <strong>Generate Code</strong> tab. In
            the Scope box, paste exactly:
            <div className="mt-2 flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-xs">
                {SCOPES}
              </code>
              <CopyButton value={SCOPES} />
            </div>
          </li>
          <li>
            <span className="font-medium">4.</span> Pick the longest code expiry offered, click{' '}
            <strong>Create</strong>, and paste that generated code into the "Generated code" field below (not the
            Client Secret field). It's single-use and expires in minutes, so click "Test connection" right after
            generating it. <strong>Warning:</strong> both this code and the OAuth Refresh Token shown after a
            successful test start with the same <code>1000.</code> prefix and look alike - they are different
            values used in different places. This code only ever goes into the "Generated code" field below; the
            Refresh Token that appears after clicking "Test connection" is the one that goes into the Project's
            "OAuth Refresh Token" field.
          </li>
        </ol>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Client ID</label>
            <input className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Client Secret</label>
            <input
                className={inputCls}
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Generated code</label>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-[color:var(--color-accent-red)]">{error}</p>}

        <button
            onClick={testConnection}
            disabled={testing || !clientId || !clientSecret || !code}
            className="w-fit rounded-lg bg-[color:var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] disabled:opacity-50"
        >
          {testing ? 'Testing connection…' : 'Test connection'}
        </button>

        {result && (
            <div className="flex flex-col gap-4 rounded-xl border border-[color:var(--color-accent-green)]/30 p-4">
              <p className="text-sm font-medium text-[color:var(--color-accent-green)]">
                Connected to team {result.teamName ?? result.teamId}
              </p>

              <CopyableField label="Zoho Team ID" value={result.teamId} />

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-[color:var(--color-text-400)]">
                    OAuth Refresh Token (keep this secret) - paste THIS into the Project's "OAuth Refresh Token"
                    field, not the code you typed above
                  </label>
                  <button
                      type="button"
                      onClick={() => setShowRefreshToken((v) => !v)}
                      className="text-xs text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]"
                  >
                    {showRefreshToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-xs">
                    {showRefreshToken ? result.refreshToken : '•'.repeat(40)}
                  </code>
                  <CopyButton value={result.refreshToken} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-[color:var(--color-text-400)]">
                  Projects under this team - copy the ID of the one you want to poll
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                    <tr className="text-xs text-[color:var(--color-text-400)]">
                      <th className="pb-2 pr-4">Project name</th>
                      <th className="pb-2 pr-4">Prefix</th>
                      <th className="pb-2 pr-4">Project ID</th>
                      <th className="pb-2"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {result.projects.map((p) => (
                        <tr key={p.id} className="border-t border-[color:var(--color-border-800)]">
                          <td className="py-2 pr-4 font-medium">{p.name ?? '—'}</td>
                          <td className="py-2 pr-4 text-[color:var(--color-text-400)]">{p.prefix ?? '—'}</td>
                          <td className="py-2 pr-4 font-mono-brand text-xs">{p.id}</td>
                          <td className="py-2">
                            <CopyButton value={p.id} />
                          </td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-[color:var(--color-text-600)]">
                Now go to Projects → New/Edit project, set Sync mode to Polling, and paste the Team ID, the Project
                ID of your board, the Client ID/Secret, and the Refresh Token in.
              </p>
            </div>
        )}
      </div>
  );
}
