import fs from 'fs-extra';
import * as path from 'node:path';

export type ProjectType = 'node' | 'java' | 'go' | 'rust' | 'python' | 'unknown';

export interface ProjectInfo {
  root: string;
  projectType: ProjectType;
  buildFiles: string[];
  projectName: string | null;
}

/**
 * Detect project type by inspecting build files at repo root.
 * Priority (first hit wins): java > go > rust > python > node > unknown.
 * Java takes precedence to avoid node-on-top-of-Java monorepo misdetection
 * (e.g. repos using pnpm + Maven for webapp module).
 */
export function detectProject(projectRoot: string): ProjectInfo {
  const exists = (f: string) => fs.existsSync(path.join(projectRoot, f));
  const buildFiles: string[] = [];

  let projectType: ProjectType = 'unknown';

  if (exists('pom.xml') || exists('mvnw') || exists('build.gradle') || exists('build.gradle.kts')) {
    projectType = 'java';
    if (exists('pom.xml')) buildFiles.push('pom.xml');
    if (exists('mvnw')) buildFiles.push('mvnw');
    if (exists('build.gradle')) buildFiles.push('build.gradle');
    if (exists('build.gradle.kts')) buildFiles.push('build.gradle.kts');
  } else if (exists('go.mod')) {
    projectType = 'go';
    buildFiles.push('go.mod');
  } else if (exists('Cargo.toml')) {
    projectType = 'rust';
    buildFiles.push('Cargo.toml');
  } else if (exists('pyproject.toml') || exists('setup.py')) {
    projectType = 'python';
    if (exists('pyproject.toml')) buildFiles.push('pyproject.toml');
    if (exists('setup.py')) buildFiles.push('setup.py');
  } else if (exists('package.json')) {
    projectType = 'node';
    buildFiles.push('package.json');
  }

  let projectName: string | null = null;
  if (exists('package.json')) {
    try {
      const pkg = fs.readJsonSync(path.join(projectRoot, 'package.json'));
      if (typeof pkg.name === 'string') projectName = pkg.name;
    } catch {
      // ignore parse error
    }
  }

  return { root: projectRoot, projectType, buildFiles, projectName };
}
