import {
  ELEMENT_LABELS,
  ELEMENT_VALUES,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  ITEM_GRADE_DROP_WEIGHT,
  ITEM_GRADE_LABELS,
  ITEM_GRADE_VALUES,
  NPC_DEAL_TYPE_LABELS,
  NPC_DEAL_TYPE_VALUES,
  NPC_TYPE_LABELS,
  NPC_TYPE_VALUES,
  type ElementType,
  type ItemGrade,
  type NpcDealType,
  type NpcType,
} from '@mud/shared';
import {
  addMobLootPoolItem,
  createItemTemplate,
  createMobTemplate,
  createNpcTemplate,
  deleteItemTemplate,
  deleteMobTemplate,
  deleteNpcTemplate,
  exportContent,
  fetchAccounts,
  fetchAdminRooms,
  fetchAllMobLootPools,
  fetchItemTemplates,
  fetchMobLootPool,
  fetchMobTemplates,
  fetchNpcTemplates,
  fetchSessions,
  importContent,
  moderationKick,
  moderationMove,
  removeMobLootPoolItem,
  sendAnnouncement,
  updateAccount,
  updateItemTemplate,
  updateMobTemplate,
  updateNpcTemplate,
  type ContentExportDto,
  type ItemTemplateDto,
  type MobLootPoolEntryDto,
  type MobTemplateDto,
  type NpcTemplateDto,
  type RoomOptionDto,
} from '../adminApi';
import { escapeHtml } from '../domUtils';

const ITEM_TYPE_LABELS: Record<string, string> = {
  weapon: '무기',
  armor: '방어구',
  consumable: '소모품',
};

const DAMAGE_TYPE_LABELS: Record<'physical' | 'magic', string> = {
  physical: '물리',
  magic: '마법',
};

