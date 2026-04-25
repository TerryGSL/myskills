/**
 * Agent-type abstraction. Currently only Claude Code is supported.
 * Per spec Non-goals, codex support is deferred to future work — requesting
 * it now throws rather than silently returning a path the CLI can't actually
 * deploy skills into.
 */

export type AgentType = 'claude';

export function agentTypeFor(input: AgentType | string | null | undefined): AgentType {
  if (input === undefined || input === null) return 'claude';
  if (input === 'claude') return 'claude';
  throw new Error(
    `unsupported agent type: ${input} (supported: claude; codex reserved for future)`,
  );
}

/**
 * Skill root path (relative to project root) for a given agent type.
 * Used by materialize + init to deploy skills to the right directory.
 */
export function skillRootFor(agent: AgentType): string {
  switch (agent) {
    case 'claude':
      return '.claude/skills';
  }
}
