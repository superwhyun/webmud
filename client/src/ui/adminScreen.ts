import {
  ELEMENT_LABELS,
  ELEMENT_VALUES,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  ITEM_GRADE_LABELS,
  ITEM_GRADE_VALUES,
  type ElementType,
  type ItemGrade,
} from '@mud/shared';
import {
  addMobLootPoolItem,
  createItemTemplate,
  createMobTemplate,
  fetchAccounts,
  fetchAdminRooms,
  fetchItemTemplates,
  fetchMobLootPool,
  fetchMobTemplates,
  fetchSessions,
  moderationKick,
  moderationMove,
  removeMobLootPoolItem,
  sendAnnouncement,
  updateAccount,
  type ItemTemplateDto,
  type MobTemplateDto,
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
      <div class="admin-body">
        <section class="admin-section">
          <h3>유저 권한 관리</h3>
          <table class="admin-table">
            <thead><tr><th>아이디</th><th>빌더</th><th>어드민</th></tr></thead>
            <tbody id="admin-accounts-body"></tbody>
          </table>
          <p class="admin-error" id="admin-accounts-error"></p>
        </section>

        <section class="admin-section">
          <h3>온라인 유저</h3>
          <div id="admin-sessions-list"></div>
          <p class="admin-error" id="admin-sessions-error"></p>
        </section>

        <section class="admin-section">
          <h3>공지 보내기</h3>
          <div class="admin-form-row">
            <input id="admin-announce-input" type="text" maxlength="500" placeholder="공지 내용" />
            <button type="button" id="admin-announce-send">보내기</button>
          </div>
          <p class="admin-error" id="admin-announce-error"></p>
        </section>

        <section class="admin-section">
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
              <label for="admin-item-value">판매 가치</label>
              <input id="admin-item-value" type="number" placeholder="가치" value="0" min="0" />
            </div>
            <button type="button" id="admin-item-create">아이템 생성</button>
          </div>
          <p class="admin-error" id="admin-item-error"></p>
          <p class="admin-panel-empty">아이템 배치는 맵 빌더에서 할 수 있습니다.</p>
        </section>

        <section class="admin-section">
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
          </div>
          <p class="admin-error" id="admin-mob-error"></p>
          <p class="admin-panel-empty">몬스터 배치는 맵 빌더에서 할 수 있습니다.</p>

          <h4>보유 가능 아이템 (죽었을 때 드랍)</h4>
          <div class="admin-form-row">
            <select id="admin-mob-loot-select" title="아이템 풀을 설정할 몬스터를 선택하세요."></select>
          </div>
          <ul class="admin-list" id="admin-mob-loot-items"></ul>
          <p class="admin-panel-empty">
            체크한 아이템 중 몹이 무작위로 최대 2개를 들고 스폰되며, 처치되면 그 아이템을 떨어뜨립니다. 등급이 높을수록 보유 확률이 낮습니다.
          </p>
          <p class="admin-error" id="admin-mob-loot-error"></p>
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
  let itemTemplates: ItemTemplateDto[] = [];
  let selectedItemGrade: ItemGrade = ITEM_GRADE_VALUES[0];

  const mobTemplatesList = container.querySelector<HTMLUListElement>('#admin-mob-templates')!;
  const mobError = container.querySelector<HTMLParagraphElement>('#admin-mob-error')!;
  const mobElementSelect = container.querySelector<HTMLSelectElement>('#admin-mob-element')!;
  const mobLootSelect = container.querySelector<HTMLSelectElement>('#admin-mob-loot-select')!;
  const mobLootItemsList = container.querySelector<HTMLUListElement>('#admin-mob-loot-items')!;
  const mobLootError = container.querySelector<HTMLParagraphElement>('#admin-mob-loot-error')!;

  let mobTemplates: MobTemplateDto[] = [];

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

  function renderItemList(): void {
    const items = itemTemplates.filter((item) => item.grade === selectedItemGrade);

    itemTemplatesList.innerHTML =
      items
        .map(
          (item) =>
            `<li><span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> (${ITEM_TYPE_LABELS[item.type] ?? item.type}${item.slot ? `, ${EQUIPMENT_SLOT_LABELS[item.slot]}` : ''}, Lv.${item.level}, ${ITEM_GRADE_LABELS[item.grade]}, 가치 ${item.value})</li>`,
        )
        .join('') || '<li class="admin-panel-empty">이 등급의 아이템이 없습니다.</li>';
  }

  async function refreshItems(): Promise<void> {
    const { items } = await fetchItemTemplates(token);
    itemTemplates = items;
    renderItemGradeTabs();
    renderItemList();
  }

  async function refreshMobs(): Promise<void> {
    const previousLootSelection = mobLootSelect.value;
    const { mobTemplates: fetched } = await fetchMobTemplates(token);
    mobTemplates = fetched;

    mobTemplatesList.innerHTML =
      mobTemplates
        .map(
          (mob) =>
            `<li>${escapeHtml(mob.name)} (Lv.${mob.level}, HP ${mob.hp}, ${ELEMENT_LABELS[mob.element]}, ${DAMAGE_TYPE_LABELS[mob.damageType]}${mob.hostile ? '' : ', 비전투'})</li>`,
        )
        .join('') || '<li class="admin-panel-empty">없음</li>';

    mobLootSelect.innerHTML =
      mobTemplates.map((mob) => `<option value="${mob.id}">${escapeHtml(mob.name)}</option>`).join('') ||
      '<option value="">몬스터 없음</option>';

    if (mobTemplates.some((mob) => String(mob.id) === previousLootSelection)) {
      mobLootSelect.value = previousLootSelection;
    }

    await refreshMobLootPool();
  }

  async function refreshMobLootPool(): Promise<void> {
    mobLootError.textContent = '';
    const mobTemplateId = Number(mobLootSelect.value);
    if (!mobTemplateId) {
      mobLootItemsList.innerHTML = '<li class="admin-panel-empty">몬스터를 먼저 생성하세요.</li>';
      return;
    }

    const { items: poolItems } = await fetchMobLootPool(token, mobTemplateId);
    const poolItemIds = new Set(poolItems.map((item) => item.id));

    mobLootItemsList.innerHTML =
      itemTemplates
        .map(
          (item) => `
            <li>
              <label class="admin-checkbox-label">
                <input type="checkbox" class="admin-mob-loot-toggle" data-item-id="${item.id}" ${poolItemIds.has(item.id) ? 'checked' : ''} />
                <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> (${ITEM_GRADE_LABELS[item.grade]})
              </label>
            </li>
          `,
        )
        .join('') || '<li class="admin-panel-empty">생성된 아이템이 없습니다.</li>';

    mobLootItemsList.querySelectorAll<HTMLInputElement>('.admin-mob-loot-toggle').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const itemId = Number(checkbox.dataset.itemId);
        const action = checkbox.checked
          ? addMobLootPoolItem(token, mobTemplateId, itemId)
          : removeMobLootPoolItem(token, mobTemplateId, itemId);
        action.catch((error: unknown) => {
          mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀 변경에 실패했습니다.';
          checkbox.checked = !checkbox.checked;
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

  container.querySelector<HTMLButtonElement>('#admin-item-create')!.addEventListener('click', () => {
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
    createItemTemplate(token, {
      name,
      description,
      type,
      slot: slot ? (slot as ItemTemplateDto['slot']) : null,
      level,
      grade,
      strengthBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-str')!.value),
      dexterityBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-dex')!.value),
      physicalDefenseBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value),
      magicDefenseBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value),
      healAmount: Number(container.querySelector<HTMLInputElement>('#admin-item-heal')!.value),
      value: Number(container.querySelector<HTMLInputElement>('#admin-item-value')!.value),
    })
      .then(() => {
        selectedItemGrade = grade;
        return refreshItems();
      })
      .catch((error: unknown) => {
        itemError.textContent = error instanceof Error ? error.message : '아이템 생성에 실패했습니다.';
      });
  });

  container.querySelector<HTMLButtonElement>('#admin-mob-create')!.addEventListener('click', () => {
    const name = container.querySelector<HTMLInputElement>('#admin-mob-name')!.value.trim();
    mobError.textContent = '';
    if (!name) {
      mobError.textContent = '이름을 입력하세요.';
      return;
    }
    createMobTemplate(token, {
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
    })
      .then(() => refreshMobs())
      .catch((error: unknown) => {
        mobError.textContent = error instanceof Error ? error.message : '몬스터 생성에 실패했습니다.';
      });
  });

  mobLootSelect.addEventListener('change', () => {
    refreshMobLootPool().catch((error: unknown) => {
      mobLootError.textContent = error instanceof Error ? error.message : '아이템 풀을 불러오지 못했습니다.';
    });
  });

  container.querySelector<HTMLButtonElement>('#admin-back')!.addEventListener('click', onBack);

  void (async () => {
    await refreshRooms();
    await refreshItems();
    await Promise.all([refreshAccounts(), refreshSessions(), refreshMobs()]);
  })().catch((error: unknown) => {
    accountsError.textContent = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.';
  });
}