export function renderAdminScreen(container: HTMLElement, token: string, onBack: () => void): void {
  container.innerHTML = `
    <div class="admin-screen">
      <div class="admin-toolbar">
        <span class="admin-title">어드민</span>
        <button type="button" id="admin-back">게임으로 돌아가기</button>
      </div>
      <div class="admin-main-tabs" id="admin-main-tabs">
        <button type="button" class="admin-main-tab-btn" data-admin-tab="accounts">유저 권한 관리</button>
        <button type="button" class="admin-main-tab-btn" data-admin-tab="sessions">온라인 유저</button>
        <button type="button" class="admin-main-tab-btn" data-admin-tab="announce">공지 보내기</button>
        <button type="button" class="admin-main-tab-btn" data-admin-tab="items">아이템</button>
        <button type="button" class="admin-main-tab-btn" data-admin-tab="mobs">몹</button>
        <button type="button" class="admin-main-tab-btn" data-admin-tab="npcs">NPC</button>
        <button type="button" class="admin-main-tab-btn" data-admin-tab="backup">백업</button>
      </div>
      <div class="admin-body">
        <section class="admin-section" data-admin-tab-panel="accounts">
          <h3>유저 권한 관리</h3>
          <table class="admin-table">
            <thead><tr><th>아이디</th><th>빌더</th><th>어드민</th></tr></thead>
            <tbody id="admin-accounts-body"></tbody>
          </table>
          <p class="admin-error" id="admin-accounts-error"></p>
        </section>

        <section class="admin-section" data-admin-tab-panel="sessions">
          <h3>온라인 유저</h3>
          <div id="admin-sessions-list"></div>
          <p class="admin-error" id="admin-sessions-error"></p>
        </section>

        <section class="admin-section" data-admin-tab-panel="announce">
          <h3>공지 보내기</h3>
          <div class="admin-form-row">
            <input id="admin-announce-input" type="text" maxlength="500" placeholder="공지 내용" />
            <button type="button" id="admin-announce-send">보내기</button>
          </div>
          <p class="admin-error" id="admin-announce-error"></p>
        </section>

        <section class="admin-section" data-admin-tab-panel="items">
          <h3>아이템</h3>
          <div class="admin-tabs" id="admin-item-grade-tabs"></div>
          <ul class="admin-list" id="admin-item-templates"></ul>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-item-name">이름</label>
              <input id="admin-item-name" placeholder="이름" maxlength="30" />
            </div>
            <div class="admin-field">
              <label for="admin-item-desc">설명</label>
              <input id="admin-item-desc" placeholder="설명" maxlength="200" />
            </div>
            <div class="admin-field">
              <label for="admin-item-type">종류</label>
              <select id="admin-item-type">
                <option value="weapon">무기</option>
                <option value="armor">방어구</option>
                <option value="consumable">소모품</option>
              </select>
            </div>
            <div class="admin-field">
              <label for="admin-item-slot">착용 부위</label>
              <select id="admin-item-slot">
                <option value="">착용 부위 없음</option>
                ${EQUIPMENT_SLOTS.map((slot) => `<option value="${slot}">${EQUIPMENT_SLOT_LABELS[slot]}</option>`).join('')}
              </select>
            </div>
            <div class="admin-field">
              <label for="admin-item-level">레벨</label>
              <input id="admin-item-level" type="number" placeholder="레벨" value="1" min="1" />
            </div>
            <div class="admin-field">
              <label for="admin-item-grade">등급</label>
              <select id="admin-item-grade">
                ${ITEM_GRADE_VALUES.map((grade) => `<option value="${grade}">${ITEM_GRADE_LABELS[grade]}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-item-str">힘 보너스</label>
              <input id="admin-item-str" type="number" placeholder="힘" value="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-dex">민첩 보너스</label>
              <input id="admin-item-dex" type="number" placeholder="민첩" value="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-attack">공격력 보너스 (무기)</label>
              <input id="admin-item-attack" type="number" placeholder="공격력" value="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-int">지능 보너스 (마법 무기)</label>
              <input id="admin-item-int" type="number" placeholder="지능" value="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-pdef">물리방어 보너스</label>
              <input id="admin-item-pdef" type="number" placeholder="물리방어" value="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-mdef">마법방어 보너스</label>
              <input id="admin-item-mdef" type="number" placeholder="마법방어" value="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-heal">회복량 (소모품)</label>
              <input id="admin-item-heal" type="number" placeholder="회복량" value="0" min="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-mana">마나 회복량 (소모품)</label>
              <input id="admin-item-mana" type="number" placeholder="마나 회복량" value="0" min="0" />
            </div>
            <div class="admin-field">
              <label for="admin-item-value">판매 가치</label>
              <input id="admin-item-value" type="number" placeholder="가치" value="0" min="0" />
            </div>
            <button type="button" id="admin-item-create">아이템 생성</button>
            <button type="button" id="admin-item-cancel" hidden>취소</button>
          </div>
          <p class="admin-error" id="admin-item-error"></p>
          <p class="admin-panel-empty">아이템 배치는 맵 빌더에서 할 수 있습니다.</p>
        </section>

        <section class="admin-section" data-admin-tab-panel="mobs">
          <h3>몹</h3>
          <ul class="admin-list" id="admin-mob-templates"></ul>
          <div class="admin-form-row">
            <input id="admin-mob-name" placeholder="이름" maxlength="30" title="몬스터 이름" />
            <input
              id="admin-mob-hp"
              type="number"
              placeholder="HP"
              value="10"
              min="1"
              title="최대 체력. 0이 되면 몬스터가 처치됩니다."
            />
            <select id="admin-mob-element" title="속성. 오행 상성(목→토→수→화→금→목 순으로 상극)에 따라 전투 시 데미지 배율이 달라집니다."></select>
            <select id="admin-mob-damage-type" title="공격 시 물리방어/마법방어 중 어느 방어력으로 피해를 계산할지 결정합니다.">
              <option value="physical">물리</option>
              <option value="magic">마법</option>
            </select>
            <input
              id="admin-mob-level"
              type="number"
              placeholder="레벨"
              value="1"
              min="1"
              title="몬스터 레벨. 몹이 들 수 있는 아이템 풀을 설계할 때 난이도 기준으로 참고합니다."
            />
            <label class="admin-checkbox-label" title="켜두면 상성 우위를 가진 플레이어가 방에 들어올 때 이 몹이 자동으로 공격합니다. 끄면 상점 주인처럼 절대 먼저 공격하지 않는 비전투 NPC로 동작합니다.">
              <input id="admin-mob-hostile" type="checkbox" checked />
              적대적(자동 공격)
            </label>
          </div>
          <div class="admin-form-row">
            <input
              id="admin-mob-str"
              type="number"
              placeholder="힘"
              value="1"
              min="0"
              title="힘. 물리 공격력(가한 피해량)의 기준치입니다."
            />
            <input
              id="admin-mob-dex"
              type="number"
              placeholder="민첩"
              value="1"
              min="0"
              title="민첩. 공격 명중률/회피율에 영향을 줍니다."
            />
            <input
              id="admin-mob-pdef"
              type="number"
              placeholder="물리방어"
              value="0"
              min="0"
              title="물리방어. 상대의 물리 공격으로 받는 피해를 줄입니다."
            />
            <input
              id="admin-mob-mdef"
              type="number"
              placeholder="마법방어"
              value="0"
              min="0"
              title="마법방어. 상대의 마법 공격으로 받는 피해를 줄입니다."
            />
            <input
              id="admin-mob-exp"
              type="number"
              placeholder="경험치"
              value="5"
              min="0"
              title="처치 시 플레이어가 얻는 경험치량입니다."
            />
            <input
              id="admin-mob-gold"
              type="number"
              placeholder="골드"
              value="1"
              min="0"
              title="처치 시 플레이어가 얻는 골드량입니다."
            />
            <button type="button" id="admin-mob-create">몬스터 생성</button>
            <button type="button" id="admin-mob-cancel" hidden>취소</button>
          </div>
          <p class="admin-error" id="admin-mob-error"></p>

          <h4>보유 가능 아이템 (죽었을 때 드랍)</h4>
          <ul class="admin-list" id="admin-mob-loot-items"></ul>
          <p class="admin-panel-empty">
            체크한 아이템 중 몹이 무작위로 최대 2개를 들고 스폰되며, 처치되면 그 아이템을 떨어뜨립니다. 등급이 높을수록 보유 확률이 낮습니다.
            현재 레벨 입력값 기준으로 걸 수 있는 아이템만 표시됩니다.
          </p>
          <p class="admin-error" id="admin-mob-loot-error"></p>
          <p class="admin-panel-empty">몬스터 배치는 맵 빌더에서 할 수 있습니다.</p>
        </section>

        <section class="admin-section" data-admin-tab-panel="npcs">
          <h3>NPC</h3>
          <ul class="admin-list" id="admin-npc-templates"></ul>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-npc-name">이름</label>
              <input id="admin-npc-name" placeholder="이름" maxlength="30" />
            </div>
            <div class="admin-field">
              <label for="admin-npc-desc">설명</label>
              <input id="admin-npc-desc" placeholder="설명" maxlength="200" />
            </div>
            <div class="admin-field">
              <label for="admin-npc-type">종류</label>
              <select id="admin-npc-type">
                ${NPC_TYPE_VALUES.map((type) => `<option value="${type}">${NPC_TYPE_LABELS[type]}</option>`).join('')}
              </select>
            </div>
            <div class="admin-field">
              <label for="admin-npc-level">레벨</label>
              <input
                id="admin-npc-level"
                type="number"
                placeholder="레벨"
                value="1"
                min="1"
                title="이 레벨 이하의 아이템만 취급합니다 (상인일 경우)."
              />
            </div>
            <div class="admin-field">
              <label for="admin-npc-deal-type">취급 품목</label>
              <select id="admin-npc-deal-type" title="상인일 경우 이 종류의 아이템만 사고팝니다.">
                ${NPC_DEAL_TYPE_VALUES.map((type) => `<option value="${type}">${NPC_DEAL_TYPE_LABELS[type]}</option>`).join('')}
              </select>
            </div>
            <button type="button" id="admin-npc-create">NPC 생성</button>
            <button type="button" id="admin-npc-cancel" hidden>취소</button>
          </div>
          <p class="admin-error" id="admin-npc-error"></p>
          <p class="admin-panel-empty">NPC 배치는 맵 빌더에서 할 수 있습니다. 상인 종류만 실제로 거래(buy/sell) 기능이 동작합니다.</p>
        </section>

        <section class="admin-section" data-admin-tab-panel="backup">
          <h3>백업</h3>
          <p class="admin-panel-empty">
            관리자 화면에서 만든 아이템/몹/드랍풀은 DB에만 저장되어 있어, DB를 초기화하거나 서버를 재설치하면 사라집니다.
            내보내기로 현재 상태를 파일로 저장해두고, 복원할 때 가져오기로 그 파일을 불러오세요. (같은 id는 덮어씁니다.)
          </p>
          <div class="admin-form-row">
            <button type="button" id="admin-backup-export">내보내기 (파일 다운로드)</button>
          </div>
          <div class="admin-form-row">
            <input id="admin-backup-import-file" type="file" accept="application/json" />
            <button type="button" id="admin-backup-import">가져오기</button>
          </div>
          <p class="admin-panel-empty" id="admin-backup-result"></p>
          <p class="admin-error" id="admin-backup-error"></p>
        </section>
      </div>
    </div>
  `;

  const accountsBody = container.querySelector<HTMLTableSectionElement>('#admin-accounts-body')!;
  const accountsError = container.querySelector<HTMLParagraphElement>('#admin-accounts-error')!;
  const sessionsList = container.querySelector<HTMLDivElement>('#admin-sessions-list')!;
  const sessionsError = container.querySelector<HTMLParagraphElement>('#admin-sessions-error')!;
  const announceInput = container.querySelector<HTMLInputElement>('#admin-announce-input')!;
  const announceError = container.querySelector<HTMLParagraphElement>('#admin-announce-error')!;

  const itemGradeTabs = container.querySelector<HTMLDivElement>('#admin-item-grade-tabs')!;
  const itemTemplatesList = container.querySelector<HTMLUListElement>('#admin-item-templates')!;
  const itemError = container.querySelector<HTMLParagraphElement>('#admin-item-error')!;
  const itemCreateBtn = container.querySelector<HTMLButtonElement>('#admin-item-create')!;
  const itemCancelBtn = container.querySelector<HTMLButtonElement>('#admin-item-cancel')!;
  let itemTemplates: ItemTemplateDto[] = [];
  let selectedItemGrade: ItemGrade = ITEM_GRADE_VALUES[0];
  let editingItemId: number | null = null;

  const mobTemplatesList = container.querySelector<HTMLUListElement>('#admin-mob-templates')!;
  const mobError = container.querySelector<HTMLParagraphElement>('#admin-mob-error')!;
  const mobElementSelect = container.querySelector<HTMLSelectElement>('#admin-mob-element')!;
  const mobLevelInput = container.querySelector<HTMLInputElement>('#admin-mob-level')!;
  const mobLootItemsList = container.querySelector<HTMLUListElement>('#admin-mob-loot-items')!;
  const mobLootError = container.querySelector<HTMLParagraphElement>('#admin-mob-loot-error')!;
  const mobCreateBtn = container.querySelector<HTMLButtonElement>('#admin-mob-create')!;
  const mobCancelBtn = container.querySelector<HTMLButtonElement>('#admin-mob-cancel')!;

  let mobTemplates: MobTemplateDto[] = [];
  let editingMobId: number | null = null;
  /** 아직 생성되지 않은 신규 몬스터에 임시로 체크해둔 보유 가능 아이템(itemId -> weight). 생성 성공 후 실제로 반영한다. */
  let pendingLootWeights = new Map<number, number>();

  const npcTemplatesList = container.querySelector<HTMLUListElement>('#admin-npc-templates')!;
  const npcError = container.querySelector<HTMLParagraphElement>('#admin-npc-error')!;
  const npcCreateBtn = container.querySelector<HTMLButtonElement>('#admin-npc-create')!;
  const npcCancelBtn = container.querySelector<HTMLButtonElement>('#admin-npc-cancel')!;

  let npcTemplates: NpcTemplateDto[] = [];
  let editingNpcId: number | null = null;

  mobElementSelect.innerHTML = ELEMENT_VALUES.map(
    (value) => `<option value="${value}">${ELEMENT_LABELS[value]}</option>`,
  ).join('');

  let rooms: RoomOptionDto[] = [];

  function roomOptionsHtml(): string {
    return rooms.map((room) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('');
  }

  async function refreshRooms(): Promise<void> {
    rooms = (await fetchAdminRooms(token)).rooms;
  }

  async function refreshAccounts(): Promise<void> {
    const { accounts } = await fetchAccounts(token);
    accountsBody.innerHTML = accounts
      .map(
        (account) => `
          <tr>
            <td>${escapeHtml(account.username)}</td>
            <td><input type="checkbox" class="admin-role-toggle" data-account-id="${account.id}" data-field="isBuilder" ${account.isBuilder ? 'checked' : ''} /></td>
            <td><input type="checkbox" class="admin-role-toggle" data-account-id="${account.id}" data-field="isAdmin" ${account.isAdmin ? 'checked' : ''} /></td>
          </tr>
        `,
      )
      .join('');

    accountsBody.querySelectorAll<HTMLInputElement>('.admin-role-toggle').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const accountId = Number(checkbox.dataset.accountId);
        const field = checkbox.dataset.field as 'isBuilder' | 'isAdmin';
        updateAccount(token, accountId, { [field]: checkbox.checked }).catch((error: unknown) => {
          accountsError.textContent = error instanceof Error ? error.message : '권한 변경에 실패했습니다.';
          checkbox.checked = !checkbox.checked;
        });
      });
    });
  }

  async function refreshSessions(): Promise<void> {
    const { sessions } = await fetchSessions(token);
    sessionsList.innerHTML = sessions
      .map(
        (session) => `
          <div class="admin-session-row" data-character="${escapeHtml(session.characterName)}">
            <span>${escapeHtml(session.characterName)} — ${escapeHtml(session.roomName)}</span>
            <select class="admin-move-target">${roomOptionsHtml()}</select>
            <button type="button" class="admin-move-btn">이동</button>
            <button type="button" class="admin-kick-btn">추방</button>
          </div>
        `,
      )
      .join('') || '<p class="admin-panel-empty">접속 중인 유저가 없습니다.</p>';

    sessionsList.querySelectorAll<HTMLDivElement>('.admin-session-row').forEach((row) => {
      const characterName = row.dataset.character!;
      row.querySelector<HTMLButtonElement>('.admin-move-btn')!.addEventListener('click', () => {
        const targetRoomId = Number(row.querySelector<HTMLSelectElement>('.admin-move-target')!.value);
        moderationMove(token, characterName, targetRoomId)
          .then(() => refreshSessions())
          .catch((error: unknown) => {
            sessionsError.textContent = error instanceof Error ? error.message : '이동에 실패했습니다.';
          });
      });
      row.querySelector<HTMLButtonElement>('.admin-kick-btn')!.addEventListener('click', () => {
        moderationKick(token, characterName)
          .then(() => refreshSessions())
          .catch((error: unknown) => {
            sessionsError.textContent = error instanceof Error ? error.message : '추방에 실패했습니다.';
          });
      });
    });
  }

  function renderItemGradeTabs(): void {
    itemGradeTabs.innerHTML = ITEM_GRADE_VALUES.map((grade) => {
      const count = itemTemplates.filter((item) => item.grade === grade).length;
      return `<button type="button" class="admin-tab-btn${grade === selectedItemGrade ? ' active' : ''}" data-grade="${grade}">${ITEM_GRADE_LABELS[grade]} (${count})</button>`;
    }).join('');

    itemGradeTabs.querySelectorAll<HTMLButtonElement>('.admin-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedItemGrade = btn.dataset.grade as ItemGrade;
        renderItemGradeTabs();
        renderItemList();
      });
    });
  }

  function fillItemForm(item: ItemTemplateDto): void {
    container.querySelector<HTMLInputElement>('#admin-item-name')!.value = item.name;
    container.querySelector<HTMLInputElement>('#admin-item-desc')!.value = item.description;
    container.querySelector<HTMLSelectElement>('#admin-item-type')!.value = item.type;
    container.querySelector<HTMLSelectElement>('#admin-item-slot')!.value = item.slot ?? '';
    container.querySelector<HTMLInputElement>('#admin-item-level')!.value = String(item.level);
    container.querySelector<HTMLSelectElement>('#admin-item-grade')!.value = item.grade;
    container.querySelector<HTMLInputElement>('#admin-item-str')!.value = String(item.strengthBonus);
    container.querySelector<HTMLInputElement>('#admin-item-dex')!.value = String(item.dexterityBonus);
    container.querySelector<HTMLInputElement>('#admin-item-attack')!.value = String(item.attackPowerBonus);
    container.querySelector<HTMLInputElement>('#admin-item-int')!.value = String(item.intelligenceBonus);
    container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value = String(item.physicalDefenseBonus);
    container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value = String(item.magicDefenseBonus);
    container.querySelector<HTMLInputElement>('#admin-item-heal')!.value = String(item.healAmount);
    container.querySelector<HTMLInputElement>('#admin-item-mana')!.value = String(item.manaAmount);
    container.querySelector<HTMLInputElement>('#admin-item-value')!.value = String(item.value);
  }

  function resetItemForm(): void {
    editingItemId = null;
    itemCreateBtn.textContent = '아이템 생성';
    itemCancelBtn.hidden = true;
    itemError.textContent = '';
    container.querySelector<HTMLInputElement>('#admin-item-name')!.value = '';
    container.querySelector<HTMLInputElement>('#admin-item-desc')!.value = '';
    container.querySelector<HTMLInputElement>('#admin-item-level')!.value = '1';
    container.querySelector<HTMLInputElement>('#admin-item-str')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-dex')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-attack')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-int')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-heal')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-mana')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-item-value')!.value = '0';
  }

  function itemStatSummary(item: ItemTemplateDto): string {
    const stats: string[] = [];
    if (item.attackPowerBonus) stats.push(`공격력 +${item.attackPowerBonus}`);
    if (item.intelligenceBonus) stats.push(`지능 +${item.intelligenceBonus}`);
    if (item.strengthBonus) stats.push(`힘 +${item.strengthBonus}`);
    if (item.dexterityBonus) stats.push(`민첩 +${item.dexterityBonus}`);
    if (item.physicalDefenseBonus) stats.push(`물리방어 +${item.physicalDefenseBonus}`);
    if (item.magicDefenseBonus) stats.push(`마법방어 +${item.magicDefenseBonus}`);
    if (item.healAmount) stats.push(`회복 +${item.healAmount}`);
    if (item.manaAmount) stats.push(`마나회복 +${item.manaAmount}`);
    return stats.length ? `, ${stats.join(', ')}` : '';
  }

  function renderItemList(): void {
    const items = itemTemplates.filter((item) => item.grade === selectedItemGrade);

    itemTemplatesList.innerHTML =
      items
        .map(
          (item) => `
            <li>
              <span><span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> (${ITEM_TYPE_LABELS[item.type] ?? item.type}${item.slot ? `, ${EQUIPMENT_SLOT_LABELS[item.slot]}` : ''}, Lv.${item.level}, ${ITEM_GRADE_LABELS[item.grade]}, 가치 ${item.value}${itemStatSummary(item)})</span>
              <span class="admin-row-actions">
                <button type="button" class="admin-edit-btn" data-item-id="${item.id}">수정</button>
                <button type="button" class="admin-delete-btn" data-item-id="${item.id}">삭제</button>
              </span>
            </li>
          `,
        )
        .join('') || '<li class="admin-panel-empty">이 등급의 아이템이 없습니다.</li>';

    itemTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = itemTemplates.find((entry) => entry.id === Number(btn.dataset.itemId));
        if (!item) return;
        editingItemId = item.id;
        fillItemForm(item);
        itemCreateBtn.textContent = '저장';
        itemCancelBtn.hidden = false;
        itemError.textContent = '';
      });
    });

    itemTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = itemTemplates.find((entry) => entry.id === Number(btn.dataset.itemId));
        if (!item) return;
        if (!confirm(`"${item.name}" 아이템을 삭제할까요?`)) return;
        deleteItemTemplate(token, item.id)
          .then(() => {
            if (editingItemId === item.id) resetItemForm();
            return refreshItems();
          })
          .catch((error: unknown) => {
            itemError.textContent = error instanceof Error ? error.message : '아이템 삭제에 실패했습니다.';
          });
      });
    });
  }

  async function refreshItems(): Promise<void> {
    const { items } = await fetchItemTemplates(token);
    itemTemplates = items;
    renderItemGradeTabs();
    renderItemList();
  }

  function fillMobForm(mob: MobTemplateDto): void {
    container.querySelector<HTMLInputElement>('#admin-mob-name')!.value = mob.name;
    container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value = String(mob.hp);
    mobElementSelect.value = mob.element;
    container.querySelector<HTMLSelectElement>('#admin-mob-damage-type')!.value = mob.damageType;
    container.querySelector<HTMLInputElement>('#admin-mob-level')!.value = String(mob.level);
    container.querySelector<HTMLInputElement>('#admin-mob-hostile')!.checked = mob.hostile;
    container.querySelector<HTMLInputElement>('#admin-mob-str')!.value = String(mob.strength);
    container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value = String(mob.dexterity);
    container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value = String(mob.physicalDefense);
    container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value = String(mob.magicDefense);
    container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value = String(mob.expReward);
    container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value = String(mob.goldReward);
  }

  function resetMobForm(): void {
    editingMobId = null;
    mobCreateBtn.textContent = '몬스터 생성';
    mobCancelBtn.hidden = true;
    mobError.textContent = '';
    container.querySelector<HTMLInputElement>('#admin-mob-name')!.value = '';
    container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value = '10';
    container.querySelector<HTMLInputElement>('#admin-mob-level')!.value = '1';
    container.querySelector<HTMLInputElement>('#admin-mob-hostile')!.checked = true;
    container.querySelector<HTMLInputElement>('#admin-mob-str')!.value = '1';
    container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value = '1';
    container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value = '0';
    container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value = '5';
    container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value = '1';
    pendingLootWeights = new Map();
  }

  function renderMobTemplatesList(lootEntries: MobLootPoolEntryDto[]): void {
    const lootByMobId = new Map<number, MobLootPoolEntryDto[]>();
    for (const entry of lootEntries) {
      const list = lootByMobId.get(entry.mobTemplateId) ?? [];
      list.push(entry);
      lootByMobId.set(entry.mobTemplateId, list);
    }

    mobTemplatesList.innerHTML =
      mobTemplates
        .map((mob) => {
          const loot = lootByMobId.get(mob.id) ?? [];
          const lootText = loot
            .map((entry) => `<span class="item-grade-${entry.grade}">${escapeHtml(entry.name)}</span>(${entry.weight}%)`)
            .join(', ');
          return `
            <li class="admin-mob-row">
              <div class="admin-mob-row-main">
                <span>${escapeHtml(mob.name)} (Lv.${mob.level}, HP ${mob.hp}, ${ELEMENT_LABELS[mob.element]}, ${DAMAGE_TYPE_LABELS[mob.damageType]}${mob.hostile ? '' : ', 비전투'})</span>
                <span class="admin-row-actions">
                  <button type="button" class="admin-edit-btn" data-mob-id="${mob.id}">수정</button>
                  <button type="button" class="admin-delete-btn" data-mob-id="${mob.id}">삭제</button>
                </span>
              </div>
              ${lootText ? `<div class="admin-mob-row-loot">${lootText}</div>` : ''}
            </li>
          `;
        })
        .join('') || '<li class="admin-panel-empty">없음</li>';

    mobTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mob = mobTemplates.find((entry) => entry.id === Number(btn.dataset.mobId));
        if (!mob) return;
        editingMobId = mob.id;
        fillMobForm(mob);
        mobCreateBtn.textContent = '저장';
        mobCancelBtn.hidden = false;
        mobError.textContent = '';
        refreshMobLootPool().catch((error: unknown) => {
          mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
        });
      });
    });

    mobTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mob = mobTemplates.find((entry) => entry.id === Number(btn.dataset.mobId));
        if (!mob) return;
        if (!confirm(`"${mob.name}" 몬스터를 삭제할까요?`)) return;
        deleteMobTemplate(token, mob.id)
          .then(() => {
            if (editingMobId === mob.id) resetMobForm();
            return refreshMobs();
          })
          .catch((error: unknown) => {
            mobError.textContent = error instanceof Error ? error.message : '몬스터 삭제에 실패했습니다.';
          });
      });
    });
  }

  async function refreshMobLootSummaries(): Promise<void> {
    const { items: lootEntries } = await fetchAllMobLootPools(token);
    renderMobTemplatesList(lootEntries);
  }

  async function refreshMobs(): Promise<void> {
    const [{ mobTemplates: fetched }, { items: lootEntries }] = await Promise.all([
      fetchMobTemplates(token),
      fetchAllMobLootPools(token),
    ]);
    mobTemplates = fetched;
    renderMobTemplatesList(lootEntries);

    await refreshMobLootPool();
  }

  /**
   * 편집 중인 몬스터가 있으면 그 몬스터의 실제 보유 아이템 풀을(서버에 바로 반영하며) 보여주고,
   * 새 몬스터를 만드는 중이면 아직 저장되지 않은 로컬 선택(pendingLootWeights)만 보여준다.
   * 두 경우 모두 레벨 입력창에 현재 입력된 값 기준으로 아이템을 필터링한다.
   */
  async function refreshMobLootPool(): Promise<void> {
    mobLootError.textContent = '';
    const level = Number(mobLevelInput.value) || 1;
    const eligibleItems = itemTemplates.filter((item) => item.level <= level);

    const poolWeights = editingMobId
      ? new Map<number, number>((await fetchMobLootPool(token, editingMobId)).items.map((item) => [item.id, item.weight]))
      : pendingLootWeights;

    mobLootItemsList.innerHTML =
      eligibleItems
        .map((item) => {
          const inPool = poolWeights.has(item.id);
          const weight = poolWeights.get(item.id) ?? ITEM_GRADE_DROP_WEIGHT[item.grade];
          return `
            <li>
              <label class="admin-checkbox-label">
                <input type="checkbox" class="admin-mob-loot-toggle" data-item-id="${item.id}" ${inPool ? 'checked' : ''} />
                <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> (${ITEM_GRADE_LABELS[item.grade]})
              </label>
              <input
                type="number"
                class="admin-mob-loot-weight"
                data-item-id="${item.id}"
                value="${weight}"
                min="1"
                title="드랍 가중치. 값이 클수록 이 몬스터가 이 아이템을 더 자주 보유합니다."
                ${inPool ? '' : 'disabled'}
              />
            </li>
          `;
        })
        .join('') || `<li class="admin-panel-empty">${itemTemplates.length === 0 ? '생성된 아이템이 없습니다.' : `${level}레벨 이하 아이템이 없습니다.`}</li>`;

    mobLootItemsList.querySelectorAll<HTMLInputElement>('.admin-mob-loot-toggle').forEach((checkbox) => {
      const weightInput = mobLootItemsList.querySelector<HTMLInputElement>(
        `.admin-mob-loot-weight[data-item-id="${checkbox.dataset.itemId}"]`,
      )!;
      checkbox.addEventListener('change', () => {
        const itemId = Number(checkbox.dataset.itemId);
        weightInput.disabled = !checkbox.checked;
        if (!editingMobId) {
          if (checkbox.checked) pendingLootWeights.set(itemId, Number(weightInput.value));
          else pendingLootWeights.delete(itemId);
          return;
        }
        const action = checkbox.checked
          ? addMobLootPoolItem(token, editingMobId, itemId, Number(weightInput.value))
          : removeMobLootPoolItem(token, editingMobId, itemId);
        action
          .then(() => refreshMobLootSummaries())
          .catch((error: unknown) => {
            mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀 변경에 실패했습니다.';
            checkbox.checked = !checkbox.checked;
            weightInput.disabled = !checkbox.checked;
          });
      });
    });

    mobLootItemsList.querySelectorAll<HTMLInputElement>('.admin-mob-loot-weight').forEach((weightInput) => {
      weightInput.addEventListener('change', () => {
        const itemId = Number(weightInput.dataset.itemId);
        const weight = Number(weightInput.value);
        if (!editingMobId) {
          if (pendingLootWeights.has(itemId)) pendingLootWeights.set(itemId, weight);
          return;
        }
        addMobLootPoolItem(token, editingMobId, itemId, weight)
          .then(() => refreshMobLootSummaries())
          .catch((error: unknown) => {
            mobLootError.textContent = error instanceof Error ? error.message : '가중치 변경에 실패했습니다.';
          });
      });
    });
  }

  function fillNpcForm(npc: NpcTemplateDto): void {
    container.querySelector<HTMLInputElement>('#admin-npc-name')!.value = npc.name;
    container.querySelector<HTMLInputElement>('#admin-npc-desc')!.value = npc.description;
    container.querySelector<HTMLSelectElement>('#admin-npc-type')!.value = npc.type;
    container.querySelector<HTMLInputElement>('#admin-npc-level')!.value = String(npc.level);
    container.querySelector<HTMLSelectElement>('#admin-npc-deal-type')!.value = npc.dealType;
  }

  function resetNpcForm(): void {
    editingNpcId = null;
    npcCreateBtn.textContent = 'NPC 생성';
    npcCancelBtn.hidden = true;
    npcError.textContent = '';
    container.querySelector<HTMLInputElement>('#admin-npc-name')!.value = '';
    container.querySelector<HTMLInputElement>('#admin-npc-desc')!.value = '';
    container.querySelector<HTMLInputElement>('#admin-npc-level')!.value = '1';
  }

  async function refreshNpcs(): Promise<void> {
    const { npcTemplates: fetched } = await fetchNpcTemplates(token);
    npcTemplates = fetched;

    npcTemplatesList.innerHTML =
      npcTemplates
        .map(
          (npc) => `
            <li>
              <span>${escapeHtml(npc.name)} (${NPC_TYPE_LABELS[npc.type]}, Lv.${npc.level}, ${NPC_DEAL_TYPE_LABELS[npc.dealType]})</span>
              <span class="admin-row-actions">
                <button type="button" class="admin-edit-btn" data-npc-id="${npc.id}">수정</button>
                <button type="button" class="admin-delete-btn" data-npc-id="${npc.id}">삭제</button>
              </span>
            </li>
          `,
        )
        .join('') || '<li class="admin-panel-empty">없음</li>';

    npcTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const npc = npcTemplates.find((entry) => entry.id === Number(btn.dataset.npcId));
        if (!npc) return;
        editingNpcId = npc.id;
        fillNpcForm(npc);
        npcCreateBtn.textContent = '저장';
        npcCancelBtn.hidden = false;
        npcError.textContent = '';
      });
    });

    npcTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const npc = npcTemplates.find((entry) => entry.id === Number(btn.dataset.npcId));
        if (!npc) return;
        if (!confirm(`"${npc.name}" NPC를 삭제할까요?`)) return;
        deleteNpcTemplate(token, npc.id)
          .then(() => {
            if (editingNpcId === npc.id) resetNpcForm();
            return refreshNpcs();
          })
          .catch((error: unknown) => {
            npcError.textContent = error instanceof Error ? error.message : 'NPC 삭제에 실패했습니다.';
          });
      });
    });
  }

  container.querySelector<HTMLButtonElement>('#admin-announce-send')!.addEventListener('click', () => {
    const message = announceInput.value.trim();
    announceError.textContent = '';
    if (!message) {
      announceError.textContent = '메시지를 입력하세요.';
      return;
    }
    sendAnnouncement(token, message)
      .then(() => {
        announceInput.value = '';
      })
      .catch((error: unknown) => {
        announceError.textContent = error instanceof Error ? error.message : '공지 전송에 실패했습니다.';
      });
  });

  itemCreateBtn.addEventListener('click', () => {
    const name = container.querySelector<HTMLInputElement>('#admin-item-name')!.value.trim();
    const description = container.querySelector<HTMLInputElement>('#admin-item-desc')!.value.trim();
    const type = container.querySelector<HTMLSelectElement>('#admin-item-type')!.value;
    const slot = container.querySelector<HTMLSelectElement>('#admin-item-slot')!.value;
    const level = Number(container.querySelector<HTMLInputElement>('#admin-item-level')!.value);
    const grade = container.querySelector<HTMLSelectElement>('#admin-item-grade')!.value as ItemGrade;
    itemError.textContent = '';
    if (!name || !description) {
      itemError.textContent = '이름과 설명을 입력하세요.';
      return;
    }
    const data = {
      name,
      description,
      type,
      slot: slot ? (slot as ItemTemplateDto['slot']) : null,
      level,
      grade,
      strengthBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-str')!.value),
      dexterityBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-dex')!.value),
      attackPowerBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-attack')!.value),
      intelligenceBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-int')!.value),
      physicalDefenseBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value),
      magicDefenseBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value),
      healAmount: Number(container.querySelector<HTMLInputElement>('#admin-item-heal')!.value),
      manaAmount: Number(container.querySelector<HTMLInputElement>('#admin-item-mana')!.value),
      value: Number(container.querySelector<HTMLInputElement>('#admin-item-value')!.value),
    };
    const request = editingItemId ? updateItemTemplate(token, editingItemId, data) : createItemTemplate(token, data);
    request
      .then(() => {
        selectedItemGrade = grade;
        resetItemForm();
        return refreshItems();
      })
      .catch((error: unknown) => {
        itemError.textContent = error instanceof Error ? error.message : '아이템 저장에 실패했습니다.';
      });
  });

  itemCancelBtn.addEventListener('click', () => resetItemForm());

  mobCreateBtn.addEventListener('click', () => {
    const name = container.querySelector<HTMLInputElement>('#admin-mob-name')!.value.trim();
    mobError.textContent = '';
    if (!name) {
      mobError.textContent = '이름을 입력하세요.';
      return;
    }
    const data = {
      hp: Number(container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value),
      strength: Number(container.querySelector<HTMLInputElement>('#admin-mob-str')!.value),
      dexterity: Number(container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value),
      physicalDefense: Number(container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value),
      magicDefense: Number(container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value),
      element: mobElementSelect.value as ElementType,
      damageType: container.querySelector<HTMLSelectElement>('#admin-mob-damage-type')!.value as 'physical' | 'magic',
      expReward: Number(container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value),
      goldReward: Number(container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value),
      level: Number(container.querySelector<HTMLInputElement>('#admin-mob-level')!.value),
      hostile: container.querySelector<HTMLInputElement>('#admin-mob-hostile')!.checked,
      name,
    };
    const wasCreating = !editingMobId;
    const pending = [...pendingLootWeights.entries()];
    const request = editingMobId ? updateMobTemplate(token, editingMobId, data) : createMobTemplate(token, data);
    request
      .then(async (result) => {
        if (wasCreating && pending.length > 0) {
          const newMobId = result.mobTemplate.id;
          await Promise.all(pending.map(([itemId, weight]) => addMobLootPoolItem(token, newMobId, itemId, weight)));
        }
        resetMobForm();
        return refreshMobs();
      })
      .catch((error: unknown) => {
        mobError.textContent = error instanceof Error ? error.message : '몬스터 저장에 실패했습니다.';
      });
  });

  mobCancelBtn.addEventListener('click', () => {
    resetMobForm();
    refreshMobLootPool().catch((error: unknown) => {
      mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
    });
  });

  mobLevelInput.addEventListener('input', () => {
    refreshMobLootPool().catch((error: unknown) => {
      mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
    });
  });

  const backupExportBtn = container.querySelector<HTMLButtonElement>('#admin-backup-export')!;
  const backupImportBtn = container.querySelector<HTMLButtonElement>('#admin-backup-import')!;
  const backupImportFile = container.querySelector<HTMLInputElement>('#admin-backup-import-file')!;
  const backupResult = container.querySelector<HTMLParagraphElement>('#admin-backup-result')!;
  const backupError = container.querySelector<HTMLParagraphElement>('#admin-backup-error')!;

  backupExportBtn.addEventListener('click', () => {
    backupError.textContent = '';
    exportContent(token)
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mud-content-backup-${data.exportedAt.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        backupResult.textContent = `${data.items.length}개 아이템, ${data.mobTemplates.length}개 몹, ${data.mobLootPool.length}개 드랍 항목을 내보냈습니다.`;
      })
      .catch((error: unknown) => {
        backupError.textContent = error instanceof Error ? error.message : '내보내기에 실패했습니다.';
      });
  });

  backupImportBtn.addEventListener('click', () => {
    backupError.textContent = '';
    const file = backupImportFile.files?.[0];
    if (!file) {
      backupError.textContent = '가져올 파일을 선택하세요.';
      return;
    }
    file
      .text()
      .then((text) => {
        const data = JSON.parse(text) as ContentExportDto;
        return importContent(token, { items: data.items, mobTemplates: data.mobTemplates, mobLootPool: data.mobLootPool });
      })
      .then((result) => {
        backupResult.textContent = `${result.itemCount}개 아이템, ${result.mobTemplateCount}개 몹, ${result.lootEntryCount}개 드랍 항목을 가져왔습니다.`;
        backupImportFile.value = '';
        return Promise.all([refreshItems(), refreshMobs()]);
      })
      .catch((error: unknown) => {
        backupError.textContent = error instanceof Error ? error.message : '가져오기 파일을 처리하지 못했습니다.';
      });
  });

  npcCreateBtn.addEventListener('click', () => {
    const name = container.querySelector<HTMLInputElement>('#admin-npc-name')!.value.trim();
    const description = container.querySelector<HTMLInputElement>('#admin-npc-desc')!.value.trim();
    npcError.textContent = '';
    if (!name || !description) {
      npcError.textContent = '이름과 설명을 입력하세요.';
      return;
    }
    const data = {
      name,
      description,
      type: container.querySelector<HTMLSelectElement>('#admin-npc-type')!.value as NpcType,
      level: Number(container.querySelector<HTMLInputElement>('#admin-npc-level')!.value),
      dealType: container.querySelector<HTMLSelectElement>('#admin-npc-deal-type')!.value as NpcDealType,
    };
    const request = editingNpcId ? updateNpcTemplate(token, editingNpcId, data) : createNpcTemplate(token, data);
    request
      .then(() => {
        resetNpcForm();
        return refreshNpcs();
      })
      .catch((error: unknown) => {
        npcError.textContent = error instanceof Error ? error.message : 'NPC 저장에 실패했습니다.';
      });
  });

  npcCancelBtn.addEventListener('click', () => resetNpcForm());

  container.querySelector<HTMLButtonElement>('#admin-back')!.addEventListener('click', onBack);

  const adminMainTabButtons = container.querySelectorAll<HTMLButtonElement>('.admin-main-tab-btn');
  const adminTabPanels = container.querySelectorAll<HTMLElement>('[data-admin-tab-panel]');

  function selectAdminTab(tab: string): void {
    adminMainTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.adminTab === tab));
    adminTabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.adminTabPanel !== tab;
    });
  }

  adminMainTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectAdminTab(btn.dataset.adminTab!));
  });

  selectAdminTab('accounts');

  void (async () => {
    await refreshRooms();
    await refreshItems();
    await Promise.all([refreshAccounts(), refreshSessions(), refreshMobs(), refreshNpcs()]);
  })().catch((error: unknown) => {
    accountsError.textContent = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.';
  });
}
