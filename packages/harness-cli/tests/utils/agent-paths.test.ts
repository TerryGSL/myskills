import { skillRootFor, agentTypeFor, AgentType } from '../../src/utils/agent-paths.js';

describe('agent-paths', () => {
  it('claude agent → .claude/skills', () => {
    expect(skillRootFor('claude')).toBe('.claude/skills');
  });

  it('default agent type is claude', () => {
    expect(agentTypeFor(undefined)).toBe('claude');
    expect(agentTypeFor(null)).toBe('claude');
  });

  it('explicit claude returns claude', () => {
    expect(agentTypeFor('claude')).toBe('claude');
  });

  it('unsupported agent type throws', () => {
    // codex is reserved for future work (spec Non-goals);
    // request should be rejected now, not silently degraded
    expect(() => agentTypeFor('codex' as AgentType)).toThrow(/unsupported/i);
    expect(() => agentTypeFor('bogus' as AgentType)).toThrow();
  });
});
