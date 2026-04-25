import Ajv from 'ajv/dist/2020.js';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ReviewTarget } from '../../src/types/review-target.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ReviewTarget canonical schema', () => {
  const ajv = new Ajv({ allErrors: true });
  const schema = fs.readJsonSync(
    path.join(__dirname, '../../resources/schemas/review-target.schema.json')
  );
  const validate = ajv.compile(schema);

  it('minimal ReviewTarget validates', () => {
    const rt: ReviewTarget = {
      changed_files: ['src/foo.ts'],
      diff_summary: 'one file touched',
      stage: 'quality',
    };
    expect(validate(rt)).toBe(true);
  });

  it('full ReviewTarget with knowledge fields validates', () => {
    const rt: ReviewTarget = {
      changed_files: ['src/foo.ts'],
      diff_summary: 'one file touched',
      stage: 'quality',
      relevant_knowledge_files: ['docs/harness/knowledge/style-and-structure/manifest.md'],
      knowledge_snapshot_id: 'scan-2026-04-24T10:00Z',
      retrieval_outcome: 'success',
      known_issues: [],
      knowledge_requirements: [
        {
          rule_id: 'style-and-structure/rule-1',
          manifest_file: 'docs/harness/knowledge/style-and-structure/manifest.md',
          applies_to: ['src/**'],
          requirement_text: 'services return Result<T>',
          violation_test: 'must_use_wrapper',
        },
      ],
    };
    expect(validate(rt)).toBe(true);
  });

  it('invalid stage is rejected', () => {
    const rt = {
      changed_files: ['src/foo.ts'],
      diff_summary: 'x',
      stage: 'unknown',
    };
    expect(validate(rt)).toBe(false);
  });
});
