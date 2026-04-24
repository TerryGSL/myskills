#!/usr/bin/env tsx
// R5/T11 version lock + R11/T5 bundled-manifest completeness check.
//
// Verifies:
//   1. resources/VERSION == package.json.version (hard lock; H4 spec §6.4)
//   2. Every path in bundled-manifest.json exists on disk
//   3. migration-checklist.md has no TBD rows (R6/T3 precondition)

import fs from 'fs-extra';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '../..');

interface BundledManifest {
  schemaVersion: number;
  version: string;
  resources: {
    schemas: string[];
    templates: Record<string, string[]>;
    skills: string[];
    presets: string[];
  };
}

function assertVersionLock(): string | null {
  const pkg = fs.readJsonSync(path.join(ROOT, 'package.json'));
  const versionFile = fs.readFileSync(path.join(ROOT, 'resources/VERSION'), 'utf8').trim();
  if (pkg.version !== versionFile) {
    return `version lock violated: package.json=${pkg.version} vs resources/VERSION=${versionFile}`;
  }
  const manifest: BundledManifest = fs.readJsonSync(path.join(ROOT, 'bundled-manifest.json'));
  if (manifest.version !== pkg.version) {
    return `bundled-manifest version=${manifest.version} != package.json=${pkg.version}`;
  }
  return null;
}

function assertManifestResourcesExist(): string[] {
  const manifest: BundledManifest = fs.readJsonSync(path.join(ROOT, 'bundled-manifest.json'));
  const problems: string[] = [];
  const check = (rel: string) => {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      problems.push(`missing: ${rel}`);
    }
  };
  for (const s of manifest.resources.schemas) check(s);
  for (const group of Object.values(manifest.resources.templates)) {
    for (const t of group) check(t);
  }
  for (const s of manifest.resources.skills) check(s);
  for (const p of manifest.resources.presets) check(p);
  return problems;
}

function assertMigrationChecklistClean(): string | null {
  const checklist = path.join(REPO_ROOT, 'harness-workflow/references/migration-checklist.md');
  if (!fs.existsSync(checklist)) {
    return `missing: ${path.relative(REPO_ROOT, checklist)}`;
  }
  const text = fs.readFileSync(checklist, 'utf8');
  const tbdMatches = text.match(/\|\s*TBD\s*\|/g);
  if (tbdMatches) {
    return `migration-checklist has ${tbdMatches.length} TBD row(s); fix before Round 6`;
  }
  return null;
}

const errors: string[] = [];

const lockErr = assertVersionLock();
if (lockErr) errors.push(lockErr);

errors.push(...assertManifestResourcesExist());

const tbdErr = assertMigrationChecklistClean();
if (tbdErr) errors.push(tbdErr);

if (errors.length > 0) {
  console.error('verify-resources FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('verify-resources OK');
