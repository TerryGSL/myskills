import { runInit, InitInput, InitResult } from './init.js';

/**
 * `harness adopt` is currently a four-state-aware re-run of init.
 *
 * The four-state policy in materializeFile already does "adopt" semantics:
 * - existing files that equal the bundled template → unchanged
 * - existing files the user modified → skip (preserve user)
 * - missing files → apply
 * - conflicts → .rej (personal) / abort (company-mt)
 *
 * The only difference from init: adopt assumes an already-started project
 * and never fails simply because files already exist.
 */
export function runAdopt(input: InitInput): InitResult {
  return runInit(input);
}
