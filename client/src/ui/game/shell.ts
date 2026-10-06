import { MAX_INVENTORY_SLOTS } from '@mud/shared';
import { icon } from '../icons';

export function renderShellHtml(isBuilder: boolean, isAdmin: boolean): string {
  return `
    <div class="room-panel" id="room-panel">
      <div class="room-header" id="room-header"></div>
      <div class="room-lower-row">
        <aside class="room-map-dock">
          <div class="room-map-title">지도</div>
          <div class="minimap" id="minimap"></div>
        </aside>
        <div class="room-meta" id="room-meta"></div>
      </div>
      <div id="room-village"></div>
    </div>
    <div class="mob-sprite-row" id="mob-sprite-row"></div>
    <div class="command-input">
      <span class="prompt">&gt;</span>
      <input id="command" type="text" autocomplete="off" autofocus aria-label="명령어 입력" />
    </div>
    <div class="potion-bar" id="potion-bar"></div>
    <div class="combat-panel" id="combat-panel" hidden></div>
    <div class="game-layout">
      <div class="terminal" id="terminal"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-stats" id="sidebar-stats"></div>
        <div class="equipment-panel" id="equipment-panel"></div>
        <div class="cooldown-panel" id="cooldown-panel"></div>
        <div class="buff-panel" id="buff-panel"></div>
      </aside>
      <aside class="inventory-panel" id="inventory-panel">
        <div class="ops-menu-section">
          <div class="ops-menu-title">사용자 메뉴</div>
          <button type="button" id="inventory-button" class="inventory-open-btn">인벤토리 (<span id="inventory-count">0</span>/${MAX_INVENTORY_SLOTS})</button>
          <button type="button" id="equip-swap-button" class="equip-swap-btn">장비 교체</button>
          <button type="button" id="skill-button" class="skill-btn">스킬</button>
          <button type="button" id="macro-button" class="skill-btn">매크로</button>
          <button type="button" id="suggestion-button" class="skill-btn">개선 제안</button>
          <button type="button" id="logout-button" class="logout-btn">로그아웃</button>
        </div>
        ${
          isBuilder
            ? `<div class="ops-menu-section">
                <div class="ops-menu-title">${icon('wrench')} 빌더 메뉴</div>
                <button type="button" id="builder-entry" class="builder-entry-btn">맵 편집기 열기</button>
              </div>`
            : ''
        }
        ${
          isAdmin
            ? `<div class="ops-menu-section">
                <div class="ops-menu-title">${icon('gear')} 어드민 메뉴</div>
                <button type="button" id="admin-entry" class="admin-entry-btn">관리자 패널 열기</button>
              </div>`
            : ''
        }
      </aside>
    </div>
    <div class="modal-overlay" id="character-sheet-modal" hidden>
      <div class="modal-content modal-content-xl character-sheet">
        <div class="modal-header character-sheet-header">
          <div class="character-sheet-tabs" id="character-sheet-tabs"></div>
          <button type="button" id="character-sheet-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="character-sheet-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="job-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>직업 선택</span>
        </div>
        <div class="modal-body" id="job-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="macro-modal" hidden>
      <div class="modal-content">
        <div class="modal-header">
          <span>매크로</span>
          <button type="button" id="macro-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="macro-modal-body"></div>
      </div>
    </div>
    <div class="modal-overlay" id="suggestion-modal" hidden>
      <div class="modal-content modal-content-lg">
        <div class="modal-header">
          <span>개선 제안</span>
          <button type="button" id="suggestion-modal-close" class="modal-close-btn" aria-label="닫기">✕</button>
        </div>
        <div class="modal-body" id="suggestion-modal-body"></div>
      </div>
    </div>
  `;
}
