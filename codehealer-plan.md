# CodeHealer — Project Plan

## Context
CodeHealer is an internal tool that automatically fixes bugs reported as tickets on a Zoho Sprints board. When a bug ticket is created, a webhook notifies CodeHealer, which uses Claude (via API) to understand the ticket, locate the relevant service(s) in the target project's codebase, generate a fix, verify it builds/tests cleanly, open a pull request against the correct base branch, and post the PR link to the project's Zoho Cliq channel — with minimal human intervention until PR review.

## Architecture

### Containers (docker-compose)
1. **frontend** — React app, dark cyber-themed UI with SVG animations
2. **backend** — Java Spring Boot monolith:
   - API gateway concerns: JWT token verification, rate limiting, input sanitization (XSS/NoSQLi/injection guard) — with extra hardening around the Zoho webhook endpoint and any input that reaches shell/Claude CLI execution (never string-interpolate untrusted input into shell commands)
   - Business logic, MongoDB access
   - SSE endpoint for real-time UI updates
   - Orchestrates job-runner via internal API
3. **mongodb** — primary datastore
4. **job-runner** — dedicated container with git, Claude CLI, and build tooling installed. Backend triggers it per task via internal API. Maintains a **persistent base clone per service** at `/workspace/{project}/{service}`, kept on its base branch and refreshed (`git reset --hard` + `git clean -fd` + `git pull`) before each task to guard against a dirty/broken state. Each task then does a **local clone of that persistent copy** into an isolated temp folder (e.g. `/workspace/{project}/{service}/tasks/{taskId}`), checks out `feature/{ticket-id}`, and does its work there; the temp folder is deleted after the task completes (success or failure). Since jobs on the same service are serialized (see Core Flow), there's no contention on the persistent base copy.

### Zoho Webhook Signature Verification
Webhook endpoint must verify a shared-secret/signature header before accepting a payload, to prevent forged tickets from triggering fix jobs.

## Data Model (MongoDB)

**users**: username, hashed password (seed: `sarathi` / `sarathi@7`), JWT auth, single role (no RBAC for v1)

**projects**: name, architecture.md (project-level), Zoho board ID (1:1 mapping to project), Zoho Cliq webhook URL (per-project), GitHub SSH private key (encrypted, per-project)

**services** (embedded/linked under project): name, git repo URL, base branch (per-service), architecture.md (per-service), build command, test command (optional — skip verification if blank)

**jobs**: ticket ID, project ID, service ID(s) involved, status (received → analyzing → cloning → fixing → verifying → pr_created → notified → failed), Claude execution logs, PR URL, timestamps

**settings**: Claude API token (encrypted, editable/rotatable via Admin page), global max-concurrent-jobs cap (admin-configurable)

All secrets (SSH keys, Claude API token, Cliq webhook URLs) stored encrypted in MongoDB, decrypted in-memory by the backend only when needed.

## Core Flow

