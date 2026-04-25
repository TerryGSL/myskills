import fs from 'fs-extra';
import * as path from 'node:path';

export const LEARNINGS_ROOT = '.harness/learnings';
export const LEARNINGS_FILES = ['LEARNINGS.md', 'ERRORS.md', 'FEATURE_REQUESTS.md'] as const;
export type LearningsFile = (typeof LEARNINGS_FILES)[number];

export interface LearningsEntry {
  id: string;
  date: Date;
  status: 'pending' | 'in_progress' | 'resolved' | 'wont_fix' | 'promoted';
  raw: string;
}

/** Parse entries from one learnings file. Returns [] if file missing. */
export function parseLearnings(projectRoot: string, file: LearningsFile): LearningsEntry[] {
  const p = path.join(projectRoot, LEARNINGS_ROOT, file);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  const entries: LearningsEntry[] = [];
  // Match "## [ABC-YYYYMMDD-XXX] ..." headers
  const re = /^##\s+\[([A-Z]+)-(\d{4})(\d{2})(\d{2})-[^\]]+\][\s\S]*?(?=^##\s+\[|\Z)/gms;
  for (const m of text.matchAll(re)) {
    const id = m[0].match(/\[([^\]]+)\]/)?.[1] ?? '';
    const y = Number(m[2]);
    const mo = Number(m[3]);
    const d = Number(m[4]);
    const date = new Date(Date.UTC(y, mo - 1, d));
    const statusMatch = m[0].match(/\*\*Status\*\*:\s*(\w+)/);
    const status = (statusMatch?.[1] ?? 'pending') as LearningsEntry['status'];
    entries.push({ id, date, status, raw: m[0] });
  }
  return entries;
}

export interface PromotionFlag {
  file: LearningsFile;
  id: string;
  reason: 'stale_pending' | 'repeat_pattern';
  days?: number;
}

/**
 * Detect promotable entries per spec §6.2 memory layer C retention rules.
 * - pending/in_progress older than 30d → 'stale_pending'
 * - (pattern-key recurrence detection deferred to R5+)
 */
export function detectPromotables(
  projectRoot: string,
  now: Date = new Date(),
): PromotionFlag[] {
  const flags: PromotionFlag[] = [];
  for (const file of LEARNINGS_FILES) {
    const entries = parseLearnings(projectRoot, file);
    for (const e of entries) {
      if (e.status === 'pending' || e.status === 'in_progress') {
        const days = Math.floor((now.getTime() - e.date.getTime()) / 86400000);
        if (days > 30) {
          flags.push({ file, id: e.id, reason: 'stale_pending', days });
        }
      }
    }
  }
  return flags;
}
