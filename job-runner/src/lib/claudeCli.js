import { spawn } from 'child_process';

/**
 * Invokes Anthropic's Claude Code CLI in non-interactive "print" mode inside an isolated task
 * workspace. --dangerously-skip-permissions is required for unattended tool use (file edits,
 * bash) - acceptable here because this runs inside a dedicated, unprivileged, disposable
 * container/workspace (see plan's "Untrusted execution" risk mitigation).
 *
 * The prompt is passed as a single argv element (spawn without a shell), so untrusted ticket
 * text in it cannot be interpreted as shell syntax.
 */
export function runClaudeCli({ cwd, prompt, apiKey, onLog }) {
  return new Promise((resolve, reject) => {
    // apiKey is optional: if omitted, the CLI falls back to whatever session `claude` is already
    // logged into in this container (a Claude.ai subscription login persisted on a volume),
    // rather than metered API billing.
    const env = { ...process.env };
    if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey;
    } else {
      delete env.ANTHROPIC_API_KEY;
    }

    const child = spawn(
        'claude',
        ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'text'],
        // stdin explicitly closed - otherwise the CLI waits ~3s for input that will never come.
        { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let output = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      if (onLog) onLog(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      if (onLog) onLog(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`claude CLI exited with code ${code}: ${output.slice(-2000)}`));
      }
    });
  });
}
