import { describe, expect, it } from 'vitest';
import { validateMapImportRows } from './mapImportValidation.js';

describe('map import column validation', () => {
  it('accepts known columns and rejects SQL-shaped or inconsistent column names', () => {
    const allowedColumns = new Set(['id', 'name', 'description']);
    expect(validateMapImportRows('zones', [{ id: 1, name: '테스트 존', description: '' }], allowedColumns)).toBeNull();
    expect(
      validateMapImportRows('zones', [{ 'id) VALUES (1); DROP TABLE zones; --': 1 }], allowedColumns),
    ).toContain(
      '허용되지 않은 컬럼',
    );
    expect(
      validateMapImportRows('zones', [{ id: 1, name: 'A' }, { id: 2, description: 'B' }], allowedColumns),
    ).toContain('컬럼 구성이 일치하지 않습니다');
  });
});
