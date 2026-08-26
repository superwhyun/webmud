import { db } from '../db/client.js';

interface InvalidBossPlacementRow {
  name: string;
  fixed_level: number | null;
  zone_max_level: number | null;
}

/** Returns the first data-integrity violation shared by admin edits, imports, and builder placement. */
export function findBossPlacementInvariantViolation(): string | null {
  const bossGarrison = db
    .prepare(
      `SELECT mt.name
       FROM village_garrison vg
       JOIN mob_templates mt ON mt.id = vg.mob_template_id
       WHERE mt.is_boss = 1
       LIMIT 1`,
    )
    .get() as { name: string } | undefined;
  if (bossGarrison) return `보스 "${bossGarrison.name}"은 마을 수비대로 사용할 수 없습니다.`;

  const duplicate = db
    .prepare(
      `SELECT z.name, COUNT(*) as count
       FROM mob_spawns ms
       JOIN rooms r ON r.id = ms.room_id
       JOIN zones z ON z.id = r.zone_id
       JOIN mob_templates mt ON mt.id = ms.mob_template_id
       WHERE mt.is_boss = 1
       GROUP BY z.id
       HAVING COUNT(*) > 1
       LIMIT 1`,
    )
    .get() as { name: string; count: number } | undefined;
  if (duplicate) return `"${duplicate.name}" 존에는 보스를 하나만 배치할 수 있습니다.`;

  const invalid = db
    .prepare(
      `SELECT mt.name, ms.min_level as fixed_level, z.max_level as zone_max_level
       FROM mob_spawns ms
       JOIN rooms r ON r.id = ms.room_id
       JOIN zones z ON z.id = r.zone_id
       JOIN mob_templates mt ON mt.id = ms.mob_template_id
       WHERE mt.is_boss = 1
         AND (z.min_level IS NULL OR z.max_level IS NULL
           OR ms.min_level IS NULL OR ms.max_level IS NULL
           OR ms.min_level <> ms.max_level OR ms.min_level <> z.max_level
           OR ms.min_level < mt.min_level OR ms.min_level > mt.max_level)
       LIMIT 1`,
    )
    .get() as InvalidBossPlacementRow | undefined;
  if (!invalid) return null;
  if (invalid.fixed_level !== null && invalid.zone_max_level !== null && invalid.fixed_level === invalid.zone_max_level) {
    return `배치된 보스 "${invalid.name}"의 고정 레벨이 템플릿 레벨 범위를 벗어납니다.`;
  }
  return `배치된 보스 "${invalid.name}"의 레벨이 존 최고 레벨과 일치하지 않습니다.`;
}

export class BossPlacementInvariantError extends Error {}

export function assertBossPlacementInvariants(): void {
  const violation = findBossPlacementInvariantViolation();
  if (violation) throw new BossPlacementInvariantError(violation);
}
