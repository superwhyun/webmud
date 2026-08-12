import { db } from './client.js';

export const OPENAI_API_KEY_SETTING_KEY = 'openai_api_key';

export function getAppSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function deleteAppSetting(key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}
