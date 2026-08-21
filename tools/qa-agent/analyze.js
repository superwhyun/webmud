#!/usr/bin/env node
/**
 * Summarizes a playbot.js run's JSONL logs into a per-character comparison table —
 * meant to be read by whoever (human or AI agent) writes the balance suggestions,
 * not to judge balance itself.
 *
 * Usage: node analyze.js <runId>
 */
const fs = require('fs');
const path = require('path');

const RUNS_DIR = path.join(__dirname, 'runs');

function readEvents(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function summarizeFile(filePath) {
  const events = readEvents(filePath);
  const username = path.basename(filePath, '.jsonl');

  const levelups = events.filter((e) => e.type === 'levelup');
  const deaths = events.filter((e) => e.type === 'death').length;
  const equips = events.filter((e) => e.type === 'equip').length;
  const engages = events.filter((e) => e.type === 'engage').length;
  const combatTimeouts = events.filter((e) => e.type === 'combat-timeout').length;
  // 내가 attack을 보내서 시작하지 않은 전투(부활 직후 반격 등) — 잦으면 특정 직업이 유독
  // 수동적으로 죽는지(밸런스 신호) 가늠할 실마리가 된다.
  const unsolicitedCombats = events.filter((e) => e.type === 'unsolicited-combat').length;
  const serverErrors = events.filter((e) => e.type === 'server-error');
  const summaryEvent = events.filter((e) => e.type === 'summary').pop();

  const levelTimeline = levelups.map((e) => ({ level: e.level, atMs: e.elapsedMs }));

  return {
    username,
    job: summaryEvent?.job ?? null,
    element: summaryEvent?.element ?? null,
    finalLevel: summaryEvent?.finalLevel ?? levelTimeline.at(-1)?.level ?? 1,
    reachedTarget: summaryEvent?.reachedTarget ?? false,
    finalGold: summaryEvent?.finalGold ?? null,
    deaths,
    engages,
    equips,
    combatTimeouts,
    unsolicitedCombats,
    serverErrorCount: serverErrors.length,
    serverErrorSamples: [...new Set(serverErrors.map((e) => e.text))].slice(0, 5),
    totalElapsedMs: summaryEvent?.elapsedMs ?? levelTimeline.at(-1)?.atMs ?? 0,
    levelTimeline,
  };
}

function msToMin(ms) {
  return (ms / 60_000).toFixed(1);
}

function printTable(rows) {
  const headers = [
    'username',
    'job',
    'element',
    'level',
    'target?',
    'min',
    'deaths',
    'engages',
    'unsolicited',
    'timeouts',
    'equips',
    'gold',
    'errs',
  ];
  const data = rows.map((r) => [
    r.username,
    r.job,
    r.element,
    r.finalLevel,
    r.reachedTarget ? 'yes' : 'no',
    msToMin(r.totalElapsedMs),
    r.deaths,
    r.engages,
    r.unsolicitedCombats,
    r.combatTimeouts,
    r.equips,
    r.finalGold,
    r.serverErrorCount,
  ]);

  const widths = headers.map((h, i) => Math.max(h.length, ...data.map((row) => String(row[i]).length)));
  const formatRow = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');

  console.log(formatRow(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of data) console.log(formatRow(row));
}

function printLevelPace(rows) {
  console.log('\n레벨업 페이스 (분:초, 시작부터 누적 경과시간):');
  for (const row of rows) {
    const pace = row.levelTimeline.map((e) => `Lv${e.level}@${msToMin(e.atMs)}m`).join(' ');
    console.log(`  ${row.username}: ${pace || '(레벨업 없음)'}`);
  }
}

function printErrors(rows) {
  const withErrors = rows.filter((r) => r.serverErrorSamples.length > 0);
  if (withErrors.length === 0) return;
  console.log('\n서버 에러 샘플:');
  for (const row of withErrors) {
    console.log(`  ${row.username}:`);
    for (const sample of row.serverErrorSamples) console.log(`    - ${sample}`);
  }
}

function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.log('사용법: node analyze.js <runId>');
    process.exit(1);
  }

  const runDir = path.join(RUNS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    console.error(`실행 로그를 찾을 수 없습니다: ${runDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(runDir).filter((f) => f.endsWith('.jsonl'));
  const rows = files.map((f) => summarizeFile(path.join(runDir, f)));

  printTable(rows);
  printLevelPace(rows);
  printErrors(rows);
}

main();
