import { CopyButton } from './CopyButton';

interface GuideStep {
  text: string;
  command?: string;
}

export function CredentialGuide({ steps }: { steps: GuideStep[] }) {
  return (
      <ol className="mt-2 flex flex-col gap-2 rounded-lg border border-[color:var(--color-border-800)] p-3 text-xs text-[color:var(--color-text-400)]">
        {steps.map((step, i) => (
            <li key={i}>
              <span className="font-medium text-[color:var(--color-text-100)]">{i + 1}.</span> {step.text}
              {step.command && (
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-2 py-1 text-xs text-[color:var(--color-text-100)]">
                      {step.command}
                    </code>
                    <CopyButton value={step.command} />
                  </div>
              )}
            </li>
        ))}
      </ol>
  );
}
