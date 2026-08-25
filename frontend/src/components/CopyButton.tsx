import { useState } from 'react';

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
      <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="shrink-0 rounded-md border border-[color:var(--color-border-800)] px-2 py-1 text-xs text-[color:var(--color-text-400)] hover:border-[color:var(--color-accent-primary)]/50 hover:text-[color:var(--color-accent-primary)]"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
  );
}
