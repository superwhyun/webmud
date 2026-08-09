import { exportContent, importContent, type ContentExportDto } from '../../adminApi';
import type { AdminContext } from './context';
import { refreshItems } from './items';
import { refreshMobs } from './mobs';

export function wireBackup(ctx: AdminContext): void {
  ctx.backupExportBtn.addEventListener('click', () => {
    ctx.backupError.textContent = '';
    exportContent(ctx.token)
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mud-content-backup-${data.exportedAt.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        ctx.backupResult.textContent = `${data.items.length}개 아이템, ${data.mobTemplates.length}개 몹, ${data.mobLootPool.length}개 드랍 항목을 내보냈습니다.`;
      })
      .catch((error: unknown) => {
        ctx.backupError.textContent = error instanceof Error ? error.message : '내보내기에 실패했습니다.';
      });
  });

  ctx.backupImportBtn.addEventListener('click', () => {
    ctx.backupError.textContent = '';
    const file = ctx.backupImportFile.files?.[0];
    if (!file) {
      ctx.backupError.textContent = '가져올 파일을 선택하세요.';
      return;
    }
    file
      .text()
      .then((text) => {
        const data = JSON.parse(text) as ContentExportDto;
        return importContent(ctx.token, { items: data.items, mobTemplates: data.mobTemplates, mobLootPool: data.mobLootPool });
      })
      .then((result) => {
        ctx.backupResult.textContent = `${result.itemCount}개 아이템, ${result.mobTemplateCount}개 몹, ${result.lootEntryCount}개 드랍 항목을 가져왔습니다.`;
        ctx.backupImportFile.value = '';
        return Promise.all([refreshItems(ctx), refreshMobs(ctx)]);
      })
      .catch((error: unknown) => {
        ctx.backupError.textContent = error instanceof Error ? error.message : '가져오기 파일을 처리하지 못했습니다.';
      });
  });
}
