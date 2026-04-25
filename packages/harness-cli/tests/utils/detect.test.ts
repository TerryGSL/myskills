import fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectProject, ProjectType } from '../../src/utils/detect.js';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-detect-'));
}

describe('detectProject', () => {
  it('node project from package.json', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
    const info = detectProject(root);
    expect(info.projectType).toBe('node');
    expect(info.buildFiles).toContain('package.json');
    fs.removeSync(root);
  });

  it('java project from pom.xml', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'pom.xml'), '<project/>');
    const info = detectProject(root);
    expect(info.projectType).toBe('java');
    expect(info.buildFiles).toContain('pom.xml');
    fs.removeSync(root);
  });

  it('go project from go.mod', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'go.mod'), 'module x\ngo 1.22\n');
    const info = detectProject(root);
    expect(info.projectType).toBe('go');
    fs.removeSync(root);
  });

  it('rust project from Cargo.toml', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nname = "x"\n');
    const info = detectProject(root);
    expect(info.projectType).toBe('rust');
    fs.removeSync(root);
  });

  it('python project from pyproject.toml', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname = "x"\n');
    const info = detectProject(root);
    expect(info.projectType).toBe('python');
    fs.removeSync(root);
  });

  it('unknown when no build files', () => {
    const root = tmpRoot();
    const info = detectProject(root);
    expect(info.projectType).toBe('unknown');
    expect(info.buildFiles).toEqual([]);
    fs.removeSync(root);
  });

  it('java takes precedence when pom.xml + package.json both exist', () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, 'pom.xml'), '<project/>');
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    const info = detectProject(root);
    expect(info.projectType).toBe('java');
    fs.removeSync(root);
  });
});
