import { execFile, exec } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const execP = promisify(exec);

const MAX_BUFFER = 1024 * 1024 * 20;

/**
 * Runs a command with an argv array (no shell) - use for anything that touches
 * untrusted/ticket-derived strings (git operations, branch names, etc).
 */
export async function run(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileP(cmd, args, { maxBuffer: MAX_BUFFER, ...opts });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || err.message, code: err.code ?? 1 };
  }
}

/**
 * Runs a shell command string - only ever used for admin-configured build/test commands,
 * never with ticket/AI-generated content interpolated in.
 */
export async function runShell(command, opts = {}) {
  try {
    const { stdout, stderr } = await execP(command, { maxBuffer: MAX_BUFFER, ...opts });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || err.message, code: err.code ?? 1 };
  }
}
