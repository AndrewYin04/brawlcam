// Elo rating update, K = 32.
export const ELO_K = 32;

export function eloUpdate(ra: number, rb: number, scoreA: number, k = ELO_K) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const deltaA = Math.round(k * (scoreA - ea));
  return { deltaA, deltaB: -deltaA, newA: ra + deltaA, newB: rb - deltaA };
}
