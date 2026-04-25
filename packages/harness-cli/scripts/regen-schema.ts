/**
 * Regenerate JSON schemas from the constants single-source-of-truth.
 *
 * - Patches resources/schemas/profile.schema.json (preserves other keys/structure)
 * - Writes resources/schemas/push-decision.schema.json from scratch
 *
 * Schema-drift CI runs this script + `git diff --exit-code resources/schemas/` to
 * fail when constants and schemas have diverged.
 */
import fs from 'fs-extra';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATCHER_TYPES,
  HARD_FLOOR_FLAGS,
  TASK_TYPES,
  PUSH_RISK_LEVELS,
  AGGRESSION_MODES,
} from '../src/types/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, '../resources/schemas');
const PROFILE_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'profile.schema.json');
const PUSH_DECISION_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'push-decision.schema.json');

// --- Patch profile.schema.json ---
const profileSchema = fs.readJsonSync(PROFILE_SCHEMA_PATH);

// matcher items.properties.type.enum
profileSchema.properties.detection.properties.matchers.items.properties.type.enum = [
  ...MATCHER_TYPES,
];

// hard_floor items.enum
profileSchema.properties.hard_floor.items.enum = [...HARD_FLOOR_FLAGS];

// default_mode.enum
profileSchema.properties.default_mode.enum = [...AGGRESSION_MODES];

// task_types.required
profileSchema.properties.task_types.required = [...TASK_TYPES];

fs.writeJsonSync(PROFILE_SCHEMA_PATH, profileSchema, { spaces: 2 });

// --- Write push-decision.schema.json ---
const pushDecisionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/push-decision.schema.json',
  title: 'PushDecision',
  type: 'object',
  required: ['level', 'reasons', 'action', 'exit_code'],
  properties: {
    level: { enum: [...PUSH_RISK_LEVELS] },
    reasons: {
      type: 'array',
      items: { type: 'string' },
    },
    action: { enum: ['refuse', 'ask', 'auto'] },
    exit_code: { enum: [0, 1, 2] },
  },
};

fs.writeJsonSync(PUSH_DECISION_SCHEMA_PATH, pushDecisionSchema, { spaces: 2 });

console.log('regen-schema: wrote');
console.log(`  ${path.relative(process.cwd(), PROFILE_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), PUSH_DECISION_SCHEMA_PATH)}`);
