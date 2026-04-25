import { assessPushRisk } from '../../src/utils/push-decision.js';

describe('harness push-check (PR 5)', () => {
  it('1) hard_floor includes auto_push → refuse / high / exit_code=2', () => {
    const r = assessPushRisk({
      hardFloor: ['auto_push'],
      diffStat: '',
      diffFull: '',
    });
    expect(r.level).toBe('high');
    expect(r.action).toBe('refuse');
    expect(r.exit_code).toBe(2);
    expect(r.reasons[0]).toMatch(/hard_floor/);
  });

  it('2) docs-only multi-file change → low / auto / exit_code=0', () => {
    const diffStat = [
      ' README.md       | 5 +++--',
      ' docs/guide.md   | 8 ++++----',
      ' i18n/en.json    | 2 +-',
      ' 3 files changed, 8 insertions(+), 5 deletions(-)',
    ].join('\n');
    const diffFull = '+ some doc\n- some doc\n';
    const r = assessPushRisk({ hardFloor: [], diffStat, diffFull });
    expect(r.level).toBe('low');
    expect(r.action).toBe('auto');
    expect(r.exit_code).toBe(0);
    expect(r.reasons[0]).toMatch(/md\/txt\/po\/json/);
  });

  it('3) touches .env → high / refuse', () => {
    const diffStat = [
      ' .env            | 1 +',
      ' 1 file changed, 1 insertion(+)',
    ].join('\n');
    const diffFull = '+API_KEY=abc\n';
    const r = assessPushRisk({ hardFloor: [], diffStat, diffFull });
    expect(r.level).toBe('high');
    expect(r.action).toBe('refuse');
    expect(r.exit_code).toBe(2);
    expect(r.reasons.some((x) => /secrets/i.test(x))).toBe(true);
  });

  it('4) modifies package.json dependencies → high', () => {
    const diffStat = [
      ' package.json    | 3 ++-',
      ' 1 file changed, 2 insertions(+), 1 deletion(-)',
    ].join('\n');
    const diffFull = [
      'diff --git a/package.json b/package.json',
      '   "dependencies": {',
      '+    "lodash": "^4.17.0",',
      '   }',
    ].join('\n');
    const r = assessPushRisk({ hardFloor: [], diffStat, diffFull });
    expect(r.level).toBe('high');
    expect(r.action).toBe('refuse');
    expect(r.reasons.some((x) => /dependencies/i.test(x))).toBe(true);
  });

  it('5) >3 files plain change → high / >3 files changed', () => {
    const diffStat = [
      ' src/a.ts        | 10 ++++++++--',
      ' src/b.ts        |  8 ++++----',
      ' src/c.ts        |  6 +++---',
      ' src/d.ts        |  4 ++--',
      ' 4 files changed, 14 insertions(+), 14 deletions(-)',
    ].join('\n');
    const diffFull = 'normal business diff content with many lines\n'.repeat(20);
    const r = assessPushRisk({ hardFloor: [], diffStat, diffFull });
    expect(r.level).toBe('high');
    expect(r.action).toBe('refuse');
    expect(r.reasons.some((x) => />3 files/.test(x))).toBe(true);
  });

  it('6) default single-file 100-line business change → medium / ask / exit_code=1', () => {
    const diffStat = [
      ' src/feature.ts  | 100 +++++++++++++++++++++++++++++++++',
      ' 1 file changed, 100 insertions(+)',
    ].join('\n');
    const diffFull = ('+ some business logic line\n'.repeat(100));
    const r = assessPushRisk({ hardFloor: [], diffStat, diffFull });
    expect(r.level).toBe('medium');
    expect(r.action).toBe('ask');
    expect(r.exit_code).toBe(1);
  });
});
