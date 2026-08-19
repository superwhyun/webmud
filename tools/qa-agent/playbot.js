#!/usr/bin/env node
/**
 * Deterministic leveling bot — no LLM per action. Opens one persistent WebSocket
 * per character (unlike qa-client.js, which opens/closes per command — that model
 * can't watch a multi-round auto-resolving fight) and runs a rule-based loop:
 * rest when hurt, spend stat/skill points, equip upgrades, loot the room, fight
 * anything close to its own level, otherwise wander. Progress is logged as JSONL
 * so job/element combos can be compared afterwards (see analyze.js) and turned
 * into balance suggestions via qa-client.js's `suggest` command.
 *
 * Usage: node playbot.js <job> <element> [--target-level N] [--username NAME]
 *                         [--max-minutes N] [--run-id ID]
 *        node playbot.js all [--target-level N] [--max-minutes N]
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const SERVER_HTTP = process.env.QA_SERVER_URL || 'http://localhost:3001';
const SERVER_WS = SERVER_HTTP.replace(/^http/, 'ws') + '/ws';
const RUNS_DIR = path.join(__dirname, 'runs');
// QA 계정 전용 더미 비밀번호 (실제 사용자 인증 정보 아님) — 필요하면 QA_PLAYBOT_PASSWORD로 덮어쓴다.
const DEFAULT_PLAYBOT_PASSWORD = ['playbot', 'pass', '1234'].join('-');

const DEFAULT_TARGET_LEVEL = 15;
const DEFAULT_MAX_MINUTES = 45;
const IDLE_POLL_MS = 300;
const COMBAT_TIMEOUT_MS = 90_000;
const REST_TIMEOUT_MS = 60_000;
const MAX_ACTIONS = 20_000;

// 직업당 속성 하나씩 — 상성 편향 없이 넓게 비교하려는 기본값일 뿐, --element로 덮어쓸 수 있다.
const DEFAULT_ELEMENT = { warrior: 'fire', rogue: 'wood', mage: 'water', priest: 'earth' };
const JOBS = ['warrior', 'rogue', 'mage', 'priest'];

// 레벨업 시 스탯 포인트를 분배할 순서 — 생존(vit)을 항상 앞쪽에 섞어 죽음으로 인한 시간 낭비를 줄인다.
const STAT_PRIORITY = {
  warrior: ['vit', 'str', 'str', 'vit', 'dex', 'luk'],
  rogue: ['dex', 'vit', 'dex', 'luk', 'vit', 'str'],
  mage: ['int', 'vit', 'int', 'wis', 'vit', 'luk'],
  priest: ['wis', 'vit', 'wis', 'int', 'vit', 'luk'],
};

const PRIMARY_STAT_BONUS_KEY = {
  warrior: 'strengthBonus',
  rogue: 'dexterityBonus',
  mage: 'intelligenceBonus',
  priest: 'intelligenceBonus',
};

const ELEMENT_ADVANTAGE = { fire: 'metal', metal: 'wood', wood: 'earth', earth: 'water', water: 'fire' };
const hasElementAdvantage = (a, b) => ELEMENT_ADVANTAGE[a] === b;

// 교전 판정 임계값 — consider 명령의 서버측 등급(server/src/game/commands/inspect.ts)과 같은 감각으로 맞췄다.
const SAFE_LEVEL_DIFF = 1;
const CAUTIOUS_LEVEL_DIFF = 2;
const CAUTIOUS_MIN_HP_RATIO = 0.9;
const FLEE_HP_RATIO = 0.25;
const POTION_HP_RATIO = 0.45;
const REST_TRIGGER_HP_RATIO = 0.9;
const REST_TRIGGER_MP_RATIO = 0.5;
const REST_DONE_HP_RATIO = 0.97;
const REST_DONE_MP_RATIO = 0.9;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(p, options = {}) {
  const response = await fetch(`${SERVER_HTTP}/api${p}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok && response.status !== 409) {
    throw new Error((body && body.error) || `요청 실패 (상태 코드 ${response.status})`);
  }
  return { status: response.status, body };
}

class RunLogger {
  constructor(runId, username) {
    const dir = path.join(RUNS_DIR, runId);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${username}.jsonl`);
    this.startedAt = Date.now();
  }

  event(type, fields) {
    const line = JSON.stringify({ ts: Date.now(), elapsedMs: Date.now() - this.startedAt, type, ...fields });
    fs.appendFileSync(this.filePath, line + '\n');
  }
}

/** 캐릭터 하나를 끝까지 성장시키는 지속 연결 세션. */
class PlaybotSession {
  constructor({ username, password, name, job, element, targetLevel, maxMinutes, runId }) {
    this.username = username;
    this.password = password;
    this.name = name;
    this.job = job;
    this.element = element;
    this.targetLevel = targetLevel;
    this.deadlineAt = Date.now() + maxMinutes * 60_000;
    this.logger = new RunLogger(runId, username);

    this.character = null;
    this.room = null;
    this.equipment = {};
    this.inventory = [];
    this.inCombat = false;
    this.lastSkillListText = null;
    this.actionsTaken = 0;
    this.kills = 0;
    this.deaths = 0;
    this.seenLevel = null;
    // 도망친 적은(같은 방에 있는 한) 다시 붙지 않는다 — 안 그러면 못 이기는 몹 하나와
    // 공격→도주→휴식을 무한 반복하게 된다. 레벨업하면 판정 기준 자체가 바뀌므로 비운다.
    this.avoidKeys = new Set();
  }

