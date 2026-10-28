// Maintainer rule: linear growth for extra rounds 1–10, then 15% compound growth.
export function endlessEnemyScale(extraRound) {
  return extraRound <= 10 ? 1 + extraRound * 0.1 : 2 * 1.15 ** (extraRound - 10);
}
