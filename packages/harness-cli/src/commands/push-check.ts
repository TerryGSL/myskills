import { assessPushRisk, type RiskAssessment } from '../utils/push-decision.js';

export interface PushCheckInput {
  hardFloor: string[];
  json?: boolean;
}

export function runPushCheck(input: PushCheckInput): RiskAssessment {
  const r = assessPushRisk({ hardFloor: input.hardFloor });
  if (input.json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    if (r.action === 'refuse') {
      console.log(`❌ Push REFUSED: ${r.reasons.join(', ')}`);
    } else if (r.action === 'ask') {
      console.log(
        `⚠ Risk: ${r.level} (${r.reasons.join(', ')}). Ask user before pushing.`,
      );
    } else {
      console.log(`✓ Risk: low (${r.reasons.join(', ')}). Auto push.`);
    }
  }
  return r;
}
