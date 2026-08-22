import type { ActiveBuffInfo, PassiveStat } from '@mud/shared';

interface StoredBuff {
  skillId: string;
  name: string;
  buffStat: PassiveStat;
  amount: number;
  expiresAt: number;
  totalMs: number;
}

/** characterId -> skillId -> 적용 중인 버프. 같은 스킬을 다시 시전하면 덮어써서 갱신한다(스택 아님). */
const activeBuffs = new Map<number, Map<string, StoredBuff>>();

export function setActiveBuff(
  characterId: number,
  skillId: string,
  name: string,
  buffStat: PassiveStat,
  amount: number,
  durationMs: number,
): void {
  const characterBuffs = activeBuffs.get(characterId) ?? new Map<string, StoredBuff>();
  characterBuffs.set(skillId, {
    skillId,
    name,
    buffStat,
    amount,
    expiresAt: Date.now() + durationMs,
    totalMs: durationMs,
  });
  activeBuffs.set(characterId, characterBuffs);
}

function pruneExpired(characterId: number): Map<string, StoredBuff> | undefined {
  const characterBuffs = activeBuffs.get(characterId);
  if (!characterBuffs) return undefined;
  const now = Date.now();
  for (const [skillId, buff] of characterBuffs) {
    if (buff.expiresAt <= now) characterBuffs.delete(skillId);
  }
  return characterBuffs;
}

/** 만료되지 않은 버프가 특정 스탯에 주는 보너스 합. getEffectiveStats에서 base+장비 보너스 위에 더한다. */
export function getBuffStatBonus(characterId: number, stat: PassiveStat): number {
  const characterBuffs = pruneExpired(characterId);
  if (!characterBuffs) return 0;
  let total = 0;
  for (const buff of characterBuffs.values()) {
    if (buff.buffStat === stat) total += buff.amount;
  }
  return total;
}

/** 클라이언트가 버프 잔여시간을 표시할 수 있는 형태로 스냅샷한다(skillCooldowns와 동일한 패턴). */
export function getActiveBuffInfos(characterId: number): ActiveBuffInfo[] {
  const characterBuffs = pruneExpired(characterId);
  if (!characterBuffs) return [];
  const now = Date.now();
  return Array.from(characterBuffs.values()).map((buff) => ({
    skillId: buff.skillId,
    name: buff.name,
    buffStat: buff.buffStat,
    amount: buff.amount,
    remainingMs: buff.expiresAt - now,
    totalMs: buff.totalMs,
  }));
}
