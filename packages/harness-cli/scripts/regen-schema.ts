/**
 * Regenerate JSON schemas from the constants single-source-of-truth.
 *
 * Generates 12 schemas:
 *   - profile.schema.json (patched, preserves existing structure)
 *   - push-decision.schema.json (full write)
 *   - 10 Layer 0 schemas added in PR A2.1: marker / task-type / knowledge /
 *     knowledgeCheck / hard-floor / memory / drift / reviewer-gates /
 *     doctor-protocol / route-output (full write)
 *
 * All enums spread from constants.ts (single source of truth).
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
const MARKER_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'marker.schema.json');
const TASK_TYPE_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'task-type.schema.json');
const KNOWLEDGE_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'knowledge.schema.json');
const KNOWLEDGE_CHECK_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'knowledgeCheck.schema.json');
const HARD_FLOOR_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'hard-floor.schema.json');
const MEMORY_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'memory.schema.json');
const DRIFT_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'drift.schema.json');
const REVIEWER_GATES_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'reviewer-gates.schema.json');
const DOCTOR_PROTOCOL_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'doctor-protocol.schema.json');
const ROUTE_OUTPUT_SCHEMA_PATH = path.join(SCHEMAS_DIR, 'route-output.schema.json');

const HARNESS_TASK_LEAVES = TASK_TYPES.map((t) => `harness-${t}`);

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

// --- Write marker.schema.json ---
const markerSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/marker.schema.json',
  title: 'HarnessProfileMarker',
  description: 'YAML marker file `.harness-profile` resolving repo to a profile.',
  type: 'object',
  required: ['profile', 'resolved_by', 'updated_at'],
  properties: {
    profile: { type: 'string', minLength: 1 },
    resolved_by: { enum: ['marker', 'matcher', 'user_override'] },
    updated_at: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
    },
  },
  additionalProperties: false,
};

fs.writeJsonSync(MARKER_SCHEMA_PATH, markerSchema, { spaces: 2 });

// --- Write task-type.schema.json ---
const taskTypeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/task-type.schema.json',
  title: 'TaskTypeResolution',
  description:
    'Input + output of structured fast-path task-type judgement that selects a leaf skill.',
  type: 'object',
  required: ['task_description', 'flags', 'fast_path_hit', 'leaf_skill'],
  properties: {
    task_description: { type: 'string' },
    flags: {
      type: 'array',
      items: { type: 'string' },
    },
    git_diff_stat: {
      type: 'object',
      required: ['files_changed', 'lines_added', 'lines_deleted'],
      properties: {
        files_changed: { type: 'integer', minimum: 0 },
        lines_added: { type: 'integer', minimum: 0 },
        lines_deleted: { type: 'integer', minimum: 0 },
      },
    },
    fast_path_hit: { type: 'boolean' },
    leaf_skill: { enum: [...HARNESS_TASK_LEAVES] },
  },
  additionalProperties: false,
};

fs.writeJsonSync(TASK_TYPE_SCHEMA_PATH, taskTypeSchema, { spaces: 2 });

// --- Write knowledge.schema.json (5-domain manifest) ---
const knowledgeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/knowledge.schema.json',
  title: 'KnowledgeManifest',
  description:
    'Per-domain manifest produced by `harness scan` (project-scanner). Each manifest belongs to one of the 5 domains.',
  type: 'object',
  required: ['domain', 'manifest', 'rules', 'examples'],
  properties: {
    domain: {
      enum: ['api', 'db', 'business-rules', 'config', 'deployment'],
    },
    manifest: {
      type: 'string',
      description: 'Path to manifest.md file relative to repo root.',
      minLength: 1,
    },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'text'],
        properties: {
          id: { type: 'string', minLength: 1 },
          text: { type: 'string' },
          status: { enum: ['active', 'expired', 'drifted', 'superseded'] },
        },
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ref'],
        properties: {
          ref: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
  additionalProperties: false,
};

fs.writeJsonSync(KNOWLEDGE_SCHEMA_PATH, knowledgeSchema, { spaces: 2 });

// --- Write knowledgeCheck.schema.json (8-field runtime state object) ---
const knowledgeCheckSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/knowledgeCheck.schema.json',
  title: 'KnowledgeCheck',
  description:
    'Runtime state object written to `.harness-status.json.knowledgeCheck` by Stage -0.5. 8 fields per knowledge-retrieval.md.',
  type: 'object',
  required: [
    'disabled',
    'present',
    'status',
    'drifted',
    'late_recovered',
    'rules_count',
    'examples_count',
    'retrieved_at',
  ],
  properties: {
    disabled: { type: 'boolean' },
    present: { type: 'boolean' },
    status: { enum: ['ready', 'stale', 'missing'] },
    drifted: { type: 'boolean' },
    late_recovered: { type: 'boolean' },
    rules_count: { type: 'integer', minimum: 0 },
    examples_count: { type: 'integer', minimum: 0 },
    retrieved_at: {
      type: ['string', 'null'],
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
    },
  },
  additionalProperties: false,
};

fs.writeJsonSync(KNOWLEDGE_CHECK_SCHEMA_PATH, knowledgeCheckSchema, { spaces: 2 });

// --- Write hard-floor.schema.json ---
const hardFloorSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/hard-floor.schema.json',
  title: 'HardFloorEnforcement',
  description:
    'Verdict produced when checking a requested action against a profile hard_floor list.',
  type: 'object',
  required: ['profile_floor', 'requested_action', 'verdict'],
  properties: {
    profile_floor: {
      type: 'array',
      items: { enum: [...HARD_FLOOR_FLAGS] },
      uniqueItems: true,
    },
    requested_action: { enum: [...HARD_FLOOR_FLAGS] },
    verdict: { enum: ['allow', 'refuse'] },
    reason: { type: 'string' },
  },
  additionalProperties: false,
};

fs.writeJsonSync(HARD_FLOOR_SCHEMA_PATH, hardFloorSchema, { spaces: 2 });

// --- Write memory.schema.json (3-layer permission matrix) ---
const memorySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/memory.schema.json',
  title: 'MemoryLayer',
  description:
    'Three-layer memory write-permission matrix entry: which writer may write to which layer at which stage.',
  type: 'object',
  required: ['layer', 'writer', 'file_path', 'allowed_stages'],
  properties: {
    layer: { enum: ['project', 'workflow', 'session'] },
    writer: { enum: ['leaf', 'reviewer', 'user'] },
    file_path: { type: 'string', minLength: 1 },
    allowed_stages: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
};

fs.writeJsonSync(MEMORY_SCHEMA_PATH, memorySchema, { spaces: 2 });

// --- Write drift.schema.json (6 drift types) ---
const driftSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/drift.schema.json',
  title: 'DriftDetection',
  description: 'A single drift event detected by maintenance.md across the 6 categories.',
  type: 'object',
  required: ['drift_type', 'detected_at', 'target_file', 'severity'],
  properties: {
    drift_type: {
      enum: [
        'schema_drift',
        'reference_drift',
        'manifest_drift',
        'memory_drift',
        'profile_drift',
        'config_drift',
      ],
    },
    detected_at: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
    },
    target_file: { type: 'string', minLength: 1 },
    expected: { type: ['string', 'null'] },
    actual: { type: ['string', 'null'] },
    severity: { enum: ['info', 'warn', 'error'] },
  },
  additionalProperties: false,
};

fs.writeJsonSync(DRIFT_SCHEMA_PATH, driftSchema, { spaces: 2 });

// --- Write reviewer-gates.schema.json (4 hard gates) ---
const reviewerGatesSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/reviewer-gates.schema.json',
  title: 'ReviewerGate',
  description:
    'Strict reviewer hard-gate verdict (one of 4 gates: grounding / reproduction / coverage / knowledge-grounding).',
  type: 'object',
  required: ['gate', 'verdict', 'evidence'],
  properties: {
    gate: {
      enum: ['grounding', 'reproduction', 'coverage', 'knowledge-grounding'],
    },
    verdict: { enum: ['pass', 'fail'] },
    evidence: {
      type: 'array',
      items: { type: 'string' },
    },
    feedback: { type: 'string' },
  },
  additionalProperties: false,
};

fs.writeJsonSync(REVIEWER_GATES_SCHEMA_PATH, reviewerGatesSchema, { spaces: 2 });

// --- Write doctor-protocol.schema.json (`harness doctor --json`) ---
const doctorProtocolSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/doctor-protocol.schema.json',
  title: 'DoctorReport',
  description: 'Output of `harness doctor --json` — health snapshot of a harness-installed repo.',
  type: 'object',
  required: ['health_score', 'checks', 'recommendations'],
  properties: {
    health_score: { type: 'integer', minimum: 0, maximum: 100 },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'status', 'message'],
        properties: {
          name: { type: 'string', minLength: 1 },
          status: { enum: ['pass', 'warn', 'fail'] },
          message: { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: false,
};

fs.writeJsonSync(DOCTOR_PROTOCOL_SCHEMA_PATH, doctorProtocolSchema, { spaces: 2 });

// --- Write route-output.schema.json (`harness route --json`) ---
const routeOutputSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'harness-workflow-cli/route-output.schema.json',
  title: 'RouteOutput',
  description:
    'Output of `harness route --json` (Routing-as-CLI). Carries leaf decision + resolved profile + injected context.',
  type: 'object',
  required: [
    'leaf_skill',
    'resolved_profile',
    'resolved_mode',
    'task_description',
    'hard_floor',
    'fast_path_hit',
    'context_to_inject',
  ],
  properties: {
    leaf_skill: { enum: [...HARNESS_TASK_LEAVES] },
    resolved_profile: { type: 'string', minLength: 1 },
    resolved_mode: { enum: [...AGGRESSION_MODES] },
    task_description: { type: 'string' },
    hard_floor: {
      type: 'array',
      items: { enum: [...HARD_FLOOR_FLAGS] },
      uniqueItems: true,
    },
    knowledge_manifest: {
      type: 'object',
      additionalProperties: true,
    },
    fast_path_hit: { type: 'boolean' },
    context_to_inject: { type: 'string' },
  },
  additionalProperties: false,
};

fs.writeJsonSync(ROUTE_OUTPUT_SCHEMA_PATH, routeOutputSchema, { spaces: 2 });

console.log('regen-schema: wrote');
console.log(`  ${path.relative(process.cwd(), PROFILE_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), PUSH_DECISION_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), MARKER_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), TASK_TYPE_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), KNOWLEDGE_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), KNOWLEDGE_CHECK_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), HARD_FLOOR_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), MEMORY_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), DRIFT_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), REVIEWER_GATES_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), DOCTOR_PROTOCOL_SCHEMA_PATH)}`);
console.log(`  ${path.relative(process.cwd(), ROUTE_OUTPUT_SCHEMA_PATH)}`);
