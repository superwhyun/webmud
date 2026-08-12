import { z } from 'zod';
import { db } from '../db/client.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { suggestionsRouter } from './router.js';

const PAGE_SIZE = 10;

interface SuggestionRow {
  id: number;
  account_id: number;
  author_name: string;
  title: string;
  content: string;
  created_at: string;
  up_count: number;
  down_count: number;
  my_vote: string | null;
}

function toSuggestionDto(row: SuggestionRow, requesterAccountId?: number) {
  return {
    id: row.id,
    authorName: row.author_name,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    upCount: row.up_count,
    downCount: row.down_count,
    myVote: row.my_vote as 'up' | 'down' | null,
    isOwner: row.account_id === requesterAccountId,
  };
}

const suggestionsQuery = `
  SELECT s.id, s.account_id, s.author_name, s.title, s.content, s.created_at,
    (SELECT COUNT(*) FROM suggestion_votes v WHERE v.suggestion_id = s.id AND v.vote = 'up') as up_count,
    (SELECT COUNT(*) FROM suggestion_votes v WHERE v.suggestion_id = s.id AND v.vote = 'down') as down_count,
    (SELECT vote FROM suggestion_votes v WHERE v.suggestion_id = s.id AND v.account_id = ?) as my_vote
  FROM suggestions s
`;

function findOwnedSuggestion(id: number, accountId: number | undefined): { ok: true } | { ok: false; status: number; error: string } {
  const existing = db.prepare('SELECT account_id FROM suggestions WHERE id = ?').get(id) as
    | { account_id: number }
    | undefined;
  if (!existing) return { ok: false, status: 404, error: '제안을 찾을 수 없습니다.' };
  if (existing.account_id !== accountId) return { ok: false, status: 403, error: '본인이 작성한 제안만 처리할 수 있습니다.' };
  return { ok: true };
}

suggestionsRouter.get('/', (req: AuthedRequest, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { count: total } = db.prepare('SELECT COUNT(*) as count FROM suggestions').get() as { count: number };
  const rows = db
    .prepare(`${suggestionsQuery} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`)
    .all(req.accountId, PAGE_SIZE, offset) as SuggestionRow[];

  res.json({ suggestions: rows.map((row) => toSuggestionDto(row, req.accountId)), total, page, pageSize: PAGE_SIZE });
});

const suggestionInputSchema = z.object({
  title: z.string().min(1, '제목을 입력하세요.').max(50, '제목은 50자 이하여야 합니다.'),
  content: z.string().min(1, '내용을 입력하세요.').max(1000, '내용은 1000자 이하여야 합니다.'),
});

suggestionsRouter.post('/', (req: AuthedRequest, res) => {
  const parsed = suggestionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const result = db
    .prepare('INSERT INTO suggestions (account_id, author_name, title, content) VALUES (?, ?, ?, ?)')
    .run(req.accountId, req.username, parsed.data.title, parsed.data.content);

  const row = db
    .prepare(`${suggestionsQuery} WHERE s.id = ?`)
    .get(req.accountId, result.lastInsertRowid) as SuggestionRow;
  res.status(201).json({ suggestion: toSuggestionDto(row, req.accountId) });
});

suggestionsRouter.patch('/:id', (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const owned = findOwnedSuggestion(id, req.accountId);
  if (!owned.ok) {
    res.status(owned.status).json({ error: owned.error });
    return;
  }

  const parsed = suggestionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  db.prepare('UPDATE suggestions SET title = ?, content = ? WHERE id = ?').run(parsed.data.title, parsed.data.content, id);
  const row = db.prepare(`${suggestionsQuery} WHERE s.id = ?`).get(req.accountId, id) as SuggestionRow;
  res.json({ suggestion: toSuggestionDto(row, req.accountId) });
});

suggestionsRouter.delete('/:id', (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const owned = findOwnedSuggestion(id, req.accountId);
  if (!owned.ok) {
    res.status(owned.status).json({ error: owned.error });
    return;
  }

  db.prepare('DELETE FROM suggestion_votes WHERE suggestion_id = ?').run(id);
  db.prepare('DELETE FROM suggestions WHERE id = ?').run(id);
  res.status(204).send();
});

const voteSchema = z.object({
  vote: z.enum(['up', 'down']),
});

suggestionsRouter.post('/:id/vote', (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM suggestions WHERE id = ?').get(id)) {
    res.status(404).json({ error: '제안을 찾을 수 없습니다.' });
    return;
  }

  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const existing = db
    .prepare('SELECT vote FROM suggestion_votes WHERE suggestion_id = ? AND account_id = ?')
    .get(id, req.accountId) as { vote: string } | undefined;

  if (existing?.vote === parsed.data.vote) {
    db.prepare('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND account_id = ?').run(id, req.accountId);
  } else if (existing) {
    db.prepare('UPDATE suggestion_votes SET vote = ? WHERE suggestion_id = ? AND account_id = ?').run(
      parsed.data.vote,
      id,
      req.accountId,
    );
  } else {
    db.prepare('INSERT INTO suggestion_votes (suggestion_id, account_id, vote) VALUES (?, ?, ?)').run(
      id,
      req.accountId,
      parsed.data.vote,
    );
  }

  const row = db.prepare(`${suggestionsQuery} WHERE s.id = ?`).get(req.accountId, id) as SuggestionRow;
  res.json({ suggestion: toSuggestionDto(row, req.accountId) });
});
