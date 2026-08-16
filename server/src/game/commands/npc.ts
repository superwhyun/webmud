import { formatItemMention, ITEM_GRADE_LABELS, MAX_INVENTORY_SLOTS, type ItemGrade } from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import { formatItemBonuses, padVisual, visualWidth } from '../itemEffects.js';
import { getMerchantCatalog, getMerchants, type ShopItemRow } from '../NpcManager.js';
import type { CommandContext } from './context.js';
import { sendEquipmentAndInventory } from './equipment.js';

const SELL_PRICE_RATIO = 0.5;

interface SellableInventoryRow {
  id: number;
  item_id: number;
  quantity: number;
  equipped: number;
  name: string;
  type: string;
  grade: ItemGrade;
  value: number;
}

const SHOP_COLUMN_GAP = 2;
const SHOP_HEADERS = { name: '아이템', level: '레벨', grade: '등급', price: '가격', effect: '효과' };

/** 고정폭(--font-mono) 렌더링을 전제로 한 상점 표. 열 폭은 그 상인이 파는 품목에 맞춰 매번 다시 잰다. */
function buildShopTable(catalog: ShopItemRow[]): string {
  if (catalog.length === 0) return '  판매 중인 아이템이 없습니다.';

  const rows = catalog.map((item) => ({
    grade: item.grade,
    name: item.name,
    level: `Lv.${item.level}`,
    gradeLabel: ITEM_GRADE_LABELS[item.grade],
    price: `${item.value} gold`,
    effect: formatItemBonuses(item) || '-',
  }));

  const nameWidth = Math.max(visualWidth(SHOP_HEADERS.name), ...rows.map((r) => visualWidth(r.name))) + SHOP_COLUMN_GAP;
  const levelWidth = Math.max(visualWidth(SHOP_HEADERS.level), ...rows.map((r) => visualWidth(r.level))) + SHOP_COLUMN_GAP;
  const gradeWidth = Math.max(visualWidth(SHOP_HEADERS.grade), ...rows.map((r) => visualWidth(r.gradeLabel))) + SHOP_COLUMN_GAP;
  const priceWidth = Math.max(visualWidth(SHOP_HEADERS.price), ...rows.map((r) => visualWidth(r.price))) + SHOP_COLUMN_GAP;

  const headerLine = `  ${padVisual(SHOP_HEADERS.name, nameWidth)}${padVisual(SHOP_HEADERS.level, levelWidth)}${padVisual(SHOP_HEADERS.grade, gradeWidth)}${padVisual(SHOP_HEADERS.price, priceWidth)}${SHOP_HEADERS.effect}`;
  const separator = `  ${'-'.repeat(visualWidth(headerLine) - 2)}`;
  const bodyLines = rows.map(
    (r) =>
      `  ${formatItemMention(padVisual(r.name, nameWidth), r.grade)}${padVisual(r.level, levelWidth)}${padVisual(r.gradeLabel, gradeWidth)}${padVisual(r.price, priceWidth)}${r.effect}`,
  );

  return [headerLine, separator, ...bodyLines].join('\n');
}

export function handleShop(ctx: CommandContext): void {
  const merchants = getMerchants(ctx.session.roomId);
  if (merchants.length === 0) {
    ctx.send({ type: 'text', text: '이곳에는 거래할 수 있는 상인이 없습니다.' });
    return;
  }

  const sections = merchants.map((merchant) => `${merchant.name}:\n${buildShopTable(getMerchantCatalog(merchant))}`);

  ctx.send({ type: 'text', text: sections.join('\n\n'), channel: 'shop' });
}

export function handleBuy(ctx: CommandContext, itemName: string): void {
  const trimmed = itemName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 구매하시겠습니까? 사용법: buy <아이템>' });
    return;
  }

  const merchants = getMerchants(ctx.session.roomId);
  if (merchants.length === 0) {
    ctx.send({ type: 'text', text: '이곳에는 거래할 수 있는 상인이 없습니다.' });
    return;
  }

  const lower = trimmed.toLowerCase();
  const item = merchants.flatMap((merchant) => getMerchantCatalog(merchant)).find((row) => row.name.toLowerCase().includes(lower));
  if (!item) {
    ctx.send({ type: 'text', text: '그런 아이템을 파는 상인이 없습니다.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  if (character.gold < item.value) {
    ctx.send({ type: 'text', text: `골드가 부족합니다. (필요 gold ${item.value}, 보유 gold ${character.gold})` });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM inventory_items WHERE character_id = ? AND item_id = ? AND equipped = 0')
    .get(ctx.session.characterId, item.id) as { id: number } | undefined;

  if (!existing) {
    const { count } = db
      .prepare('SELECT COUNT(*) as count FROM inventory_items WHERE character_id = ?')
      .get(ctx.session.characterId) as { count: number };
    if (count >= MAX_INVENTORY_SLOTS) {
      ctx.send({ type: 'text', text: `인벤토리가 가득 찼습니다. (${MAX_INVENTORY_SLOTS}/${MAX_INVENTORY_SLOTS})` });
      return;
    }
  }

  const buyTx = db.transaction(() => {
    db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(item.value, character.id);
    if (existing) {
      db.prepare('UPDATE inventory_items SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO inventory_items (character_id, item_id, quantity, equipped) VALUES (?, ?, 1, 0)').run(
        character.id,
        item.id,
      );
    }
  });
  buyTx();

  ctx.send({
    type: 'text',
    text: `${formatItemMention(item.name, item.grade)}을(를) ${item.value} gold에 구매했습니다.`,
  });

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
  sendEquipmentAndInventory(ctx);
}

export function handleSell(ctx: CommandContext, itemName: string): void {
  const trimmed = itemName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 판매하시겠습니까? 사용법: sell <아이템>' });
    return;
  }

  const merchants = getMerchants(ctx.session.roomId);
  if (merchants.length === 0) {
    ctx.send({ type: 'text', text: '이곳에는 거래할 수 있는 상인이 없습니다.' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT inv.id, inv.item_id, inv.quantity, inv.equipped, i.name, i.type, i.grade, i.value
       FROM inventory_items inv
       JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ?`,
    )
    .all(ctx.session.characterId) as SellableInventoryRow[];
  const lower = trimmed.toLowerCase();
  const item = rows.find((row) => row.name.toLowerCase().includes(lower));

  if (!item) {
    ctx.send({ type: 'text', text: '그런 아이템을 가지고 있지 않습니다.' });
    return;
  }
  if (item.equipped) {
    ctx.send({ type: 'text', text: '장착 중인 아이템은 판매할 수 없습니다. 먼저 해제하세요.' });
    return;
  }

  const buyer = merchants.find((merchant) => merchant.dealType === 'all' || merchant.dealType === item.type);
  if (!buyer) {
    ctx.send({ type: 'text', text: '이 아이템을 사줄 수 있는 상인이 없습니다.' });
    return;
  }

  const sellPrice = Math.floor(item.value * SELL_PRICE_RATIO);

  const sellTx = db.transaction(() => {
    if (item.quantity > 1) {
      db.prepare('UPDATE inventory_items SET quantity = quantity - 1 WHERE id = ?').run(item.id);
    } else {
      db.prepare('DELETE FROM inventory_items WHERE id = ?').run(item.id);
    }
    db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(sellPrice, ctx.session.characterId);
  });
  sellTx();

  ctx.send({
    type: 'text',
    text: `${formatItemMention(item.name, item.grade)}을(를) ${sellPrice} gold에 판매했습니다.`,
  });

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });
  sendEquipmentAndInventory(ctx);
}
