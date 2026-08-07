import { ELEMENT_LABELS, ELEMENT_VALUES, type ElementType } from '@mud/shared';
import {
  createItemTemplate,
  createMobTemplate,
  fetchAccounts,
  fetchAdminRooms,
  fetchItemTemplates,
  fetchMobTemplates,
  fetchSessions,
  moderationKick,
  moderationMove,
  sendAnnouncement,
  updateAccount,
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
          <ul class="admin-list" id="admin-item-templates"></ul>
          <div class="admin-form-row">
            <input id="admin-item-name" placeholder="이름" maxlength="30" />
            <input id="admin-item-desc" placeholder="설명" maxlength="200" />
            <select id="admin-item-type">
              <option value="weapon">무기</option>
              <option value="armor">방어구</option>
              <option value="consumable">소모품</option>
            </select>
          </div>
          <div class="admin-form-row">
            <input id="admin-item-str" type="number" placeholder="힘" value="0" />
            <input id="admin-item-dex" type="number" placeholder="민첩" value="0" />
            <input id="admin-item-pdef" type="number" placeholder="물리방어" value="0" />
            <input id="admin-item-mdef" type="number" placeholder="마법방어" value="0" />
            <input id="admin-item-heal" type="number" placeholder="회복량" value="0" min="0" />
            <input id="admin-item-value" type="number" placeholder="가치" value="0" min="0" />
            <button type="button" id="admin-item-create">아이템 생성</button>
          </div>
          <p class="admin-error" id="admin-item-error"></p>
          <p class="admin-panel-empty">아이템 배치는 맵 빌더에서 할 수 있습니다.</p>
        </section>

        <section class="admin-section">
          <h3>몹</h3>
          <ul class="admin-list" id="admin-mob-templates"></ul>
          <div class="admin-form-row">
            <input id="admin-mob-name" placeholder="이름" maxlength="30" />
            <input id="admin-mob-hp" type="number" placeholder="HP" value="10" min="1" />
            <select id="admin-mob-element"></select>
            <select id="admin-mob-damage-type">
              <option value="physical">물리</option>
              <option value="magic">마법</option>
            </select>
          </div>
          <div class="admin-form-row">
            <input id="admin-mob-str" type="number" placeholder="힘" value="1" min="0" />
            <input id="admin-mob-dex" type="number" placeholder="민첩" value="1" min="0" />
            <input id="admin-mob-pdef" type="number" placeholder="물리방어" value="0" min="0" />
            <input id="admin-mob-mdef" type="number" placeholder="마법방어" value="0" min="0" />
            <input id="admin-mob-exp" type="number" placeholder="경험치" value="5" min="0" />
            <input id="admin-mob-gold" type="number" placeholder="골드" value="1" min="0" />
            <button type="button" id="admin-mob-create">몬스터 생성</button>
          </div>
          <p class="admin-error" id="admin-mob-error"></p>
          <p class="admin-panel-empty">몬스터 배치는 맵 빌더에서 할 수 있습니다.</p>
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

  const itemTemplatesList = container.querySelector<HTMLUListElement>('#admin-item-templates')!;
  const itemError = container.querySelector<HTMLParagraphElement>('#admin-item-error')!;

  const mobTemplatesList = container.querySelector<HTMLUListElement>('#admin-mob-templates')!;
  const mobError = container.querySelector<HTMLParagraphElement>('#admin-mob-error')!;
  const mobElementSelect = container.querySelector<HTMLSelectElement>('#admin-mob-element')!;

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

  async function refreshItems(): Promise<void> {
    const { items } = await fetchItemTemplates(token);

    itemTemplatesList.innerHTML =
      items
        .map(
          (item) =>
            `<li>${escapeHtml(item.name)} (${ITEM_TYPE_LABELS[item.type] ?? item.type}, 가치 ${item.value})</li>`,
        )
        .join('') || '<li class="admin-panel-empty">없음</li>';
  }

  async function refreshMobs(): Promise<void> {
    const { mobTemplates } = await fetchMobTemplates(token);

    mobTemplatesList.innerHTML =
      mobTemplates
        .map(
          (mob) =>
            `<li>${escapeHtml(mob.name)} (HP ${mob.hp}, ${ELEMENT_LABELS[mob.element]}, ${DAMAGE_TYPE_LABELS[mob.damageType]})</li>`,
        )
        .join('') || '<li class="admin-panel-empty">없음</li>';
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
    itemError.textContent = '';
    if (!name || !description) {
      itemError.textContent = '이름과 설명을 입력하세요.';
      return;
    }
    createItemTemplate(token, {
      name,
      description,
      type,
      strengthBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-str')!.value),
      dexterityBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-dex')!.value),
      physicalDefenseBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-pdef')!.value),
      magicDefenseBonus: Number(container.querySelector<HTMLInputElement>('#admin-item-mdef')!.value),
      healAmount: Number(container.querySelector<HTMLInputElement>('#admin-item-heal')!.value),
      value: Number(container.querySelector<HTMLInputElement>('#admin-item-value')!.value),
    })
      .then(() => refreshItems())
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
      name,
      hp: Number(container.querySelector<HTMLInputElement>('#admin-mob-hp')!.value),
      strength: Number(container.querySelector<HTMLInputElement>('#admin-mob-str')!.value),
      dexterity: Number(container.querySelector<HTMLInputElement>('#admin-mob-dex')!.value),
      physicalDefense: Number(container.querySelector<HTMLInputElement>('#admin-mob-pdef')!.value),
      magicDefense: Number(container.querySelector<HTMLInputElement>('#admin-mob-mdef')!.value),
      element: mobElementSelect.value as ElementType,
      damageType: container.querySelector<HTMLSelectElement>('#admin-mob-damage-type')!.value as 'physical' | 'magic',
      expReward: Number(container.querySelector<HTMLInputElement>('#admin-mob-exp')!.value),
      goldReward: Number(container.querySelector<HTMLInputElement>('#admin-mob-gold')!.value),
    })
      .then(() => refreshMobs())
      .catch((error: unknown) => {
        mobError.textContent = error instanceof Error ? error.message : '몬스터 생성에 실패했습니다.';
      });
  });

  container.querySelector<HTMLButtonElement>('#admin-back')!.addEventListener('click', onBack);

  void (async () => {
    await refreshRooms();
    await Promise.all([refreshAccounts(), refreshSessions(), refreshItems(), refreshMobs()]);
  })().catch((error: unknown) => {
    accountsError.textContent = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.';
  });
}
