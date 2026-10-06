import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';
import { initializeDatabase } from './migrations/index.js';

/** Opens an isolated database as well as the application's persistent connection. */
export function openDatabase(path: string): Database.Database {
  const target = new Database(path);
  try {
    target.pragma('busy_timeout = 5000');
    target.pragma('journal_mode = WAL');
    target.exec(SCHEMA_SQL);
    initializeDatabase(target);
    return target;
  } catch (error) {
    target.close();
    throw error;
  }
}
