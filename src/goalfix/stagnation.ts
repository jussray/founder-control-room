export type GoalfixAttemptResult = 'passed' | 'failed' | 'blocked' | 'incomplete';

export interface GoalfixAttempt {
  approach: string;
  failureSignature?: string;
  filesTouched: string[];
  verificationName?: string;
  commitSha?: string;
  result: GoalfixAttemptResult;
}

export interface GoalfixStagnationResult {
  stagnant: boolean;
  repeatedFailureSignature?: string;
  matchingAttempts: number;
  nextAction: string;
}

function normalize(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function detectGoalfixStagnation(attempts: GoalfixAttempt[]): GoalfixStagnationResult {
  const counts = new Map<string, number>();

  for (const attempt of attempts) {
    const signature = normalize(attempt.failureSignature);
    if (!signature) continue;

    if (attempt.result === 'passed') {
      counts.delete(signature);
      continue;
    }
    if (attempt.result === 'incomplete') continue;

    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }

  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])[0];

  if (!repeated) {
    return {
      stagnant: false,
      matchingAttempts: 0,
      nextAction: 'Continue with the smallest evidence-producing action.',
    };
  }

  return {
    stagnant: true,
    repeatedFailureSignature: repeated[0],
    matchingAttempts: repeated[1],
    nextAction: 'Stop retrying the same path. Re-observe the exact failure evidence, rank root causes, and choose a different reversible approach.',
  };
}
