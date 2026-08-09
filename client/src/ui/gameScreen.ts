import {
  ELEMENT_LABELS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  ITEM_MENTION_PATTERN,
  JOB_DESCRIPTIONS,
  JOB_LABELS,
  JOB_VALUES,
  MAX_INVENTORY_SLOTS,
  NPC_TYPE_LABELS,
  SKILLS,
  SKILLS_BY_JOB,
  type CharacterState,
  type ClientMessage,
  type CombatMobInfo,
  type EquipmentSlot,
  type EquipmentSnapshot,
  type InventoryItemInfo,
  type RoomSnapshot,
  type ServerMessage,
  type VillageInfo,
} from '@mud/shared';
import { renderAdminScreen } from './adminScreen';
import { renderBuilderScreen } from './builderScreen';
import { escapeHtml } from '../domUtils';
import { loadMacros, saveMacro, MACRO_SLOTS, type MacroMap, type MacroSlot } from '../macros';

// WASD 배치: w=북, a=서, s=남, d=동. e는 enter(포털) 단축 verb라 방향에 없음.
const CARDINAL_ALIASES: Record<string, 'north' | 'south' | 'east' | 'west'> = {
  north: 'north',
  w: 'north',
  south: 'south',
  s: 'south',
  east: 'east',
  d: 'east',
  west: 'west',
  a: 'west',
};