1. Zoho Sprints webhook fires on new bug ticket → backend verifies signature → looks up project by Zoho board ID
2. Backend calls Claude with the project-level architecture.md (+ service-level MD summaries) and ticket details → Claude determines which service(s) need to be cloned (may be more than one)
3. Job enters a **per-service queue** — only one active job per service at a time; jobs on different services/projects run concurrently, bounded by a **global max-concurrent-jobs cap**
4. Job-runner refreshes the persistent base clone for the identified service(s) (`git reset --hard` + `git clean -fd` + `git pull` using the project's SSH key, on the service's base branch), then locally clones that persistent copy into an isolated task workspace and checks out a new branch named `feature/{ticket-id}`
5. Claude CLI (invoked with the project's Claude API token) makes the fix in the task workspace on the `feature/{ticket-id}` branch
6. If a build/test command is configured for the service, it runs in the isolated workspace to verify the fix; results are logged regardless of pass/fail
7. Job-runner commits, pushes the branch, and opens a PR against the service's base branch (no auto-approval/merge)
8. PR URL is posted to the project's Zoho Cliq channel
9. Service-level architecture.md is updated to reflect the change made, keeping docs current
10. Task workspace is deleted from the job-runner volume
11. On any failure (Claude error, timeout, clone/push failure) — job marked `failed`, and a failure notification is posted to the project's Zoho Cliq channel
12. Throughout, SSE pushes job status changes, live Claude execution logs, and dashboard stat updates to connected clients

## UI Pages

- **Login**: username/password → JWT
- **Dashboard**: total bugs, fixed count, bar chart (day/week/month grouping, date-range picker), project filter, live-updating via SSE
- **Project Management**: create/edit/delete projects; per project — name, Zoho board ID, Zoho Cliq webhook, GitHub SSH key, project architecture.md; manage services within a project — name, repo URL, base branch, service architecture.md, build/test commands; add/edit/delete services anytime
- **Admin**: input/update/rotate the Claude API token; configure global max-concurrent-jobs cap

## Key Risks Addressed
- Command injection: no shell string interpolation of ticket/AI content; parameterized process execution only
- Untrusted execution: build/test/Claude CLI runs isolated in the job-runner container/workspace, unprivileged
- Branch races: per-service serialization prevents concurrent pushes to the same service/base branch
- Resource/rate-limit exhaustion: global concurrency cap, configurable by admin
- Webhook forgery: signature verification required on the Zoho webhook endpoint

## Verification Plan
- `docker compose up` brings up all 4 containers; confirm frontend reachable, backend health endpoint responds, MongoDB connection established
- Seed admin user, log in, confirm JWT issued and dashboard loads (empty state)
- Create a test project with one service pointing at a small test repo; confirm SSH key + architecture.md upload works
- Simulate a Zoho webhook payload (signed) against a test ticket; confirm: job appears in dashboard with SSE status updates, correct service is selected, workspace is cloned, Claude CLI invocation is logged, build/test runs if configured, PR is opened on the test repo, PR URL posted to test Cliq channel, workspace is cleaned up, service architecture.md is updated
- Trigger two tickets on the same service simultaneously; confirm second job queues rather than racing
- Trigger a forced Claude failure (bad API token); confirm job marked failed and Cliq failure notification sent
- Rotate the Claude API token via Admin page; confirm subsequent jobs use the new token

## Future Ideas (Backlog)

### Human-in-the-loop clarification via the Zoho ticket — IMPLEMENTED AND VERIFIED END TO END
If Claude Code hits something it's genuinely unsure about while fixing a ticket, give it
a real "ask a question" escape hatch instead of guessing or just failing — but route it
through the Zoho ticket itself (where testers/PMs already live), not a new answer box
inside CodeHealer.

Flow: Claude signals it needs clarification (a parseable marker in its output) → job
pauses in a new `AWAITING_INPUT` status (per-service lock stays held, blocking other
tickets on that same service until resolved) → the question gets posted as a **comment
on the Zoho item** → the existing poller, on each cycle, checks paused items for a reply
comment → once a human replies on the ticket, CodeHealer kicks off a fresh fix run with
the original ticket + Claude's question + the human's answer folded in as context (a new
task, not a resumed CLI session — simpler and avoids depending on unverified Claude Code
headless session-resume behavior).

All of the plumbing above is built and compiles/type-checks: `JobStatus.AWAITING_INPUT`,
`Job.pendingQuestion` + `Job.zohoItemContainerId`, the `NEEDS_INPUT: <question>` marker
convention in the fix prompt, `taskRunner.js` detecting it and pausing (skipping cleanup/PR
for that run instead of failing), `JobOrchestrationService.run()` looping indefinitely
while a job sits in `AWAITING_INPUT` instead of timing out, `resumeAfterInput(...)` to
kick off the continuation task once a reply is found, `ZohoSprintsPollerService` checking
every `AWAITING_INPUT` job each cycle via a new `ZohoCommentsService`, and the frontend
(`JobDetailPage`/`StatusBadge`/`types.ts`) showing the paused state and question.

**Confirmed live against a real ticket on 2026-08-22, both directions:**
- Posting: `POST .../modules/{moduleId}/entity/{itemId}/notes/?action=addnotes`, multipart
  form with a single `name` field containing the comment as `<div>...</div>` — the exact
  request captured live from the Zoho Sprints web UI. It initially failed with
  `{"code":7601,"message":"Invalid oauthscope"}` until the project's Zoho connection was
  re-authorized (via the Admin wizard) with `ZohoSprints.comments.READ,.CREATE,.UPDATE,.DELETE`
  added to scope — the wizard's suggested scope string now includes these by default.
- Reading: `GET .../item/{id}/activity/` returns a manually-added comment as a `display`
  value of the form `A comment <content> <span class="...">has been added</span>` -
  `ZohoCommentsService.findReplyAfter` matches that exact pattern, confirmed to extract
  clean reply text.
- The `ZohoDebugController` used for this manual verification has been removed now that
  both directions are confirmed; the production path (`InternalJobEventController` →
  `ZohoCommentsService`, and the poller's `checkAwaitingInputJob`) is unchanged.

Also note: the global concurrency slot (in `JobQueueService`) is held for a paused job's
entire wait, same as it already was for a normal long-running job — enough simultaneously
paused jobs can starve the global cap of room for new work. Not changed here; flag if it
becomes a real problem in practice.

Touches (all applied): `backend/.../model/JobStatus.java`, `Job.java`,
`JobResponse.java`, `JobRepository.java`, `JobController.java`, `JobIntakeService.java`,
`JobOrchestrationService.java`, `InternalJobEventController.java`,
`ZohoSprintsPollerService.java`, new `ZohoCommentsService.java`;
`job-runner/src/lib/prompt.js`, `job-runner/src/taskRunner.js`; frontend
`src/lib/types.ts`, `src/components/StatusBadge.tsx`, `src/pages/JobDetailPage.tsx`.
