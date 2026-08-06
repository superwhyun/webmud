import {
  ELEMENT_LABELS,
  type CharacterState,
  type ClientMessage,
  type RoomSnapshot,
  type ServerMessage,
  type VillageInfo,
} from '@mud/shared';

export function renderGameScreen(container: HTMLElement, token: string): void {
  container.innerHTML = `
    <div class="room-panel" id="room-panel"></div>
    <div class="game-layout">
      <div class="terminal" id="terminal"></div>
      <aside class="sidebar" id="sidebar"></aside>
    </div>
    <div class="command-input">
      <span class="prompt">&gt;</span>
      <input id="command" type="text" autocomplete="off" autofocus aria-label="명령어 입력" />
    </div>
  `;

  const roomPanel = container.querySelector<HTMLDivElement>('#room-panel')!;
  const terminal = container.querySelector<HTMLDivElement>('#terminal')!;
  const sidebar = container.querySelector<HTMLDivElement>('#sidebar')!;
  const commandInput = container.querySelector<HTMLInputElement>('#command')!;

  function appendLine(text: string): void {
    const line = document.createElement('div');
    line.textContent = text;
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
    sidebar.innerHTML = `
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

  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => {
    const authMessage: ClientMessage = { type: 'auth', token };
    socket.send(JSON.stringify(authMessage));
  });

  socket.addEventListener('close', () => appendLine('[연결 종료됨]'));

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as ServerMessage;
    if (message.type === 'text' || message.type === 'error') {
      appendLine(message.text);
    } else if (message.type === 'state') {
      renderState(message.character);
    } else if (message.type === 'room') {
      renderRoom(message.room);
    }
  });

  function sendCommand(text: string): void {
    appendLine(`> ${text}`);
    const message: ClientMessage = { type: 'command', text };
    socket.send(JSON.stringify(message));
    commandInput.value = '';
  }

  commandInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const text = commandInput.value.trim();
    if (!text) return;
    sendCommand(text);
  });
}
