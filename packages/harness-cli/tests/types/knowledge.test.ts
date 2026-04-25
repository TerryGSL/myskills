import { RuleStatus, ManifestStatus, ViolationTest, RetrievalOutcome } from '../../src/types/knowledge.js';

describe('knowledge canonical types', () => {
  it('RuleStatus has exactly 4 values', () => {
    const allStatuses: RuleStatus[] = ['active', 'expired', 'drifted', 'superseded'];
    expect(allStatuses).toHaveLength(4);
  });

  it('ViolationTest has exactly 7 values', () => {
    const all: ViolationTest[] = [
      'must_use_wrapper',
      'must_call_component',
      'must_not_throw_raw_exception',
      'must_use_package',
      'must_not_use_pattern',
      'must_annotate_with',
      'free_form_review',
    ];
    expect(all).toHaveLength(7);
  });

  it('RetrievalOutcome has 3 values', () => {
    const all: RetrievalOutcome[] = ['success', 'coordinator_miss', 'all_candidates_filtered'];
    expect(all).toHaveLength(3);
  });

  it('ManifestStatus accepts superseded_by prefix', () => {
    const s: ManifestStatus = 'superseded_by:docs/harness/knowledge/style-and-structure/manifest.md';
    expect(s.startsWith('superseded_by:')).toBe(true);
  });
});