const CARDINAL_OFFSET: Record<'north' | 'south' | 'east' | 'west', { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

const MINIMAP_COL_RADIUS = 2; // 5 columns wide
const MINIMAP_ROW_START = -4;
const MINIMAP_ROW_END = 5; // 10 rows tall

const COMMAND_VERBS = [
  'look',
  'l',
  'help',
  'say',
  'shout',
  'who',
  'attack',
  'flee',
  'get',
  'drop',
  'inventory',
  'inv',
  'equip',
  'use',
  'village',
  'travel',
  'leave',
  'enter',
  'e',
  'raid',
  'stat',
  'skill',
  'cast',
  '마법',
  'shop',
  'buy',
  'sell',
  'north',
  'south',
  'east',
  'west',
  'w',
  'a',
  's',
  'd',
  'up',
  'down',
  'u',
];

/** 게임 화면을 벗어났다 돌아올 때마다 새로 등록되는 걸 막기 위해, 이전에 등록한 핸들러를 기억해뒀다가 떼어낸다. */
let activeCommandFocusHandler: ((event: KeyboardEvent) => void) | null = null;

const STAT_ALLOC_ENTRIES: { key: string; label: string; pick: (c: CharacterState) => number }[] = [
  { key: 'str', label: '힘', pick: (c) => c.strength },
  { key: 'dex', label: '민첩', pick: (c) => c.dexterity },
  { key: 'int', label: '지능', pick: (c) => c.intelligence },
  { key: 'vit', label: '체력', pick: (c) => c.vitality },
  { key: 'wis', label: '지혜', pick: (c) => c.wisdom },
  { key: 'luk', label: '행운', pick: (c) => c.luck },
];

export function renderGameScreen(
  container: HTMLElement,
  token: string,
  isBuilder = false,
  isAdmin = false,
  onLogout: () => void = () => {},
): void {
  container.innerHTML = `
    <div class="room-panel" id="room-panel"></div>
    <div class="command-input">
      <span class="prompt">&gt;</span>
      <input id="command" type="text" autocomplete="off" autofocus aria-label="명령어 입력" />
    </div>
    <div class="combat-panel" id="combat-panel" hidden></div>
    <div class="game-layout">
      <div class="terminal" id="terminal"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-stats" id="sidebar-stats"></div>
        <div class="equipment-panel" id="equipment-panel"></div>
        <div class="cooldown-panel" id="cooldown-panel"></div>
        <button type="button" id="equip-swap-button" class="equip-swap-btn">장비 교체</button>
        <button type="button" id="skill-button" class="skill-btn">스킬</button>
        <button type="button" id="macro-button" class="skill-btn">매크로</button>
        <button type="button" id="logout-button" class="logout-btn">로그아웃</button>
      </aside>
      ${
        isBuilder || isAdmin
          ? `
      <aside class="ops-menu" id="ops-menu">
        ${
          isBuilder
            ? `<div class="ops-menu-section">
                <div class="ops-menu-title">🛠 빌더 메뉴</div>
                <button type="button" id="builder-entry" class="builder-entry-btn">맵 편집기 열기</button>
              </div>`
            : ''
        }
        ${
          isAdmin
            ? `<div class="ops-menu-section">
                <div class="ops-menu-title">⚙ 어드민 메뉴</div>
                <button type="button" id="admin-entry" class="admin-entry-btn">관리자 패널 열기</button>
              </div>`
            : ''
        }
      </aside>`
          : ''
      }
      <aside class="map-panel" id="map-panel">
        <div class="map-panel-title">지도</div>
        <div class="minimap" id="minimap"></div>
        <div class="map-panel-title">인벤토리 (<span id="inventory-count">0</span>/${MAX_INVENTORY_SLOTS})</div>
        <div class="inventory-panel-list" id="inventory-panel-list"></div>
      </aside>
    </div>
    <div class="modal-overlay" id="equip-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>장비 교체</span>
          <button type="button" id="equip-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="equip-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="job-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>직업 선택</span>
        </div>
        <div class="modal-body" id="job-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="skill-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>스킬</span>
          <button type="button" id="skill-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="skill-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="macro-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>매크로</span>
          <button type="button" id="macro-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="macro-modal-body"></div>
      </div>
    </div>
  `;

  const roomPanel = container.querySelector<HTMLDivElement>('#room-panel')!;
  const combatPanel = container.querySelector<HTMLDivElement>('#combat-panel')!;
  const terminal = container.querySelector<HTMLDivElement>('#terminal')!;
  const sidebarStats = container.querySelector<HTMLDivElement>('#sidebar-stats')!;
  const equipmentPanel = container.querySelector<HTMLDivElement>('#equipment-panel')!;
  const cooldownPanel = container.querySelector<HTMLDivElement>('#cooldown-panel')!;
  const minimap = container.querySelector<HTMLDivElement>('#minimap')!;
  const inventoryPanelList = container.querySelector<HTMLDivElement>('#inventory-panel-list')!;
  const inventoryCountLabel = container.querySelector<HTMLSpanElement>('#inventory-count')!;
  const commandInput = container.querySelector<HTMLInputElement>('#command')!;
  const equipModal = container.querySelector<HTMLDivElement>('#equip-modal')!;
  const equipModalBody = container.querySelector<HTMLDivElement>('#equip-modal-body')!;
  const jobModal = container.querySelector<HTMLDivElement>('#job-modal')!;
  const jobModalBody = container.querySelector<HTMLDivElement>('#job-modal-body')!;
  const skillModal = container.querySelector<HTMLDivElement>('#skill-modal')!;
  const skillModalBody = container.querySelector<HTMLDivElement>('#skill-modal-body')!;
  const macroModal = container.querySelector<HTMLDivElement>('#macro-modal')!;
  const macroModalBody = container.querySelector<HTMLDivElement>('#macro-modal-body')!;

  function appendItemMentions(target: HTMLElement, text: string): void {
    ITEM_MENTION_PATTERN.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ITEM_MENTION_PATTERN.exec(text))) {
      if (match.index > lastIndex) {
        target.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const [, grade, name] = match;
      const span = document.createElement('span');
      span.className = `item-grade-${grade}`;
      span.textContent = name;
      target.appendChild(span);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      target.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function appendLine(text: string, channel?: string): void {
    const line = document.createElement('div');
    line.className = `line line-${channel ?? 'system'}`;
    appendItemMentions(line, text);
    terminal.prepend(line);
    terminal.scrollTop = 0;
  }

  function hpLevel(ratio: number): 'normal' | 'warning' | 'danger' {
    if (ratio <= 0.25) return 'danger';
    if (ratio <= 0.5) return 'warning';
    return 'normal';
  }

  let currentCharacterState: CharacterState | undefined;
  let learnedSkillIds: string[] = [];
  let latestCombatMobs: CombatMobInfo[] = [];

  interface ActiveCooldown {
    name: string;
    endsAt: number;
    totalMs: number;
  }
  const activeCooldowns = new Map<string, ActiveCooldown>();

  function renderCooldownPanel(): void {
    const now = Date.now();
    for (const [skillId, cooldown] of activeCooldowns) {
      if (cooldown.endsAt <= now) activeCooldowns.delete(skillId);
    }
    if (activeCooldowns.size === 0) {
      cooldownPanel.innerHTML = '';
      return;
    }
    cooldownPanel.innerHTML = [...activeCooldowns.entries()]
      .map(([skillId, cooldown]) => {
        const remainingMs = Math.max(0, cooldown.endsAt - now);
        const ratio = cooldown.totalMs > 0 ? remainingMs / cooldown.totalMs : 0;
        return `
          <div class="cooldown-row" data-skill-id="${skillId}">
            <span class="cooldown-label">${escapeHtml(cooldown.name)} ${(remainingMs / 1000).toFixed(1)}초</span>
            <div class="cooldown-bar" role="progressbar" aria-valuenow="${remainingMs}" aria-valuemin="0" aria-valuemax="${cooldown.totalMs}">
              <div class="cooldown-bar-fill" style="width: ${Math.max(0, ratio * 100)}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }
  setInterval(renderCooldownPanel, 100);

  function renderState(character: CharacterState): void {
    currentCharacterState = character;
    const hpRatio = character.maxHp > 0 ? character.hp / character.maxHp : 0;
    const mpRatio = character.maxMp > 0 ? character.mp / character.maxMp : 0;
    const level = hpLevel(hpRatio);
    const jobLabel = character.job ? JOB_LABELS[character.job] : '미정';
    const canAllocate = character.unallocatedStatPoints > 0;
    sidebarStats.innerHTML = `
      <div class="stat stat-name">${character.name}</div>
      <div class="stat">HP ${character.hp}/${character.maxHp}</div>
      <div class="hp-bar" role="progressbar" aria-valuenow="${character.hp}" aria-valuemin="0" aria-valuemax="${character.maxHp}">
        <div class="hp-bar-fill" data-level="${level}" style="width: ${Math.max(0, hpRatio * 100)}%"></div>
      </div>
      <div class="stat">MP ${character.mp}/${character.maxMp}</div>
      <div class="mp-bar" role="progressbar" aria-valuenow="${character.mp}" aria-valuemin="0" aria-valuemax="${character.maxMp}">
        <div class="mp-bar-fill" style="width: ${Math.max(0, mpRatio * 100)}%"></div>
      </div>
      <div class="stat">Lv.${character.level} ${jobLabel} (EXP ${character.exp}) · gold ${character.gold}</div>
      <div class="stat-grid">
        ${STAT_ALLOC_ENTRIES.map(
          (entry) => `
          <span class="stat-grid-entry">
            ${entry.label} ${entry.pick(character)}
            ${canAllocate ? `<button type="button" class="stat-alloc-btn" data-stat-key="${entry.key}">+</button>` : ''}
          </span>
        `,
        ).join('')}
        <span>공격력 ${character.attackPower}</span>
        <span>물리방어 ${character.physicalDefense}</span>
        <span>마법방어 ${character.magicDefense}</span>
      </div>
      ${canAllocate ? `<div class="stat stat-highlight">분배 가능 스탯 포인트: ${character.unallocatedStatPoints}</div>` : ''}
      ${character.unallocatedSkillPoints > 0 ? `<div class="stat stat-highlight">사용 가능 스킬 포인트: ${character.unallocatedSkillPoints}</div>` : ''}
      <div class="stat">속성 ${ELEMENT_LABELS[character.element]}</div>
      <div class="stat stat-room">${character.roomName}</div>
    `;

    sidebarStats.querySelectorAll<HTMLButtonElement>('.stat-alloc-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const message: ClientMessage = { type: 'command', text: `stat ${button.dataset.statKey} 1` };
        socket.send(JSON.stringify(message));
      });
    });

    if (!skillModal.hidden) renderSkillModal();
  }

  function renderSkillModal(): void {
    const character = currentCharacterState;
    const job = character?.job;
    if (!character || !job) {
      skillModalBody.innerHTML = '<p>아직 직업이 없어 스킬을 배울 수 없습니다.</p>';
      return;
    }
    const skills = SKILLS_BY_JOB[job];

    skillModalBody.innerHTML = `
      <p>사용 가능 스킬 포인트: ${character.unallocatedSkillPoints}</p>
      ${skills
        .map((skill) => {
          const learned = learnedSkillIds.includes(skill.id);
          const locked = character.level < skill.requiredLevel;
          const canLearn = !learned && !locked && character.unallocatedSkillPoints > 0;
          const status = learned ? '[습득]' : locked ? `[Lv.${skill.requiredLevel} 필요]` : '[습득 가능]';
          return `
            <div class="skill-row">
              <div class="skill-row-info">
                <span class="skill-row-name">${skill.name} <span class="skill-row-status">${status}</span></span>
                <span class="skill-row-desc">${skill.description} (MP ${skill.mpCost})</span>
              </div>
              ${canLearn ? `<button type="button" class="skill-learn-btn" data-skill-id="${skill.id}">배우기</button>` : ''}
            </div>
          `;
        })
        .join('')}
    `;

    skillModalBody.querySelectorAll<HTMLButtonElement>('.skill-learn-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const message: ClientMessage = { type: 'command', text: `skill learn ${button.dataset.skillId}` };
        socket.send(JSON.stringify(message));
      });
    });
  }

  function openSkillModal(): void {
    renderSkillModal();
    skillModal.hidden = false;
  }

  function closeSkillModal(): void {
    skillModal.hidden = true;
  }

  let macros: MacroMap = loadMacros();

  function renderMacroModal(): void {
    macroModalBody.innerHTML = `
      <p>숫자키 1~9를 입력창에 치고 <strong>Tab</strong>을 누르면 등록한 문구가 채워집니다.</p>
      ${MACRO_SLOTS.map(
        (slot) => `
          <div class="macro-row">
            <span class="macro-row-key">${slot}</span>
            <input type="text" class="macro-row-input" data-macro-slot="${slot}" value="${escapeHtml(macros[slot])}" placeholder="예: 마법 파이어볼 " />
          </div>
        `,
      ).join('')}
    `;

    macroModalBody.querySelectorAll<HTMLInputElement>('.macro-row-input').forEach((input) => {
      input.addEventListener('change', () => {
        const slot = input.dataset.macroSlot as MacroSlot;
        macros = saveMacro(macros, slot, input.value);
      });
    });
  }

  function openMacroModal(): void {
    renderMacroModal();
    macroModal.hidden = false;
  }

  function closeMacroModal(): void {
    macroModal.hidden = true;
  }

  let equipmentState: EquipmentSnapshot = {};
  let inventoryState: InventoryItemInfo[] = [];

  function renderEquipmentPanel(): void {
    equipmentPanel.innerHTML = EQUIPMENT_SLOTS.map((slot) => {
      const equipped = equipmentState[slot];
      return `
        <div class="equipment-slot">
          <span class="equipment-slot-label">${EQUIPMENT_SLOT_LABELS[slot]}</span>
          <span class="equipment-slot-value">${equipped ? `<span class="item-grade-${equipped.grade}">${escapeHtml(equipped.name)}</span>` : '비어있음'}</span>
        </div>
      `;
    }).join('');
  }

  function renderInventoryPanel(): void {
    inventoryCountLabel.textContent = String(inventoryState.length);
    inventoryPanelList.innerHTML =
      inventoryState
        .map(
          (item) => `
            <div class="inventory-panel-row">
              <span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span>
              <span class="inventory-panel-qty">${item.quantity > 1 ? `x${item.quantity}` : ''}${item.equipped ? ' [장착]' : ''}</span>
            </div>
          `,
        )
        .join('') || '<div class="inventory-panel-empty">비어있음</div>';
  }

  function renderEquipModal(): void {
    equipModalBody.innerHTML = EQUIPMENT_SLOTS.map((slot) => {
      const equipped = equipmentState[slot];
      const options = inventoryState.filter((item) => item.slot === slot && !item.equipped);
      return `
        <div class="equip-modal-row">
          <div class="equip-modal-slot-label">${EQUIPMENT_SLOT_LABELS[slot]}</div>
          <div class="equip-modal-current">
            ${equipped ? `<span class="item-grade-${equipped.grade}">${escapeHtml(equipped.name)}</span>` : '비어있음'}
            ${equipped ? `<button type="button" class="equip-modal-unequip-btn" data-unequip-slot="${slot}">해제</button>` : ''}
          </div>
          <div class="equip-modal-options">
            ${
              options.length > 0
                ? `<select data-slot-select="${slot}">
                    ${options.map((item) => `<option value="${item.inventoryId}">${escapeHtml(item.name)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</option>`).join('')}
                  </select>
                  <button type="button" class="equip-modal-equip-btn" data-equip-slot="${slot}">장착</button>`
                : '<span class="equip-modal-empty">착용 가능한 아이템 없음</span>'
            }
          </div>
        </div>
      `;
    }).join('');

    equipModalBody.querySelectorAll<HTMLButtonElement>('[data-equip-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.equipSlot!;
        const select = equipModalBody.querySelector<HTMLSelectElement>(`[data-slot-select="${slot}"]`);
        const inventoryId = Number(select?.value);
        if (!inventoryId) return;
        const message: ClientMessage = { type: 'equipItem', inventoryId };
        socket.send(JSON.stringify(message));
      });
    });

    equipModalBody.querySelectorAll<HTMLButtonElement>('[data-unequip-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.unequipSlot as EquipmentSlot;
        const message: ClientMessage = { type: 'unequipItem', slot };
        socket.send(JSON.stringify(message));
      });
    });
  }

  function openEquipModal(): void {
    renderEquipModal();
    equipModal.hidden = false;
  }

  function closeEquipModal(): void {
    equipModal.hidden = true;
  }

  function raidStatusText(raidProtectedUntil: string | null): string {
    if (!raidProtectedUntil) return '무방비';
    const protectedUntil = new Date(raidProtectedUntil);
    if (protectedUntil.getTime() <= Date.now()) return '무방비';
    return `보호 중 (${protectedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}까지)`;
  }

  function renderVillageSection(village: VillageInfo): string {
    const plotsText = village.plots
      .map((plot) => `${plot.index}:${plot.buildingName ?? '빈 땅'}`)
      .join(', ');

    return `
      <div class="village-panel">
        <div class="village-title">🏰 ${village.name} (영주: ${village.lordName}, Lv.${village.level})</div>
        <div class="room-meta">
          <span><strong>국고</strong>gold ${village.gold}</span>
          <span><strong>목재</strong>${village.wood}</span>
          <span><strong>광석</strong>${village.ore}</span>
          <span><strong>식량</strong>${village.food}</span>
        </div>
        <div class="room-meta">
          <span><strong>상납율</strong>${village.tithePercent}%</span>
          <span><strong>침공 상태</strong>${raidStatusText(village.raidProtectedUntil)}</span>
        </div>
        <div class="room-meta">
          <span><strong>땅</strong>${plotsText || '없음'}</span>
        </div>
      </div>
    `;
  }

  function renderRoom(room: RoomSnapshot): void {
    const exitsText =
      room.exits.length > 0
        ? room.exits.map((exit) => (exit.blocked ? `${exit.label} [막힘]` : exit.label)).join(', ')
        : '없음';
    const mobsText =
      room.mobs.length > 0
        ? room.mobs.map((mob) => `${mob.name} Lv.${mob.level} (${mob.hp}/${mob.maxHp})`).join(', ')
        : '-';
    const itemsText =
      room.items.length > 0
        ? room.items
            .map((item) => `<span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> x${item.quantity}`)
            .join(', ')
        : '-';
    const npcsText =
      room.npcs.length > 0
        ? room.npcs.map((npc) => `${escapeHtml(npc.name)} (${NPC_TYPE_LABELS[npc.type]})`).join(', ')
        : '-';
    const playersText = room.players.length > 0 ? room.players.join(', ') : '-';

    roomPanel.innerHTML = `
      <div class="room-name">${room.name}</div>
      <p class="room-desc">${room.description}</p>
      <div class="room-meta">
        <span><strong>출구</strong>${exitsText}</span>
        <span><strong>몬스터</strong>${mobsText}</span>
        <span><strong>아이템</strong>${itemsText}</span>
        <span><strong>NPC</strong>${npcsText}</span>
        <span><strong>유저</strong>${playersText}</span>
      </div>
      ${room.village ? renderVillageSection(room.village) : ''}
    `;
  }

  const roomCoord = new Map<number, { zoneId: number; x: number; y: number }>();
  const coordRoom = new Map<string, number>();
  const roomNames = new Map<number, string>();
  let currentRoomId: number | null = null;
  let pendingDirection: 'north' | 'south' | 'east' | 'west' | null = null;
  let latestRoom: RoomSnapshot | null = null;

  function setRoomPosition(roomId: number, zoneId: number, x: number, y: number): void {
    roomCoord.set(roomId, { zoneId, x, y });
    coordRoom.set(`${zoneId}:${x},${y}`, roomId);
  }

  function recordRoomVisit(room: RoomSnapshot): void {
    roomNames.set(room.id, room.name);

    if (!roomCoord.has(room.id)) {
      const previous = currentRoomId !== null ? roomCoord.get(currentRoomId) : undefined;
      if (previous && pendingDirection && previous.zoneId === room.zoneId) {
        const offset = CARDINAL_OFFSET[pendingDirection];
        setRoomPosition(room.id, room.zoneId, previous.x + offset.dx, previous.y + offset.dy);
      } else {
        // 최초 진입이거나(전 위치 없음) 존이 바뀐 이동(포털 등 인접성 없는 이동) → 새 로컬 원점에서 시작
        setRoomPosition(room.id, room.zoneId, 0, 0);
      }
    }

    currentRoomId = room.id;
    pendingDirection = null;
  }

  function renderMinimap(): void {
    minimap.innerHTML = '';
    const center = currentRoomId !== null ? roomCoord.get(currentRoomId) : undefined;
    if (!center) return;

    for (let dy = MINIMAP_ROW_START; dy <= MINIMAP_ROW_END; dy++) {
      for (let dx = -MINIMAP_COL_RADIUS; dx <= MINIMAP_COL_RADIUS; dx++) {
        const roomId = coordRoom.get(`${center.zoneId}:${center.x + dx},${center.y + dy}`);
        const cell = document.createElement('span');
        cell.className = 'minimap-cell';
        if (roomId !== undefined) {
          cell.classList.add('minimap-visited');
          if (roomId === currentRoomId) cell.classList.add('minimap-current');
          cell.title = roomNames.get(roomId) ?? '';
        }
        minimap.appendChild(cell);
      }
    }
  }

  function renderCombat(mobs: CombatMobInfo[]): void {
    combatPanel.hidden = false;
    combatPanel.innerHTML = mobs
      .map((mob) => {
        const ratio = mob.maxHp > 0 ? mob.hp / mob.maxHp : 0;
        return `
          <div class="combat-mob-row">
            <div class="combat-mob-name"></div>
            <div class="hp-bar" role="progressbar" aria-valuenow="${mob.hp}" aria-valuemin="0" aria-valuemax="${mob.maxHp}">
              <div class="hp-bar-fill" data-level="${hpLevel(ratio)}" style="width: ${Math.max(0, ratio * 100)}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
    combatPanel.querySelectorAll<HTMLDivElement>('.combat-mob-name').forEach((el, index) => {
      el.textContent = mobs[index].name;
    });
  }

  function hideCombat(): void {
    combatPanel.hidden = true;
    combatPanel.innerHTML = '';
  }

  function showJobModal(onChoose: (job: (typeof JOB_VALUES)[number]) => void): void {
    jobModalBody.innerHTML = `
      <p>이 캐릭터는 아직 직업이 없습니다. 직업을 선택해주세요.</p>
      <div class="job-choice-list">
        ${JOB_VALUES.map(
          (job) => `
          <button type="button" class="job-choice-btn" data-job="${job}">
            <span class="job-choice-name">${JOB_LABELS[job]}</span>
            <span class="job-choice-desc">${JOB_DESCRIPTIONS[job]}</span>
          </button>
        `,
        ).join('')}
      </div>
    `;
    jobModal.hidden = false;
    jobModalBody.querySelectorAll<HTMLButtonElement>('.job-choice-btn').forEach((button) => {
      button.addEventListener('click', () => {
        jobModal.hidden = true;
        onChoose(button.dataset.job as (typeof JOB_VALUES)[number]);
      });
    });
  }

  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => {
    const authMessage: ClientMessage = { type: 'auth', token };
    socket.send(JSON.stringify(authMessage));
  });

  socket.addEventListener('close', () => appendLine('[연결 종료됨]'));

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === 'text') {
      appendLine(message.text, message.channel);
    } else if (message.type === 'error') {
      appendLine(message.text, 'error');
    } else if (message.type === 'state') {
      renderState(message.character);
    } else if (message.type === 'room') {
      latestRoom = message.room;
      recordRoomVisit(message.room);
      renderRoom(message.room);
      renderMinimap();
    } else if (message.type === 'combat') {
      latestCombatMobs = message.mobs;
      renderCombat(message.mobs);
    } else if (message.type === 'combatEnd') {
      latestCombatMobs = [];
      hideCombat();
    } else if (message.type === 'equipment') {
      equipmentState = message.slots;
      renderEquipmentPanel();
      if (!equipModal.hidden) renderEquipModal();
    } else if (message.type === 'inventory') {
      inventoryState = message.items;
      renderInventoryPanel();
      if (!equipModal.hidden) renderEquipModal();
    } else if (message.type === 'skills') {
      learnedSkillIds = message.learnedSkillIds;
      if (!skillModal.hidden) renderSkillModal();
    } else if (message.type === 'skillCooldowns') {
      const now = Date.now();
      const activeIds = new Set(message.cooldowns.map((cooldown) => cooldown.skillId));
      for (const skillId of activeCooldowns.keys()) {
        if (!activeIds.has(skillId)) activeCooldowns.delete(skillId);
      }
      for (const cooldown of message.cooldowns) {
        activeCooldowns.set(cooldown.skillId, {
          name: cooldown.name,
          endsAt: now + cooldown.remainingMs,
          totalMs: cooldown.totalMs,
        });
      }
      renderCooldownPanel();
    } else if (message.type === 'needsJob') {
      showJobModal((job) => {
        const chooseJobMessage: ClientMessage = { type: 'chooseJob', job };
        socket.send(JSON.stringify(chooseJobMessage));
      });
    }
  });

  renderEquipmentPanel();
  renderInventoryPanel();

  const commandHistory: string[] = [];
  let historyIndex = 0;
  let historyDraft = '';

  function sendCommand(text: string): void {
    const verb = text.trim().split(/\s+/)[0]?.toLowerCase();
    pendingDirection = verb ? (CARDINAL_ALIASES[verb] ?? null) : null;

    appendLine(`> ${text}`, 'echo');
    const message: ClientMessage = { type: 'command', text };
    socket.send(JSON.stringify(message));
    commandInput.value = '';
    tabCompletion = null;

    if (commandHistory[commandHistory.length - 1] !== text) {
      commandHistory.push(text);
    }
    historyIndex = commandHistory.length;
  }

  function navigateHistory(direction: -1 | 1): void {
    if (commandHistory.length === 0) return;

    if (direction === -1) {
      if (historyIndex === 0) return;
      if (historyIndex === commandHistory.length) historyDraft = commandInput.value;
      historyIndex -= 1;
    } else {
      if (historyIndex === commandHistory.length) return;
      historyIndex += 1;
    }

    commandInput.value = historyIndex === commandHistory.length ? historyDraft : commandHistory[historyIndex];
    commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
  }

  let tabCompletion: { base: string; candidates: string[]; index: number } | null = null;

  function nameCompletionCandidates(): string[] {
    const names = new Set<string>();
    if (latestRoom) {
      for (const mob of latestRoom.mobs) names.add(mob.name);
      for (const item of latestRoom.items) names.add(item.name);
    }
    for (const item of inventoryState) names.add(item.name);
    return [...names];
  }

  function learnedSkillNameCandidates(): string[] {
    const names = new Set<string>();
    for (const skill of SKILLS) {
      if (learnedSkillIds.includes(skill.id)) names.add(skill.name);
    }
    return [...names];
  }

  function combatTargetCandidates(): string[] {
    return latestCombatMobs.length > 0
      ? [...new Set(latestCombatMobs.map((mob) => mob.name))]
      : nameCompletionCandidates();
  }

  /**
   * 두 번째 탭부터는 새로 후보를 계산하지 않고 이전 후보 목록을 순환한다.
   * 동일 접두사에 여러 후보(예: "가죽"으로 시작하는 아이템 여러 개)가 있을 때
   * 탭을 반복해서 눌러 하나씩 넘겨보게 하기 위함이다.
   *
   * "마법"/"cast"는 두 번째 토큰이 스킬 이름, 세 번째 토큰이 대상이라서
   * 토큰 위치에 따라 후보 풀이 달라진다. 그 외 명령어는 기존처럼
   * 첫 토큰이면 명령어 목록, 아니면 방/인벤토리 이름 목록을 쓴다.
   */
  function handleTabComplete(): void {
    const value = commandInput.value;

    if (MACRO_SLOTS.includes(value as MacroSlot) && macros[value as MacroSlot]) {
      commandInput.value = macros[value as MacroSlot];
      commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
      tabCompletion = null;
      return;
    }

    const tokens = value.split(' ');
    const tokenIndex = tokens.length - 1;
    const typed = tokens[tokenIndex];
    const base = tokenIndex === 0 ? '' : `${tokens.slice(0, tokenIndex).join(' ')} `;
    const verb = tokens[0].toLowerCase();
    const isCastVerb = verb === 'cast' || verb === '마법';

    if (tabCompletion && tabCompletion.base === base) {
      tabCompletion.index = (tabCompletion.index + 1) % tabCompletion.candidates.length;
    } else {
      let pool: string[];
      if (tokenIndex === 0) {
        pool = COMMAND_VERBS;
      } else if (isCastVerb && tokenIndex === 1) {
        pool = learnedSkillNameCandidates();
      } else if (isCastVerb) {
        pool = combatTargetCandidates();
      } else {
        pool = nameCompletionCandidates();
      }
      const lowerTyped = typed.toLowerCase();
      const candidates = pool.filter((candidate) => candidate.toLowerCase().startsWith(lowerTyped));
      if (candidates.length === 0) return;
      tabCompletion = { base, candidates, index: 0 };
    }

    commandInput.value = base + tabCompletion.candidates[tabCompletion.index];
    commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
  }

  commandInput.addEventListener('input', () => {
    tabCompletion = null;
  });

  commandInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.isComposing) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      navigateHistory(-1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      navigateHistory(1);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      handleTabComplete();
      return;
    }

    if (event.key !== 'Enter') return;
    const text = commandInput.value.trim();
    if (!text) return;
    sendCommand(text);
  });

  if (activeCommandFocusHandler) {
    document.removeEventListener('keydown', activeCommandFocusHandler);
  }

  /** 모달이 열려있거나 다른 입력/버튼에 포커스가 있는 게 아니라면, 키보드 입력이 항상 명령창으로 가도록 되돌려놓는다. */
  function isFocusStealExempt(): boolean {
    if ([equipModal, jobModal, skillModal, macroModal].some((modal) => !modal.hidden)) return true;
    const active = document.activeElement;
    if (!active || active === commandInput) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (active as HTMLElement).isContentEditable;
  }

  activeCommandFocusHandler = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isFocusStealExempt()) return;
    commandInput.focus();
  };
  document.addEventListener('keydown', activeCommandFocusHandler);

  const builderEntryButton = container.querySelector<HTMLButtonElement>('#builder-entry');
  builderEntryButton?.addEventListener('click', () => {
    socket.close();
    renderBuilderScreen(container, token, () => renderGameScreen(container, token, isBuilder, isAdmin, onLogout));
  });

  const adminEntryButton = container.querySelector<HTMLButtonElement>('#admin-entry');
  adminEntryButton?.addEventListener('click', () => {
    socket.close();
    renderAdminScreen(container, token, () => renderGameScreen(container, token, isBuilder, isAdmin, onLogout));
  });

  const logoutButton = container.querySelector<HTMLButtonElement>('#logout-button')!;
  logoutButton.addEventListener('click', () => {
    socket.close();
    onLogout();
  });

  const equipSwapButton = container.querySelector<HTMLButtonElement>('#equip-swap-button')!;
  equipSwapButton.addEventListener('click', () => openEquipModal());

  const equipModalCloseButton = container.querySelector<HTMLButtonElement>('#equip-modal-close')!;
  equipModalCloseButton.addEventListener('click', () => closeEquipModal());

  equipModal.addEventListener('click', (event) => {
    if (event.target === equipModal) closeEquipModal();
  });

  const skillButton = container.querySelector<HTMLButtonElement>('#skill-button')!;
  skillButton.addEventListener('click', () => openSkillModal());

  const skillModalCloseButton = container.querySelector<HTMLButtonElement>('#skill-modal-close')!;
  skillModalCloseButton.addEventListener('click', () => closeSkillModal());

  skillModal.addEventListener('click', (event) => {
    if (event.target === skillModal) closeSkillModal();
  });

  const macroButton = container.querySelector<HTMLButtonElement>('#macro-button')!;
  macroButton.addEventListener('click', () => openMacroModal());

  const macroModalCloseButton = container.querySelector<HTMLButtonElement>('#macro-modal-close')!;
  macroModalCloseButton.addEventListener('click', () => closeMacroModal());

  macroModal.addEventListener('click', (event) => {
    if (event.target === macroModal) closeMacroModal();
  });
}
