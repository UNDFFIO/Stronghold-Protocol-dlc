// Maintainer rule: add 10% of base per extra round through 10, then 15% of base per round.
export function endlessEnemyScale(extraRound) {
  return extraRound <= 10 ? 1 + extraRound * 0.1 : 2 + 0.15 * (extraRound - 10);
}
