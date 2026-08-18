#!/usr/bin/env node
/**
 * Thin scriptable client for driving a real game session over HTTP + WebSocket,
 * one Bash-tool-friendly invocation at a time — no browser needed. Meant to be
 * driven by an AI agent turn-by-turn (see tools/qa-agent/README.md): the agent
 * decides what to try next, calls `send`, reads the JSON reply, and repeats.
 *
 * Each `send`/`raw` call opens its own WebSocket, authenticates, does one
 * thing, and closes — there's no long-lived process, so session continuity
 * is just "same username = same character", not a persistent connection.
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const SERVER_HTTP = process.env.QA_SERVER_URL || 'http://localhost:3001';
const SERVER_WS = SERVER_HTTP.replace(/^http/, 'ws') + '/ws';
const SESSIONS_DIR = path.join(__dirname, '.sessions');
const DEFAULT_TIMEOUT_MS = 1200;

function sessionPath(username) {
  return path.join(SESSIONS_DIR, `${username}.json`);
}

function loadSession(username) {
  const file = sessionPath(username);
  if (!fs.existsSync(file)) {
    throw new Error(`"${username}" 세션이 없습니다. 먼저 register 또는 login을 실행하세요.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveSession(username, data) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(sessionPath(username), JSON.stringify(data, null, 2));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${SERVER_HTTP}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message = (body && body.error) || `요청 실패 (상태 코드 ${response.status})`;
    throw new Error(message);
  }
  return body;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/** ws 연결을 열고 인증한 뒤 하나 이상의 메시지를 보내고, timeoutMs 동안 들어오는 서버 메시지를 모두 모아 반환한다. */
function withSession(token, messages, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_WS);
    const received = [];
    let settled = false;

    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      if (error) reject(error);
      else resolve(result);
    };

    const timer = setTimeout(() => finish(received), timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
      for (const message of messages) ws.send(JSON.stringify(message));
    });
    ws.on('message', (raw) => {
      try {
        received.push(JSON.parse(raw.toString()));
      } catch {
        received.push({ type: 'text', text: raw.toString() });
      }
    });
    ws.on('error', (error) => finish(received, error));
  });
}

async function cmdRegister(username, password) {
  const { token } = await apiRequest('/register', { method: 'POST', body: JSON.stringify({ username, password }) });
  saveSession(username, { token });
  console.log(JSON.stringify({ ok: true, username, token }, null, 2));
}

async function cmdLogin(username, password) {
  const { token } = await apiRequest('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  saveSession(username, { token });
  console.log(JSON.stringify({ ok: true, username, token }, null, 2));
}

async function cmdMe(username) {
  const { token } = loadSession(username);
  const me = await apiRequest('/me', { headers: authHeader(token) });
  console.log(JSON.stringify(me, null, 2));
}

async function cmdCreateCharacter(username, name, element, job) {
  const { token } = loadSession(username);
  const result = await apiRequest('/character', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ name, element, job }),
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdSend(username, text, timeoutMs) {
  const { token } = loadSession(username);
  const messages = await withSession(token, [{ type: 'command', text }], timeoutMs ?? DEFAULT_TIMEOUT_MS);
  console.log(JSON.stringify(messages, null, 2));
}

async function cmdRaw(username, jsonMessage, timeoutMs) {
  const { token } = loadSession(username);
  const message = JSON.parse(jsonMessage);
  const messages = await withSession(token, [message], timeoutMs ?? DEFAULT_TIMEOUT_MS);
  console.log(JSON.stringify(messages, null, 2));
}

async function cmdSuggest(username, title, content) {
  const { token } = loadSession(username);
  const result = await apiRequest('/suggestions', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ title, content }),
  });
  console.log(JSON.stringify(result, null, 2));
}

const USAGE = `사용법: node qa-client.js <명령> [인자...]

  register <username> <password>                 계정 생성 + 세션 저장
  login <username> <password>                     로그인 + 세션 저장
  me <username>                                    계정/캐릭터 요약 조회
  create-character <username> <name> <element> <job>   캐릭터 생성 (element: wood/fire/earth/metal/water, job: warrior/rogue/mage/priest)
  send <username> "<명령어 텍스트>" [timeoutMs]     ws로 접속해 텍스트 명령 하나 보내고 응답 수집 (예: "attack 고블린", "north", "look")
  raw <username> '<JSON ClientMessage>' [timeoutMs] 텍스트 명령으로 안 되는 전용 메시지(useItem 등) 전송
  suggest <username> "<제목>" "<내용>"              발견한 문제를 제안 게시판에 등록

환경변수 QA_SERVER_URL로 서버 주소를 바꿀 수 있습니다 (기본값 http://localhost:3001).
`;

async function main() {
  const [, , command, ...args] = process.argv;
  switch (command) {
    case 'register':
      return cmdRegister(args[0], args[1]);
    case 'login':
      return cmdLogin(args[0], args[1]);
    case 'me':
      return cmdMe(args[0]);
    case 'create-character':
      return cmdCreateCharacter(args[0], args[1], args[2], args[3]);
    case 'send':
      return cmdSend(args[0], args[1], args[2] ? Number(args[2]) : undefined);
    case 'raw':
      return cmdRaw(args[0], args[1], args[2] ? Number(args[2]) : undefined);
    case 'suggest':
      return cmdSuggest(args[0], args[1], args[2]);
    default:
      console.log(USAGE);
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
