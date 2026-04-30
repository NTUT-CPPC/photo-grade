import { describe, expect, it } from "vitest";
import { selectFinalists, type FinalCandidate } from "../apps/server/src/services/final-selection.js";

function candidate(
  id: string,
  secondaryTotal: number,
  secondaryScoreCount: number,
  initialPassed = true
): FinalCandidate {
  return {
    id,
    code: id,
    initialPassed,
    secondaryTotal,
    secondaryScoreCount
  };
}

describe("selectFinalists", () => {
  it("does not fill final slots with initial-passed works that have no secondary score", () => {
    const finalists = selectFinalists(
      [
        candidate("1a", 18, 4),
        candidate("2a", 17, 4),
        candidate("3a", 0, 0),
        candidate("4a", 0, 0)
      ],
      3
    );

    expect(finalists.map((work) => work.id)).toEqual(["1a", "2a"]);
  });

  it("keeps cutoff ties and excludes works that did not pass initial judging", () => {
    const finalists = selectFinalists(
      [
        candidate("1a", 20, 4),
        candidate("2a", 18, 4),
        candidate("3a", 18, 4),
        candidate("4a", 16, 4),
        candidate("5a", 99, 4, false)
      ],
      2
    );

    expect(finalists.map((work) => work.id)).toEqual(["1a", "2a", "3a"]);
  });
});
