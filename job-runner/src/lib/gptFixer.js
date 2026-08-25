import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { azureChat } from './azureOpenAi.js';

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

function resolveSafe(cwd, rel) {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, rel || '.');
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`path escapes workspace: ${rel}`);
  }
  return resolved;
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
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: { ...process.env, AZURE_OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (chunk) => {
      out += chunk.toString();
      if (out.length > MAX_TOOL_RESULT * 2) {
        out = out.slice(-MAX_TOOL_RESULT);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, COMMAND_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(truncate(`exit ${code}\n${out}`));
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(`failed to start: ${err.message}`);
    });
  });
}

async function executeTool(cwd, name, args) {
  if (name === 'list_dir') {
    const dir = resolveSafe(cwd, args.path || '.');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
        .slice(0, 200)
        .map((e) => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
        .join('\n') || '(empty)';
  }
  if (name === 'read_file') {
    const file = resolveSafe(cwd, args.path);
    const text = await fs.readFile(file, 'utf8');
    return truncate(text, MAX_FILE_CHARS);
  }
  if (name === 'write_file') {
    const file = resolveSafe(cwd, args.path);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, args.contents == null ? '' : String(args.contents), 'utf8');
    return `wrote ${args.path} (${String(args.contents || '').length} chars)`;
  }
  if (name === 'grep') {
    const target = resolveSafe(cwd, args.path || '.');
    const rel = path.relative(cwd, target) || '.';
    return runCommand(
        cwd,
        `if command -v rg >/dev/null 2>&1; then rg -n --hidden -g '!node_modules' -g '!.git' -e ${shellQuote(args.pattern)} ${shellQuote(rel)} || true; else grep -R -n --exclude-dir=node_modules --exclude-dir=.git ${shellQuote(args.pattern)} ${shellQuote(rel)} || true; fi`
    );
  }
  if (name === 'run_command') {
    const command = String(args.command || '').trim();
    if (!command) {
      return 'empty command';
    }
    if (/\bgit\s+(commit|push|remote)\b/i.test(command)) {
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
        onLog(`[gpt tool] ${name} ${JSON.stringify(args).slice(0, 200)}`);
      }
      let result;
      try {
        result = await executeTool(cwd, name, args);
      } catch (err) {
        result = `error: ${err.message}`;
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
