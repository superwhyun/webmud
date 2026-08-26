type TableRow = Record<string, unknown>;

export function validateMapImportRows(
  table: string,
  rows: TableRow[],
  allowedColumns: ReadonlySet<string>,
): string | null {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return `"${table}" 행에 컬럼이 없습니다.`;
  const unknown = columns.find((column) => !allowedColumns.has(column));
  if (unknown) return `"${table}"에 허용되지 않은 컬럼 "${unknown}"이 있습니다.`;

  const expected = [...columns].sort().join('\u0000');
  for (const row of rows) {
    const rowColumns = Object.keys(row);
    const rowUnknown = rowColumns.find((column) => !allowedColumns.has(column));
    if (rowUnknown) return `"${table}"에 허용되지 않은 컬럼 "${rowUnknown}"이 있습니다.`;
    if ([...rowColumns].sort().join('\u0000') !== expected) {
      return `"${table}" 행들의 컬럼 구성이 일치하지 않습니다.`;
    }
  }
  return null;
}
