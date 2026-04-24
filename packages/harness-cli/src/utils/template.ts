/**
 * Replace {{placeholder}} tokens in a template string.
 * - Unknown placeholders are left intact (fail-safe, not aborted).
 * - Whole-token match only; partial names don't trigger.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
