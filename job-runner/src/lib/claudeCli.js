import { runSandboxedArgv } from './sandbox.js';

/**
 * Invokes Claude Code inside the per-command bubblewrap sandbox when bubblewrap is available.
 * --dangerously-skip-permissions is limited to that sandbox: the child environment does not
 * include the GitHub token or the internal shared secret, and other jobs' directories are not mounted.
 * The prompt is one argv element, so ticket text is not parsed as a shell command.
 */
export async function runClaudeCli({ cwd, prompt, apiKey, onLog }) {
  const extraEnv = {};
  if (apiKey) extraEnv.ANTHROPIC_API_KEY = apiKey;
  const result = await runSandboxedArgv({
    cwd,
    argv: ['claude', '-p', prompt, '--dangerously-skip-permissions', '--output-format', 'text'],
    extraEnv,
    timeoutMs: 20 * 60 * 1000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (onLog && output) onLog(output);
  if (result.code !== 0) {
    throw new Error(`claude CLI exited with code ${result.code}: ${output.slice(-2000)}`);
  }
  return output;
}
