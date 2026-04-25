import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function sha256File(filePath: string): string {
  return sha256(readFileSync(filePath));
}
