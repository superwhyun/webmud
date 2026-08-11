import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, ITEM_GRADE_LABELS, ITEM_GRADE_VALUES, NPC_DEAL_TYPE_LABELS, NPC_DEAL_TYPE_VALUES, NPC_TYPE_LABELS, NPC_TYPE_VALUES, type ItemGrade } from '@mud/shared';
import type { ItemTemplateDto, MobTemplateDto, NpcTemplateDto, RoomOptionDto } from '../../adminApi';

export const ITEM_TYPE_LABELS: Record<string, string> = {
  weapon: '무기',
  armor: '방어구',
  consumable: '소모품',
};

export const DAMAGE_TYPE_LABELS: Record<'physical' | 'magic', string> = {
  physical: '물리',
  magic: '마법',
};

export interface AdminContext {
  container: HTMLElement;
  token: string;
  onBack: () => void;

  accountsBody: HTMLTableSectionElement;
  accountsError: HTMLParagraphElement;
  sessionsList: HTMLDivElement;
  sessionsError: HTMLParagraphElement;
  announceInput: HTMLInputElement;
  announceError: HTMLParagraphElement;

  itemGradeTabs: HTMLDivElement;
  itemTemplatesList: HTMLUListElement;
  itemError: HTMLParagraphElement;
  itemCreateBtn: HTMLButtonElement;
  itemCancelBtn: HTMLButtonElement;
  itemTemplates: ItemTemplateDto[];
  selectedItemGrade: ItemGrade;
  editingItemId: number | null;

  mobTemplatesList: HTMLTableSectionElement;
  mobError: HTMLParagraphElement;
  mobElementSelect: HTMLSelectElement;
  mobMaxLevelInput: HTMLInputElement;
  mobLootItemsList: HTMLUListElement;
  mobLootError: HTMLParagraphElement;
  mobCreateBtn: HTMLButtonElement;
  mobCancelBtn: HTMLButtonElement;
  mobFormSlot: HTMLDivElement;
  mobFormContainer: HTMLDivElement;
  mobTemplates: MobTemplateDto[];
  editingMobId: number | null;
  /** 아직 생성되지 않은 신규 몬스터에 임시로 체크해둔 보유 가능 아이템(itemId -> weight). 생성 성공 후 실제로 반영한다. */
  pendingLootWeights: Map<number, number>;

  npcTemplatesList: HTMLUListElement;
  npcError: HTMLParagraphElement;
  npcCreateBtn: HTMLButtonElement;
  npcCancelBtn: HTMLButtonElement;
  npcTemplates: NpcTemplateDto[];
  editingNpcId: number | null;

  backupExportBtn: HTMLButtonElement;
  backupImportBtn: HTMLButtonElement;
  backupImportFile: HTMLInputElement;
  backupResult: HTMLParagraphElement;
  backupError: HTMLParagraphElement;

  rooms: RoomOptionDto[];
}

