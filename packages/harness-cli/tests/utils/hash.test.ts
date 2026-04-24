import { sha256, sha256File } from '../../src/utils/hash.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('hash utils', () => {
  it('sha256 known input', () => {
    // echo -n "hello" | sha256sum
    expect(sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('sha256 empty string', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('sha256 is deterministic', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
  });

  it('sha256File reads file and hashes content', () => {
    const pkgJson = path.join(__dirname, '../../package.json');
    const h = sha256File(pkgJson);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
