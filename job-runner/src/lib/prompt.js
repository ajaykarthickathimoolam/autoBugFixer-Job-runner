import path from 'path';

const CLARIFICATION_INSTRUCTIONS = {
  NONE:
      'Never ask a clarifying question, no matter how ambiguous the ticket is. Make the most reasonable ' +
      'assumption you can, note that assumption briefly in your summary, and always attempt a fix. Do not ' +
      'output NEEDS_INPUT under any circumstance.',
  LOW:
      'Only ask a clarifying question if the ticket is so ambiguous that any fix you attempt would very likely ' +
      'be wrong - prefer making a reasonable, documented assumption over asking whenever there is a plausible ' +
      'interpretation. If you truly must ask, make no code changes and output a single line in exactly this ' +
      'format as the last line of your response: NEEDS_INPUT: <your question>',
  MEDIUM:
      'If the ticket is genuinely ambiguous and you cannot proceed correctly without more information from a ' +
      'human (e.g. conflicting requirements, an undefined expected behavior), do NOT guess. Instead, make no ' +
      'code changes and output a single line in exactly this format as the last line of your response: ' +
      'NEEDS_INPUT: <your question>',
  HIGH:
      'Err on the side of asking: if there is any meaningful ambiguity, more than one reasonable interpretation, ' +
      'or a missing detail that could change the fix, do NOT guess. Instead, make no code changes and output a ' +
      'single line in exactly this format as the last line of your response: NEEDS_INPUT: <your question>',
};

/** serviceDirs: [{ service: {name, architectureMd, ...}, dir: string }] - one entry per service,
 * each already checked out on its own feature branch in its own subfolder of the current cwd.
 * clarificationLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' - admin-configured, how readily Claude
 * should pause and ask instead of guessing; defaults to MEDIUM if missing/unrecognized. */
export function buildFixPrompt(task, serviceDirs, clarificationLevel) {
  const serviceBlocks = serviceDirs
      .map(
          ({ service, dir }) =>
              `### Service "${service.name}" - folder ./${path.basename(dir)}\n${service.architectureMd || '(no architecture overview provided)'}`
      )
      .join('\n\n');

  const clarificationInstruction =
      CLARIFICATION_INSTRUCTIONS[clarificationLevel] || CLARIFICATION_INSTRUCTIONS.MEDIUM;

  return [
    `You are fixing a bug ticket for the "${task.projectName}" project.`,
    '',
    `Ticket: ${task.ticketTitle || task.ticketId}`,
    'Description:',
    task.ticketDescription || '(no description provided)',
    '',
    'Project architecture overview:',
    task.projectArchitectureMd || '(none provided)',
    '',
    `This checkout has ${serviceDirs.length} service(s) as sibling subfolders of the current directory, each already on its own feature branch:`,
    serviceBlocks,
    '',
    'Instructions:',
    '1. Decide for yourself which service(s) above are actually affected by this bug - it may be just one, or more than one if the fix genuinely spans services.',
    '2. Investigate the relevant subfolder(s) and implement a minimal, correct fix. Do not touch subfolders for services that are not relevant to this bug.',
    '3. Do not make unrelated changes, refactors, or dependency upgrades.',
    '4. Do not commit, push, or open a pull request in any subfolder - the caller handles that separately, per changed service, after you finish.',
    `5. ${clarificationInstruction}`,
  ].join('\n');
}