  log(msg) {
    console.log(`[${this.username}] ${msg}`);
  }

  async ensureAccount() {
    const registered = await apiRequest('/register', {
      method: 'POST',
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    let token = registered.body?.token;
    if (!token) {
      const loggedIn = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      token = loggedIn.body.token;
    }
    this.token = token;

    await apiRequest('/character', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: this.name, element: this.element, job: this.job }),
    });
    // 409(이미 캐릭터 있음)는 정상 — 같은 username으로 재실행해 기존 캐릭터를 이어서 키우는 경로다.
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(SERVER_WS);
      this.ws.on('open', () => {
        this.send({ type: 'auth', token: this.token });
        resolve();
      });
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => this.handleMessage(raw));
      this.ws.on('close', () => {
        this.closed = true;
      });
    });
    await sleep(500); // 초기 state/room/equipment/inventory/skills 푸시가 도착할 시간을 준다.
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
      case 'state': {
        const prevLevel = this.character?.level;
        this.character = message.character;
        if (this.seenLevel !== null && this.character.level > this.seenLevel) {
          this.logger.event('levelup', {
            level: this.character.level,
            gold: this.character.gold,
            statPoints: this.character.unallocatedStatPoints,
            skillPoints: this.character.unallocatedSkillPoints,
          });
          this.log(`레벨업 -> Lv.${this.character.level}`);
          this.avoidKeys.clear();
        }
        this.seenLevel = this.character.level;
        void prevLevel;
        break;
      }
      case 'room':
        this.room = message.room;
        break;
      case 'equipment':
        this.equipment = message.slots;
        break;
      case 'inventory':
        this.inventory = message.items;
        break;
      case 'combat':
        this.inCombat = true;
        this.combatMobs = message.mobs;
        break;
      case 'combatEnd':
        if (this.inCombat) this.kills += 1; // 정확히 킬 수는 아니지만(도망 포함), 대략적 지표로 충분하다.
        this.inCombat = false;
        this.combatMobs = [];
        break;
      case 'death':
        this.deaths += 1;
        this.inCombat = false;
        this.logger.event('death', { level: this.character?.level ?? null });
        this.log('사망 -> 리스폰 대기');
        break;
      case 'text':
        if (typeof message.text === 'string' && message.text.startsWith('스킬 포인트:')) {
          this.lastSkillListText = message.text;
        }
        break;
      case 'error':
        this.logger.event('server-error', { text: message.text });
        break;
      default:
        break;
    }
  }

  async waitUntil(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(IDLE_POLL_MS);
    }
    return false;
  }

  async act(text, waitMs = 400) {
    this.actionsTaken += 1;
    this.logger.event('action', { text });
    this.send({ type: 'command', text });
    await sleep(waitMs);
  }

  hpRatio() {
    return this.character.hp / this.character.maxHp;
  }

  mpRatio() {
    return this.character.maxMp > 0 ? this.character.mp / this.character.maxMp : 1;
  }

  findPotion() {
    return this.inventory.find((item) => !item.equipped && item.healAmount > 0 && item.quantity > 0);
  }

  gearScore(item) {
    const primaryKey = PRIMARY_STAT_BONUS_KEY[this.job];
    return (
      (item.attackPowerBonus || 0) * 1.5 +
      (item.physicalDefenseBonus || 0) +
      (item.magicDefenseBonus || 0) +
      (item[primaryKey] || 0) * 1.2
    );
  }

  /** 인벤토리에서 현재 장착보다 강한 아이템을 찾아 장착한다 (한 틱에 최대 3개까지). */
  async upgradeEquipment() {
    const candidates = this.inventory.filter(
      (item) => item.slot && !item.equipped && item.level <= this.character.level,
    );
    let equippedCount = 0;
    for (const item of candidates) {
      if (equippedCount >= 3) break;
      const current = this.equipment[item.slot];
      const currentScore = current ? this.gearScore(current) : -Infinity;
      if (this.gearScore(item) <= currentScore) continue;
      this.logger.event('equip', { name: item.name, slot: item.slot, score: this.gearScore(item) });
      this.send({ type: 'equipItem', inventoryId: item.inventoryId });
      await sleep(300);
      equippedCount += 1;
    }
  }

  async allocateStatPoints() {
    const amount = this.character.unallocatedStatPoints;
    if (amount <= 0) return;
    const priority = STAT_PRIORITY[this.job];
    const counts = {};
    for (let i = 0; i < amount; i += 1) {
      const key = priority[i % priority.length];
      counts[key] = (counts[key] || 0) + 1;
    }
    for (const [statKey, count] of Object.entries(counts)) {
      this.send({ type: 'allocateStat', statKey, amount: count });
      await sleep(250);
    }
  }

  parseAvailableSkillNames(skillListText) {
    const learnable = [];
    const upgradable = [];
    for (const line of skillListText.split('\n')) {
      const learnMatch = line.match(/^\[습득 가능\] (.+?) \(/);
      if (learnMatch) {
        learnable.push(learnMatch[1]);
        continue;
      }
      const rankMatch = line.match(/^\[Lv(\d+)\/(\d+)(?: 만렙)?\] (.+?) \(/);
      if (rankMatch && rankMatch[1] !== rankMatch[2]) {
        upgradable.push(rankMatch[3]);
      }
    }
    return { learnable, upgradable };
  }

  async spendSkillPoints() {
    let guard = 0;
    while (this.character.unallocatedSkillPoints > 0 && guard < 10) {
      guard += 1;
      this.lastSkillListText = null;
      await this.act('skill list', 350);
      if (!this.lastSkillListText) break;

      const { learnable, upgradable } = this.parseAvailableSkillNames(this.lastSkillListText);
      const target = learnable[0] ?? upgradable[0];
      if (!target) break;

      const verb = learnable[0] ? 'learn' : 'upgrade';
      await this.act(`skill ${verb} ${target}`, 350);
    }
  }

  async maybeRest() {
    if (this.inCombat) return;
    if (this.hpRatio() >= REST_TRIGGER_HP_RATIO && this.mpRatio() >= REST_TRIGGER_MP_RATIO) return;
    await this.act('rest', 300);
    await this.waitUntil(
      () => this.hpRatio() >= REST_DONE_HP_RATIO && this.mpRatio() >= REST_DONE_MP_RATIO,
      REST_TIMEOUT_MS,
    );
  }

  async lootRoom() {
    for (const item of this.room?.items ?? []) {
      await this.act(`get ${item.name}`, 300);
    }
  }

  async maybeBuyPotion() {
    if (this.findPotion()) return;
    const merchant = (this.room?.npcs ?? []).find(
      (npc) => npc.type === 'merchant' && npc.shopItemNames.some((n) => n.includes('포션') || n.includes('물약')),
    );
    if (!merchant || this.character.gold < 20) return;
    const potionName = merchant.shopItemNames.find((n) => n.includes('포션') || n.includes('물약'));
    await this.act(`buy ${potionName}`, 300);
  }

  avoidKey(mobName) {
    return `${this.room?.id}:${mobName}`;
  }

  pickTarget() {
    const mobs = (this.room?.mobs ?? []).filter((m) => !this.avoidKeys.has(this.avoidKey(m.name)));
    if (mobs.length === 0) return null;
    const safe = mobs.filter((m) => m.level - this.character.level <= SAFE_LEVEL_DIFF);
    if (safe.length > 0) {
      // 같은 안전도 안에서는 레벨이 높은 쪽이 경험치가 더 짭짤하다(computeMobExpReward가 레벨에 비례).
      return safe.reduce((best, m) => (m.level > best.level ? m : best));
    }

    const cautious = mobs.filter((m) => {
      const diff = m.level - this.character.level;
      return (
        diff > SAFE_LEVEL_DIFF &&
        diff <= CAUTIOUS_LEVEL_DIFF &&
        this.hpRatio() >= CAUTIOUS_MIN_HP_RATIO &&
        !hasElementAdvantage(m.element, this.character.element)
      );
    });
    if (cautious.length === 0) return null;
    // 여기서는 리스크가 가장 낮은(레벨차가 가장 작은) 쪽을 고른다 — 안전권 밖이라 위로 밀어붙이지 않는다.
    return cautious.reduce((best, m) => (m.level < best.level ? m : best));
  }

  async fight(mobName) {
    this.logger.event('engage', { mob: mobName });
    await this.act(`attack ${mobName}`, 200);

    const deadline = Date.now() + COMBAT_TIMEOUT_MS;
    let fled = false;
    while (this.inCombat && Date.now() < deadline) {
      await sleep(IDLE_POLL_MS);
      if (!this.character) continue;
      if (this.hpRatio() <= FLEE_HP_RATIO) {
        const potion = this.findPotion();
        if (potion) {
          this.send({ type: 'useItem', inventoryId: potion.inventoryId });
        } else {
          await this.act('flee', 300);
          fled = true;
          break;
        }
      } else if (this.hpRatio() <= POTION_HP_RATIO) {
        const potion = this.findPotion();
        if (potion) this.send({ type: 'useItem', inventoryId: potion.inventoryId });
      }
    }
    if (this.inCombat) {
      // 안전장치: 타임아웃까지 끝나지 않으면(버그로 인한 무한 전투 등) 강제로 빠져나온다.
      await this.act('flee', 300);
      this.logger.event('combat-timeout', { mob: mobName });
      fled = true;
    }
    if (fled) this.avoidKeys.add(this.avoidKey(mobName));
  }

  async wander() {
    const exits = (this.room?.exits ?? []).filter((e) => !e.blocked);
    if (exits.length === 0) return;
    const pick = exits[Math.floor(Math.random() * exits.length)];
    await this.act(pick.direction, 400);
  }

  isDone() {
    return this.character && this.character.level >= this.targetLevel;
  }

  isExpired() {
    return Date.now() >= this.deadlineAt || this.actionsTaken >= MAX_ACTIONS;
  }

  async runLoop() {
    while (!this.isDone() && !this.isExpired()) {
      if (this.inCombat) {
        await sleep(IDLE_POLL_MS);
        continue;
      }
      if (!this.character || !this.room) {
        await sleep(IDLE_POLL_MS);
        continue;
      }

      await this.maybeRest();
      await this.allocateStatPoints();
      await this.spendSkillPoints();
      await this.upgradeEquipment();
      await this.lootRoom();
      await this.maybeBuyPotion();

      const target = this.pickTarget();
      if (target) {
        await this.fight(target.name);
        continue;
      }
      await this.wander();
    }
  }

  summary() {
    return {
      username: this.username,
      job: this.job,
      element: this.element,
      finalLevel: this.character?.level ?? null,
      finalGold: this.character?.gold ?? null,
      deaths: this.deaths,
      actionsTaken: this.actionsTaken,
      reachedTarget: this.isDone(),
    };
  }

  async run() {
    await this.ensureAccount();
    await this.connect();
    this.log(`시작: Lv.${this.character?.level ?? '?'} (목표 Lv.${this.targetLevel})`);
    await this.runLoop();
    const summary = this.summary();
    this.logger.event('summary', summary);
    this.log(`종료: ${JSON.stringify(summary)}`);
    this.ws.close();
    return summary;
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function runOne({ job, element, targetLevel, maxMinutes, runId, usernameOverride }) {
  const username = usernameOverride ?? `qabot_${job}`;
  const session = new PlaybotSession({
    username,
    password: process.env.QA_PLAYBOT_PASSWORD || DEFAULT_PLAYBOT_PASSWORD,
    name: `${username}_ch`,
    job,
    element,
    targetLevel,
    maxMinutes,
    runId,
  });
  return session.run();
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const targetLevel = Number(flags['target-level'] ?? DEFAULT_TARGET_LEVEL);
  const maxMinutes = Number(flags['max-minutes'] ?? DEFAULT_MAX_MINUTES);
  const runId = flags['run-id'] ?? `run-${Date.now()}`;

  const mode = positional[0];
  if (!mode || (!JOBS.includes(mode) && mode !== 'all')) {
    console.log(
      `사용법: node playbot.js <${JOBS.join('|')}|all> [element] [--target-level N] [--username NAME] [--max-minutes N] [--run-id ID]\n` +
        `환경변수 QA_SERVER_URL로 서버 주소를 바꿀 수 있습니다 (기본값 ${SERVER_HTTP}).`,
    );
    process.exit(mode ? 1 : 0);
  }

  console.log(`실행 ID: ${runId} (로그: tools/qa-agent/runs/${runId}/)`);

  if (mode === 'all') {
    const results = [];
    for (const job of JOBS) {
      results.push(await runOne({ job, element: DEFAULT_ELEMENT[job], targetLevel, maxMinutes, runId }));
    }
    console.log('전체 결과:', JSON.stringify(results, null, 2));
    return;
  }

  const job = mode;
  const element = positional[1] ?? DEFAULT_ELEMENT[job];
  const result = await runOne({ job, element, targetLevel, maxMinutes, runId, usernameOverride: flags.username });
  console.log('결과:', JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
