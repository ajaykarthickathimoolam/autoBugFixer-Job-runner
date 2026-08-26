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

function serviceBlocks(serviceDirs) {
  return serviceDirs
      .map(
          ({ service, dir }) =>
              `### Service "${service.name}" - folder ./${path.basename(dir)}\n${service.architectureMd || '(no architecture overview provided)'}`
      )
      .join('\n\n');
}

function sageBlock(task) {
  return [
    'Authorized organizational knowledge (cite these if you rely on them):',
    task.sageContext || '(no authorized knowledge excerpts matched this ticket)',
  ].join('\n');
}

export function buildPlanPrompt(task, serviceDirs, clarificationLevel) {
  const clarificationInstruction =
      CLARIFICATION_INSTRUCTIONS[clarificationLevel] || CLARIFICATION_INSTRUCTIONS.MEDIUM;
  return [
    `You are investigating a bug ticket for the "${task.projectName}" project and must produce a change plan.`,
    '',
    `Ticket: ${task.ticketTitle || task.ticketId}`,
    'Description:',
    task.ticketDescription || '(no description provided)',
    '',
    'Project architecture overview:',
    task.projectArchitectureMd || '(none provided)',
    '',
    sageBlock(task),
    '',
    `This checkout has ${serviceDirs.length} service(s) as sibling subfolders of the current directory:`,
    serviceBlocks(serviceDirs),
    '',
    'Instructions:',
    '1. Investigate only. Do NOT edit, create, or delete any files.',
    '2. Decide which service(s) are affected and what files you would change.',
    '3. End your response with a block in exactly this form:',
    'CHANGE_PLAN:',
    '- Services: ...',
    '- Files: ...',
    '- Approach: ...',
    '- Tests: ...',
    '- Risks: ...',
    `4. ${clarificationInstruction}`,
  ].join('\n');
}

/** serviceDirs: [{ service: {name, architectureMd, ...}, dir: string }] */
export function buildFixPrompt(task, serviceDirs, clarificationLevel) {
  const clarificationInstruction =
      CLARIFICATION_INSTRUCTIONS[clarificationLevel] || CLARIFICATION_INSTRUCTIONS.MEDIUM;

  const planBlock = task.approvedChangePlan
      ? `\nApproved change plan (do not expand scope beyond this):\n${task.approvedChangePlan}\n`
      : '';

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
    sageBlock(task),
    planBlock,
    `This checkout has ${serviceDirs.length} service(s) as sibling subfolders of the current directory, each already on its own feature branch:`,
    serviceBlocks(serviceDirs),
    '',
    'Instructions:',
    '1. Decide for yourself which service(s) above are actually affected by this bug - it may be just one, or more than one if the fix genuinely spans services.',
    '2. Investigate the relevant subfolder(s) and implement a minimal, correct fix. Do not touch subfolders for services that are not relevant to this bug.',
    '3. Do not make unrelated changes, refactors, or dependency upgrades.',
    '4. Do not commit, push, or open a pull request in any subfolder - the caller handles that separately, per changed service, after you finish.',
    `5. ${clarificationInstruction}`,
  ].join('\n');
}

export function extractChangePlan(output) {
  if (!output) return '';
  const match = output.match(/CHANGE_PLAN:\s*([\s\S]+)/i);
  if (match) {
    return match[1].trim();
  }
  return output.trim().slice(0, 4000);
}
