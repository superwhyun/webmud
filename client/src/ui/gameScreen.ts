import {
  ELEMENT_LABELS,
  type CharacterState,
  type ClientMessage,
  type RoomSnapshot,
  type ServerMessage,
  type VillageInfo,
} from '@mud/shared';
import { renderAdminScreen } from './adminScreen';
import { renderBuilderScreen } from './builderScreen';

const CARDINAL_ALIASES: Record<string, 'north' | 'south' | 'east' | 'west'> = {
  n: 'north',
  north: 'north',
  s: 'south',
  south: 'south',
  e: 'east',
  east: 'east',
  w: 'west',
  west: 'west',
};

const CARDINAL_OFFSET: Record<'north' | 'south' | 'east' | 'west', { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

const MINIMAP_RADIUS = 2;

export function renderGameScreen(
  container: HTMLElement,
  token: string,
  isBuilder = false,
  isAdmin = false,
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
        ${isBuilder ? '<button type="button" id="builder-entry" class="builder-entry-btn">🛠 빌더</button>' : ''}
        ${isAdmin ? '<button type="button" id="admin-entry" class="admin-entry-btn">⚙ 어드민</button>' : ''}
        <div class="minimap" id="minimap"></div>
      </aside>
    </div>
  `;

  const roomPanel = container.querySelector<HTMLDivElement>('#room-panel')!;
  const combatPanel = container.querySelector<HTMLDivElement>('#combat-panel')!;
  const terminal = container.querySelector<HTMLDivElement>('#terminal')!;
  const sidebarStats = container.querySelector<HTMLDivElement>('#sidebar-stats')!;
  const minimap = container.querySelector<HTMLDivElement>('#minimap')!;
  const commandInput = container.querySelector<HTMLInputElement>('#command')!;

  function appendLine(text: string, channel?: string): void {
    const line = document.createElement('div');
    line.textContent = text;
    line.className = `line line-${channel ?? 'system'}`;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
  }

  function hpLevel(ratio: number): 'normal' | 'warning' | 'danger' {
    if (ratio <= 0.25) return 'danger';
    if (ratio <= 0.5) return 'warning';
    return 'normal';
  }

  function renderState(character: CharacterState): void {
    const ratio = character.maxHp > 0 ? character.hp / character.maxHp : 0;
    const level = hpLevel(ratio);
    sidebarStats.innerHTML = `
      <div class="stat stat-name">${character.name}</div>
      <div class="stat">HP ${character.hp}/${character.maxHp}</div>
      <div class="hp-bar" role="progressbar" aria-valuenow="${character.hp}" aria-valuemin="0" aria-valuemax="${character.maxHp}">
        <div class="hp-bar-fill" data-level="${level}" style="width: ${Math.max(0, ratio * 100)}%"></div>
      </div>
      <div class="stat">Lv.${character.level} (EXP ${character.exp}) · gold ${character.gold}</div>
      <div class="stat-grid">
        <span>힘 ${character.strength}</span>
        <span>민첩 ${character.dexterity}</span>
        <span>물리방어 ${character.physicalDefense}</span>
        <span>마법방어 ${character.magicDefense}</span>
      </div>
      <div class="stat">속성 ${ELEMENT_LABELS[character.element]}</div>
      <div class="stat stat-room">${character.roomName}</div>
    `;
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
    const exitsText = room.exits.length > 0 ? room.exits.map((exit) => exit.label).join(', ') : '없음';
    const mobsText =
      room.mobs.length > 0 ? room.mobs.map((mob) => `${mob.name} (${mob.hp}/${mob.maxHp})`).join(', ') : '-';
    const itemsText =
      room.items.length > 0 ? room.items.map((item) => `${item.name} x${item.quantity}`).join(', ') : '-';
    const playersText = room.players.length > 0 ? room.players.join(', ') : '-';

    roomPanel.innerHTML = `
      <div class="room-name">${room.name}</div>
      <p class="room-desc">${room.description}</p>
      <div class="room-meta">
        <span><strong>출구</strong>${exitsText}</span>
        <span><strong>몬스터</strong>${mobsText}</span>
        <span><strong>아이템</strong>${itemsText}</span>
        <span><strong>유저</strong>${playersText}</span>
      </div>
      ${room.village ? renderVillageSection(room.village) : ''}
    `;
  }

  const roomCoord = new Map<number, { x: number; y: number }>();
  const coordRoom = new Map<string, number>();
  const roomNames = new Map<number, string>();
  let currentRoomId: number | null = null;
  let pendingDirection: 'north' | 'south' | 'east' | 'west' | null = null;

  function setRoomPosition(roomId: number, x: number, y: number): void {
    roomCoord.set(roomId, { x, y });
    coordRoom.set(`${x},${y}`, roomId);
  }

  function recordRoomVisit(room: RoomSnapshot): void {
    roomNames.set(room.id, room.name);

    if (!roomCoord.has(room.id)) {
      if (roomCoord.size === 0) {
        setRoomPosition(room.id, 0, 0);
      } else if (currentRoomId !== null && pendingDirection) {
        const base = roomCoord.get(currentRoomId);
        if (base) {
          const offset = CARDINAL_OFFSET[pendingDirection];
          setRoomPosition(room.id, base.x + offset.dx, base.y + offset.dy);
        }
      }
    }

    currentRoomId = room.id;
    pendingDirection = null;
  }

  function renderMinimap(): void {
    minimap.innerHTML = '';
    const center = currentRoomId !== null ? roomCoord.get(currentRoomId) : undefined;
    if (!center) return;

    for (let dy = -MINIMAP_RADIUS; dy <= MINIMAP_RADIUS; dy++) {
      for (let dx = -MINIMAP_RADIUS; dx <= MINIMAP_RADIUS; dx++) {
        const roomId = coordRoom.get(`${center.x + dx},${center.y + dy}`);
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

  function renderCombat(mobName: string, hp: number, maxHp: number): void {
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    combatPanel.hidden = false;
    combatPanel.innerHTML = `
      <div class="combat-mob-name"></div>
      <div class="hp-bar" role="progressbar" aria-valuenow="${hp}" aria-valuemin="0" aria-valuemax="${maxHp}">
        <div class="hp-bar-fill" data-level="${hpLevel(ratio)}" style="width: ${Math.max(0, ratio * 100)}%"></div>
      </div>
    `;
    combatPanel.querySelector<HTMLDivElement>('.combat-mob-name')!.textContent = mobName;
  }

  function hideCombat(): void {
    combatPanel.hidden = true;
    combatPanel.innerHTML = '';
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
      recordRoomVisit(message.room);
      renderRoom(message.room);
      renderMinimap();
    } else if (message.type === 'combat') {
      renderCombat(message.mobName, message.mobHp, message.mobMaxHp);
    } else if (message.type === 'combatEnd') {
      hideCombat();
    }
  });

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

    if (event.key !== 'Enter') return;
    const text = commandInput.value.trim();
    if (!text) return;
    sendCommand(text);
  });

  const builderEntryButton = container.querySelector<HTMLButtonElement>('#builder-entry');
  builderEntryButton?.addEventListener('click', () => {
    socket.close();
    renderBuilderScreen(container, token, () => renderGameScreen(container, token, isBuilder, isAdmin));
  });

  const adminEntryButton = container.querySelector<HTMLButtonElement>('#admin-entry');
  adminEntryButton?.addEventListener('click', () => {
    socket.close();
    renderAdminScreen(container, token, () => renderGameScreen(container, token, isBuilder, isAdmin));
  });
}
