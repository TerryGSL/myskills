export type ManagedCategory =
  | 'agents'
  | 'config'
  | 'docs'
  | 'plans'
  | 'skills'
  | 'knowledge'
  | 'memory'
  | 'learnings';

export type ManagedStrategy = 'copy' | 'generated' | 'overlay';

export type ConflictResolution = 'unchanged' | 'update-available' | 'user-modified' | 'conflict';

export interface ManagedFileRecord {
  path: string;
  category: ManagedCategory;
  strategy: ManagedStrategy;
  sourceHash: string;
  targetHash: string;
  lastSyncedAt: string;
}

export interface ManagedFilesState {
  schemaVersion: 1;
  managedFiles: ManagedFileRecord[];
}
