import { renderTemplate } from '../../src/utils/template.js';

describe('renderTemplate', () => {
  it('replaces single placeholder', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'world' })).toBe('Hello world');
  });

  it('replaces multiple placeholders', () => {
    expect(
      renderTemplate('{{a}} and {{b}} plus {{a}}', { a: 'x', b: 'y' })
    ).toBe('x and y plus x');
  });

  it('leaves unknown placeholders intact (fail-safe)', () => {
    expect(renderTemplate('Hi {{unknown}}', { name: 'x' })).toBe('Hi {{unknown}}');
  });

  it('handles empty values', () => {
    expect(renderTemplate('[{{x}}]', { x: '' })).toBe('[]');
  });

  it('does not replace partial matches', () => {
    expect(renderTemplate('{{abc}}', { ab: 'no' })).toBe('{{abc}}');
  });
});