function renderShellHtml(): string {
  return `
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
            <thead><tr><th>아이디</th><th>빌더</th><th>어드민</th><th>골드</th><th>위치</th><th></th></tr></thead>
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
          <table class="admin-table admin-mob-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>레벨</th>
                <th>HP</th>
                <th>속성</th>
                <th>공격</th>
                <th>보유 아이템</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="admin-mob-templates"></tbody>
          </table>
          <div id="admin-mob-form-slot"></div>
          <div id="admin-mob-form-container">
          <p class="admin-panel-empty">
            각 스탯을 최소 레벨일 때 값 / 최대 레벨일 때 값으로 입력하면, 이 몹이 스폰될 때마다 그 사이에서 레벨과
            스탯이 무작위로 정해집니다(선형 보간). 범위 없이 항상 같은 값으로 스폰하려면 최소=최대로 입력하세요.
          </p>
          <div class="admin-form-row">
            <input id="admin-mob-name" placeholder="이름" maxlength="30" title="몬스터 이름" />
            <select id="admin-mob-element" title="속성. 오행 상성(목→토→수→화→금→목 순으로 상극)에 따라 전투 시 데미지 배율이 달라집니다."></select>
            <select id="admin-mob-damage-type" title="공격 시 물리방어/마법방어 중 어느 방어력으로 피해를 계산할지 결정합니다.">
              <option value="physical">물리</option>
              <option value="magic">마법</option>
            </select>
            <label class="admin-checkbox-label" title="켜두면 상성 우위를 가진 플레이어가 방에 들어올 때 이 몹이 자동으로 공격합니다. 끄면 상점 주인처럼 절대 먼저 공격하지 않는 비전투 NPC로 동작합니다.">
              <input id="admin-mob-hostile" type="checkbox" checked />
              적대적(자동 공격)
            </label>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-mob-min-level">최소 레벨</label>
              <input id="admin-mob-min-level" type="number" value="1" min="1" title="이 몹이 가질 수 있는 최소 레벨." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-max-level">최대 레벨</label>
              <input id="admin-mob-max-level" type="number" value="1" min="1" title="이 몹이 가질 수 있는 최대 레벨." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-hp">HP (최소)</label>
              <input id="admin-mob-hp" type="number" value="10" min="1" title="최소 레벨일 때 최대 체력." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-hp-max">HP (최대)</label>
              <input id="admin-mob-hp-max" type="number" value="10" min="1" title="최대 레벨일 때 최대 체력." />
            </div>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-mob-str">힘 (최소)</label>
              <input id="admin-mob-str" type="number" value="1" min="0" title="최소 레벨일 때 힘(물리 공격력 기준치)." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-str-max">힘 (최대)</label>
              <input id="admin-mob-str-max" type="number" value="1" min="0" title="최대 레벨일 때 힘." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-dex">민첩 (최소)</label>
              <input id="admin-mob-dex" type="number" value="1" min="0" title="최소 레벨일 때 민첩(명중률/회피율)." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-dex-max">민첩 (최대)</label>
              <input id="admin-mob-dex-max" type="number" value="1" min="0" title="최대 레벨일 때 민첩." />
            </div>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-mob-pdef">물리방어 (최소)</label>
              <input id="admin-mob-pdef" type="number" value="0" min="0" title="최소 레벨일 때 물리방어." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-pdef-max">물리방어 (최대)</label>
              <input id="admin-mob-pdef-max" type="number" value="0" min="0" title="최대 레벨일 때 물리방어." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-mdef">마법방어 (최소)</label>
              <input id="admin-mob-mdef" type="number" value="0" min="0" title="최소 레벨일 때 마법방어." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-mdef-max">마법방어 (최대)</label>
              <input id="admin-mob-mdef-max" type="number" value="0" min="0" title="최대 레벨일 때 마법방어." />
            </div>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="admin-mob-exp">경험치 (최소)</label>
              <input id="admin-mob-exp" type="number" value="5" min="0" title="최소 레벨일 때 처치 경험치." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-exp-max">경험치 (최대)</label>
              <input id="admin-mob-exp-max" type="number" value="5" min="0" title="최대 레벨일 때 처치 경험치." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-gold">골드 (최소)</label>
              <input id="admin-mob-gold" type="number" value="1" min="0" title="최소 레벨일 때 처치 골드." />
            </div>
            <div class="admin-field">
              <label for="admin-mob-gold-max">골드 (최대)</label>
              <input id="admin-mob-gold-max" type="number" value="1" min="0" title="최대 레벨일 때 처치 골드." />
            </div>
            <button type="button" id="admin-mob-create">몬스터 생성</button>
            <button type="button" id="admin-mob-cancel" hidden>취소</button>
          </div>
          <p class="admin-error" id="admin-mob-error"></p>

          <h4>보유 가능 아이템 (죽었을 때 드랍)</h4>
          <ul class="admin-list admin-loot-items" id="admin-mob-loot-items"></ul>
          <p class="admin-panel-empty">
            체크한 아이템 중 몹이 무작위로 최대 2개를 들고 스폰되며, 처치되면 그 아이템을 떨어뜨립니다. 등급이 높을수록 보유 확률이 낮습니다.
            현재 최대 레벨 입력값 기준으로 걸 수 있는 아이템만 표시됩니다.
          </p>
          <p class="admin-error" id="admin-mob-loot-error"></p>
          </div>
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
              <label for="admin-npc-deal-type">취급 품목</label>
              <select id="admin-npc-deal-type" title="상인일 경우 이 종류의 아이템만 사고팝니다.">
                ${NPC_DEAL_TYPE_VALUES.map((type) => `<option value="${type}">${NPC_DEAL_TYPE_LABELS[type]}</option>`).join('')}
              </select>
            </div>
            <button type="button" id="admin-npc-create">NPC 생성</button>
            <button type="button" id="admin-npc-cancel" hidden>취소</button>
          </div>
          <p class="admin-error" id="admin-npc-error"></p>
          <p class="admin-panel-empty">
            NPC 배치는 맵 빌더에서 할 수 있습니다. 상인 종류만 실제로 거래(buy/sell) 기능이 동작합니다.
            NPC의 레벨은 별도로 지정하지 않으며, 배치된 방이 속한 존의 최대 레벨을 그대로 따릅니다.
          </p>
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
}

export function createAdminContext(container: HTMLElement, token: string, onBack: () => void): AdminContext {
  container.innerHTML = renderShellHtml();

  const mobElementSelect = container.querySelector<HTMLSelectElement>('#admin-mob-element')!;

  return {
    container,
    token,
    onBack,

    accountsBody: container.querySelector<HTMLTableSectionElement>('#admin-accounts-body')!,
    accountsError: container.querySelector<HTMLParagraphElement>('#admin-accounts-error')!,
    sessionsList: container.querySelector<HTMLDivElement>('#admin-sessions-list')!,
    sessionsError: container.querySelector<HTMLParagraphElement>('#admin-sessions-error')!,
    announceInput: container.querySelector<HTMLInputElement>('#admin-announce-input')!,
    announceError: container.querySelector<HTMLParagraphElement>('#admin-announce-error')!,

    itemGradeTabs: container.querySelector<HTMLDivElement>('#admin-item-grade-tabs')!,
    itemTemplatesList: container.querySelector<HTMLUListElement>('#admin-item-templates')!,
    itemError: container.querySelector<HTMLParagraphElement>('#admin-item-error')!,
    itemCreateBtn: container.querySelector<HTMLButtonElement>('#admin-item-create')!,
    itemCancelBtn: container.querySelector<HTMLButtonElement>('#admin-item-cancel')!,
    itemTemplates: [],
    selectedItemGrade: ITEM_GRADE_VALUES[0],
    editingItemId: null,

    mobTemplatesList: container.querySelector<HTMLTableSectionElement>('#admin-mob-templates')!,
    mobError: container.querySelector<HTMLParagraphElement>('#admin-mob-error')!,
    mobElementSelect,
    mobMaxLevelInput: container.querySelector<HTMLInputElement>('#admin-mob-max-level')!,
    mobLootItemsList: container.querySelector<HTMLUListElement>('#admin-mob-loot-items')!,
    mobLootError: container.querySelector<HTMLParagraphElement>('#admin-mob-loot-error')!,
    mobCreateBtn: container.querySelector<HTMLButtonElement>('#admin-mob-create')!,
    mobCancelBtn: container.querySelector<HTMLButtonElement>('#admin-mob-cancel')!,
    mobFormSlot: container.querySelector<HTMLDivElement>('#admin-mob-form-slot')!,
    mobFormContainer: container.querySelector<HTMLDivElement>('#admin-mob-form-container')!,
    mobTemplates: [],
    editingMobId: null,
    pendingLootWeights: new Map(),

    npcTemplatesList: container.querySelector<HTMLUListElement>('#admin-npc-templates')!,
    npcError: container.querySelector<HTMLParagraphElement>('#admin-npc-error')!,
    npcCreateBtn: container.querySelector<HTMLButtonElement>('#admin-npc-create')!,
    npcCancelBtn: container.querySelector<HTMLButtonElement>('#admin-npc-cancel')!,
    npcTemplates: [],
    editingNpcId: null,

    backupExportBtn: container.querySelector<HTMLButtonElement>('#admin-backup-export')!,
    backupImportBtn: container.querySelector<HTMLButtonElement>('#admin-backup-import')!,
    backupImportFile: container.querySelector<HTMLInputElement>('#admin-backup-import-file')!,
    backupResult: container.querySelector<HTMLParagraphElement>('#admin-backup-result')!,
    backupError: container.querySelector<HTMLParagraphElement>('#admin-backup-error')!,

    rooms: [],
  };
}
