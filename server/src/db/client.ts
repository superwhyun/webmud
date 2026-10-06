import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './connection.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const dbPath = process.env.DB_PATH ?? join(dataDir, 'mud.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

export const db = openDatabase(dbPath);
