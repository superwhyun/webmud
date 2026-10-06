export const FLEE_COOLDOWN_MS = 2000;

interface FleePlayer {
  level: number;
  dexterity: number;
  intelligence: number;
}

interface FleeOpponent {
  level: number;
  dexterity: number;
}

/** Use the hardest opponent to escape; equipment and buffs belong in the supplied player stats. */
export function fleeSuccessChance(player: FleePlayer, opponents: readonly FleeOpponent[]): number {
  if (opponents.length === 0) return 1;
  // DEX helps outrun the opponent; INT helps spot an opening. Normalize by level so
  // higher-level fights don't reach the cap merely because both sides' stats grow.
  const chances = opponents.map((opponent) => {
    const statAdvantage = (player.dexterity + player.intelligence - opponent.dexterity)
      / Math.max(1, player.level, opponent.level);
    return 0.5 + 0.03 * (player.level - opponent.level) + 0.1 * statAdvantage;
  });
  return Math.max(0.1, Math.min(0.9, Math.min(...chances)));
}
