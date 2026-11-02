import fs from 'fs/promises';
import path from 'path';
import { azureChat } from './azureOpenAi.js';
import { redactSecrets } from './redact.js';
import { isDeniedRelative, resolveInside } from './pathPolicy.js';
import { runSandboxedShell } from './sandbox.js';
import { addTokens, noteFileChanged, noteFileRead } from './jobContext.js';

const MAX_ROUNDS = 40;
const MAX_FILE_CHARS = 80_000;
const MAX_TOOL_RESULT = 20_000;
const COMMAND_TIMEOUT_MS = 60_000;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders under a path relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory. Defaults to .' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a text file relative to the workspace root. Creates parent folders.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          contents: { type: 'string' },
        },
        required: ['path', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents under a path for a regex/string.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'Relative file or directory. Defaults to .' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a short shell command in the workspace (ls, find, mvn, tests). Do not git commit/push.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
    },
  },
];

function relativeTo(cwd, absolute) {
  const rel = path.relative(cwd, absolute);
  return rel.split(path.sep).join('/');
}

function blockedGit(command) {
  return /\bgit\b/i.test(command) && /\b(commit|push|remote)\b/i.test(command);
}

function truncate(text, max = MAX_TOOL_RESULT) {
  const s = text == null ? '' : String(text);
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n…(truncated ${s.length - max} chars)`;
}

function parseArgs(raw) {
  if (!raw) {
    return {};
  }
  if (typeof raw === 'object') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function runCommand(cwd, command) {
  const result = await runSandboxedShell({ cwd, command, timeoutMs: COMMAND_TIMEOUT_MS });
  return truncate(redactSecrets(`exit ${result.code}\n${result.stdout || ''}${result.stderr || ''}`));
}

async function executeTool(cwd, name, args) {
  if (name === 'list_dir') {
    const dir = await resolveInside(cwd, args.path || '.');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .filter((entry) => !isDeniedRelative(entry.name) && entry.name !== '.git')
        .slice(0, 200)
        .map((entry) => `${entry.isDirectory() ? 'd' : 'f'} ${entry.name}`)
        .join('\n') || '(empty)';
  }
  if (name === 'read_file') {
    const file = await resolveInside(cwd, args.path);
    noteFileRead(relativeTo(cwd, file));
    const text = await fs.readFile(file, 'utf8');
    return truncate(redactSecrets(text), MAX_FILE_CHARS);
  }
  if (name === 'write_file') {
    const file = await resolveInside(cwd, args.path);
    noteFileChanged(relativeTo(cwd, file));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, args.contents == null ? '' : String(args.contents), 'utf8');
    return `wrote ${args.path} (${String(args.contents || '').length} chars)`;
  }
  if (name === 'grep') {
    const target = await resolveInside(cwd, args.path || '.');
    noteFileRead(relativeTo(cwd, target));
    const rel = relativeTo(cwd, target) || '.';
    return runCommand(
        cwd,
        `if command -v rg >/dev/null 2>&1; then rg -n --hidden -g '!node_modules' -g '!.git' -g '!.env' -g '!.env.*' -e ${shellQuote(args.pattern)} ${shellQuote(rel)} || true; else grep -R -n --exclude-dir=node_modules --exclude-dir=.git --exclude=.env ${shellQuote(args.pattern)} ${shellQuote(rel)} || true; fi`
    );
  }
  if (name === 'run_command') {
    const command = String(args.command || '').trim();
    if (!command) {
      return 'empty command';
    }
    if (blockedGit(command)) {
      return 'blocked: git commit/push/remote is handled by CodeHealer after you finish';
    }
    return runCommand(cwd, command);
  }
  return `unknown tool ${name}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * GPT fixer using Azure OpenAI tool calls against the already-cloned task workspace.
 */
export async function runGptFixer({ cwd, prompt, azure, onLog }) {
  const messages = [
    {
      role: 'system',
      content:
          'You are a senior engineer applying a minimal bug fix in a local git checkout. '
          + 'Use tools to inspect and edit files. Do not commit, push, or open a pull request. '
          + 'When finished, reply with a short summary of what you changed. '
          + 'If you cannot proceed without a human answer, make no edits and end with a line: NEEDS_INPUT: <question>',
    },
    { role: 'user', content: prompt },
  ];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const reply = await azureChat({
      endpoint: azure.endpoint,
      apiKey: azure.apiKey,
      apiVersion: azure.apiVersion,
      deployment: azure.deployment,
      messages,
      tools: TOOLS,
    });
    addTokens(reply.usage?.prompt_tokens, reply.usage?.completion_tokens);

    if (!reply.toolCalls.length) {
      if (onLog && reply.content) {
        onLog(reply.content);
      }
      return reply.content || '';
    }

    messages.push({
      role: 'assistant',
      content: reply.content || null,
      tool_calls: reply.toolCalls,
    });

    for (const call of reply.toolCalls) {
      const name = call.function?.name || call.name;
      const args = parseArgs(call.function?.arguments);
      if (onLog) {
        onLog(`[gpt tool] ${name} ${redactSecrets(JSON.stringify(args)).slice(0, 200)}`);
      }
      let result;
      try {
        result = await executeTool(cwd, name, args);
      } catch (err) {
        result = redactSecrets(`error: ${err.message}`);
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  throw new Error(`GPT fixer exceeded ${MAX_ROUNDS} tool rounds without finishing`);
}
