#!/usr/bin/env node
// Kills any process still bound to this project's dev ports (server 3001, client 5173).
// Run automatically before `npm run dev` because Ctrl+C doesn't reliably reach the
// tsx watch child through the nested npm/concurrently process chain, leaving orphans
// that block the next `npm run dev` with EADDRINUSE.
// Implemented in Node (not a shell script) so it works on both macOS/Linux and Windows.

const { execSync } = require('node:child_process');

const PORTS = [3001, 5173];
const isWindows = process.platform === 'win32';

function findPidsWindows(port) {
  let output;
  try {
    output = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const [, localAddr, , state, pid] = parts;
    if (state !== 'LISTENING') continue;
    if (!localAddr.endsWith(`:${port}`)) continue;
    if (pid && pid !== '0') pids.add(pid);
  }
  return [...pids];
}

function findPidsUnix(port) {
  try {
    const output = execSync(`lsof -ti "tcp:${port}" -sTCP:LISTEN`, { encoding: 'utf8' });
    return output.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

for (const port of PORTS) {
  const pids = isWindows ? findPidsWindows(port) : findPidsUnix(port);
  if (pids.length === 0) continue;
  console.log(`predev: killing stale process on port ${port} (${pids.join(', ')})`);
  for (const pid of pids) {
    try {
      if (isWindows) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
    } catch {
      // process may have already exited
    }
  }
}
