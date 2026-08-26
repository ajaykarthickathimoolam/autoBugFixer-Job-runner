const DEFAULT_TIMEOUT_MS = 180_000;

function stripSlash(url) {
  let s = (url || '').trim();
  while (s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  return s;
}

function completionsUrl({ endpoint, deployment, apiVersion }) {
  const base = stripSlash(endpoint);
  const dep = encodeURIComponent((deployment || '').trim());
  const ver = encodeURIComponent((apiVersion || '2025-01-01-preview').trim());
  return `${base}/openai/deployments/${dep}/chat/completions?api-version=${ver}`;
}

function extractText(content) {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      return part?.text || part?.content || '';
    }).join('');
  }
  return String(content);
}

/**
 * One Azure OpenAI chat-completions call. Auth is the `api-key` header (Azure dialect).
 */
export async function azureChat({ endpoint, apiKey, apiVersion, deployment, messages, tools, maxCompletionTokens = 16000 }) {
  if (!endpoint || !apiKey || !deployment) {
    throw new Error('Azure OpenAI endpoint, API key, and deployment name are required');
  }

  const url = completionsUrl({ endpoint, deployment, apiVersion });
  const body = {
    model: deployment.trim(),
    messages,
    max_completion_tokens: maxCompletionTokens,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey.trim(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const raw = await res.text();
  if (!res.ok) {
    const snippet = raw.replace(apiKey.trim(), '***').slice(0, 800);
    throw new Error(`Azure OpenAI HTTP ${res.status}: ${snippet}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Azure OpenAI returned non-JSON');
  }
  const choice = json.choices?.[0];
  if (!choice) {
    throw new Error('Azure OpenAI returned no choices');
  }
  const message = choice.message || {};
  return {
    content: extractText(message.content),
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    finishReason: choice.finish_reason || '',
    rawMessage: message,
  };
}
