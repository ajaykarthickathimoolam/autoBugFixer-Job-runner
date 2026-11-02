import type { ReactNode } from 'react';
import { ZohoConnectionWizard } from '../components/ZohoConnectionWizard';
import { JiraConnectionWizard } from '../components/JiraConnectionWizard';
import { CopyButton } from '../components/CopyButton';

const LOGIN_COMMAND = 'docker exec -it codehealer-job-runner claude';

const CLIQ_HANDLER_SCRIPT = `payload = body.toMap();
message = payload.get("text");
zoho.cliq.postToChannel("codehealer", message);
return Map();`;

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
      <div className="glow-border flex flex-col gap-4 rounded-2xl bg-[color:var(--color-panel-900)]/80 p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
  );
}

export function UserGuidePage() {
  return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <p className="eyebrow">Setup</p>
          <h1 className="page-title">User Guide</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-400)]">One-time setup for the fixer (GPT or Claude), Zoho Sprints or Jira Cloud, and Zoho Cliq notifications</p>
        </div>

        <SectionCard title="1. Fixer (GPT or Claude)">
          <p className="text-xs text-[color:var(--color-text-600)]">
            On <strong>Admin → Settings</strong> pick the fixer. GPT uses Azure OpenAI (endpoint, deployment, API version,
            API key). Claude uses the Claude Code CLI in the job-runner.
          </p>
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-[color:var(--color-text-400)]">Claude CLI login (only if fixer = Claude)</span>
              <span className="rounded-full border border-[color:var(--color-accent-green)]/30 px-2 py-0.5 text-xs text-[color:var(--color-accent-green)]">
                CLI subscription login
              </span>
            </div>
            <p className="text-xs text-[color:var(--color-text-600)]">
              The fix step runs through job-runner's Claude Code CLI, using whichever Claude.ai account (Pro/Max)
              is logged into that container - no API key needed.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-xs">
                {LOGIN_COMMAND}
              </code>
              <CopyButton value={LOGIN_COMMAND} />
            </div>
            <p className="mt-1 text-xs text-[color:var(--color-text-600)]">
              Run that, then type <code>/login</code> inside the CLI and follow the browser prompt. The session
              persists across restarts - only redo this if it's ever logged out.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="2. Zoho Sprints connection setup">
          <ZohoConnectionWizard />
        </SectionCard>

        <SectionCard title="3. Jira Cloud connection setup">
          <JiraConnectionWizard />
        </SectionCard>

        <SectionCard title="4. Zoho Cliq bot setup">
          <p className="text-sm text-[color:var(--color-text-400)]">
            Lets CodeHealer post a message into a Cliq channel whenever a PR is opened or a fix fails. The bot's
            Incoming Webhook Handler is what actually delivers the message - a plain webhook URL alone isn't enough.
          </p>
          <ol className="flex flex-col gap-3 text-sm">
            <li>
              <span className="font-medium">1.</span> In Zoho Cliq, go to your profile/avatar menu → look for{' '}
              <strong>Bots, Extensions &amp; Webhooks</strong> (this is an org-level section, not something inside a
              channel's own settings). Create a bot - e.g. named <code>codehealer</code> - or open an existing one.
            </li>
            <li>
              <span className="font-medium">2.</span> Note the unique name of the channel you want notifications
              posted to (visible in that channel's own <strong>API</strong> tab as "Unique Name"). The example
              script below assumes it's <code>codehealer</code> - change it if yours is different.
            </li>
            <li>
              <span className="font-medium">3.</span> On the bot, open <strong>Handlers → Incoming Webhook
              Handler → Edit Code</strong> and replace it with exactly this, then save:
              <div className="relative mt-2">
                <pre className="overflow-x-auto rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 pr-16 text-xs">
                  {CLIQ_HANDLER_SCRIPT}
                </pre>
                <div className="absolute right-2 top-2">
                  <CopyButton value={CLIQ_HANDLER_SCRIPT} />
                </div>
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-text-600)]">
                This parses the JSON body CodeHealer sends (<code>{'{"text": "..."}'}</code>) and posts the message
                into the channel by name. The handler's return value is just the HTTP response, not another
                message - returning an empty <code>Map()</code> avoids an extra "ok" reply showing up in the bot's
                own chat.
              </p>
            </li>
            <li>
              <span className="font-medium">4.</span> On the bot's <strong>Webhook Tokens</strong> section, click{' '}
              <strong>Generate New Token</strong> and copy the token value (up to 5 tokens per bot).
            </li>
            <li>
              <span className="font-medium">5.</span> Build the full webhook URL - the bot's incoming endpoint (
              <em>not</em> its "message" endpoint, which would skip the handler script above) plus that token:
              <div className="mt-2 rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-xs">
                https://cliq.zoho.in/api/v2/bots/<em>your-bot-name</em>/incoming?zapikey=<em>your-token</em>
              </div>
              (Use whichever Zoho data-center domain your org is on - <code>.in</code>, <code>.com</code>,{' '}
              <code>.eu</code>, etc.)
            </li>
            <li>
              <span className="font-medium">6.</span> Paste that URL into CodeHealer's <strong>Projects → edit
              project → "Zoho Cliq Webhook URL"</strong> field and save. The next PR or failure on that project
              will post into the channel.
            </li>
          </ol>
        </SectionCard>
      </div>
  );
}
