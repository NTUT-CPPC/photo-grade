export interface FinalCandidate {
  id: string;
  code: string;
  initialPassed: boolean;
  secondaryTotal: number;
  secondaryScoreCount: number;
}

export function selectFinalists<T extends FinalCandidate>(works: T[], topN: number): T[] {
  const ranked = works
    .filter((work) => work.initialPassed && work.secondaryScoreCount > 0)
    .sort((a, b) => {
      const scoreDiff = b.secondaryTotal - a.secondaryTotal;
      if (scoreDiff !== 0) return scoreDiff;
      return compareCodes(a.code, b.code);
    });

  const accepted: T[] = [];
  let lastScore: number | null = null;
  for (const work of ranked) {
    if (accepted.length < topN || work.secondaryTotal === lastScore) {
      accepted.push(work);
      lastScore = work.secondaryTotal;
    } else {
      break;
    }
  }
  return accepted;
}

export function compareCodes(a: string, b: string): number {
  const aa = parseCode(a);
  const bb = parseCode(b);
  if (aa.suffix !== bb.suffix) return aa.suffix.localeCompare(bb.suffix);
  if (Number.isFinite(aa.num) && Number.isFinite(bb.num)) return aa.num - bb.num;
  return a.localeCompare(b);
}

function parseCode(code: string): { num: number; suffix: string } {
  const match = /^(\d+)(.*)$/.exec(code);
  if (!match) return { num: NaN, suffix: code };
  return { num: Number(match[1]), suffix: match[2] ?? "" };
}
