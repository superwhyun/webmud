import { Router } from 'express';
import { z } from 'zod';
import { ELEMENT_VALUES, JOB_BASE_STATS, JOB_VALUES } from '@mud/shared';
import { STARTING_ROOM_ID } from '../db/seed/index.js';
import { db } from '../db/client.js';
import type { CharacterWithRoomRow } from '../db/types.js';
import { type AuthedRequest, requireAuth } from './middleware.js';
import { signToken } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';

export const authRouter = Router();

const START_PHYSICAL_DEFENSE = 2;
const START_MAGIC_DEFENSE = 2;

const credentialsSchema = z.object({
  username: z
    .string()
    .min(3, '아이디는 3자 이상이어야 합니다.')
    .max(20, '아이디는 20자 이하여야 합니다.')
    .regex(/^[a-zA-Z0-9_]+$/, '아이디는 영문/숫자/밑줄만 사용할 수 있습니다.'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다.').max(100),
});

const characterSchema = z.object({
  name: z
    .string()
    .min(2, '캐릭터 이름은 2자 이상이어야 합니다.')
    .max(20, '캐릭터 이름은 20자 이하여야 합니다.')
    .regex(/^[a-zA-Z0-9_가-힣]+$/, '캐릭터 이름에 허용되지 않는 문자가 있습니다.'),
  element: z.enum(ELEMENT_VALUES as [string, ...string[]], {
    message: '속성을 선택해주세요.',
  }),
  job: z.enum(JOB_VALUES as [string, ...string[]], {
    message: '직업을 선택해주세요.',
  }),
});

function findCharacterByAccountId(accountId: number): CharacterWithRoomRow | undefined {
  return db
    .prepare(
      `SELECT c.*, r.name as room_name FROM characters c
       JOIN rooms r ON r.id = c.room_id
       WHERE c.account_id = ?`,
    )
    .get(accountId) as CharacterWithRoomRow | undefined;
}

authRouter.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { username, password } = parsed.data;

  const existing = db.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
  if (existing) {
    res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const info = db
    .prepare('INSERT INTO accounts (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  const token = signToken({ accountId: Number(info.lastInsertRowid), username });
  res.status(201).json({ token });
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { username, password } = parsed.data;

  const account = db
    .prepare('SELECT id, password_hash FROM accounts WHERE username = ?')
    .get(username) as { id: number; password_hash: string } | undefined;

  const valid = account ? await verifyPassword(password, account.password_hash) : false;
  if (!account || !valid) {
    res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    return;
  }

  const token = signToken({ accountId: account.id, username });
  res.json({ token });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  const character = findCharacterByAccountId(req.accountId!);
  const account = db.prepare('SELECT is_builder, is_admin FROM accounts WHERE id = ?').get(req.accountId) as
    | { is_builder: number; is_admin: number }
    | undefined;
  res.json({
    username: req.username,
    character: character ?? null,
    isBuilder: Boolean(account?.is_builder),
    isAdmin: Boolean(account?.is_admin),
  });
});

authRouter.post('/character', requireAuth, (req: AuthedRequest, res) => {
  const parsed = characterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  if (findCharacterByAccountId(req.accountId!)) {
    res.status(409).json({ error: '이미 캐릭터가 존재합니다.' });
    return;
  }

  const nameTaken = db.prepare('SELECT id FROM characters WHERE name = ?').get(parsed.data.name);
  if (nameTaken) {
    res.status(409).json({ error: '이미 사용 중인 캐릭터 이름입니다.' });
    return;
  }

  const job = parsed.data.job as keyof typeof JOB_BASE_STATS;
  const baseStats = JOB_BASE_STATS[job];

  db.prepare(
    `INSERT INTO characters (
       account_id, name, room_id, hp, max_hp, mp, max_mp, job,
       strength, dexterity, intelligence, vitality, wisdom, luck,
       physical_defense, magic_defense, element
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    req.accountId,
    parsed.data.name,
    STARTING_ROOM_ID,
    baseStats.hp,
    baseStats.hp,
    baseStats.mp,
    baseStats.mp,
    job,
    baseStats.strength,
    baseStats.dexterity,
    baseStats.intelligence,
    baseStats.vitality,
    baseStats.wisdom,
    baseStats.luck,
    START_PHYSICAL_DEFENSE,
    START_MAGIC_DEFENSE,
    parsed.data.element,
  );

  res.status(201).json({ character: findCharacterByAccountId(req.accountId!) });
});
