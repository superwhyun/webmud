/**
 * Cross-platform icon glyphs. Color emoji (❤️🛠️⚙️👍 etc.) render as completely
 * different artwork on Windows vs macOS because each OS ships its own emoji font.
 * These are plain inline SVGs using currentColor instead, so they look identical
 * everywhere and inherit surrounding text color (grade colors, etc.).
 */
export type IconName =
  | 'heart'
  | 'droplet'
  | 'sparkle'
  | 'gear'
  | 'wrench'
  | 'castle'
  | 'thumbsUp'
  | 'thumbsDown'
  | 'slot-weapon'
  | 'slot-shield'
  | 'slot-hat'
  | 'slot-earring'
  | 'slot-necklace'
  | 'slot-top'
  | 'slot-bottom'
  | 'slot-gloves'
  | 'slot-shoes'
  | 'slot-ring'
  | 'trash';

const ICON_PATHS: Record<IconName, string> = {
  heart:
    '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>',
  droplet:
    '<path d="M12 2.5c-4 5-7 9-7 12.5a7 7 0 0 0 14 0c0-3.5-3-7.5-7-12.5z" fill="currentColor"/>',
  sparkle:
    '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" fill="currentColor"/>',
  gear:
    '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>',
  castle:
    '<path d="M4 21V10h2V7h2v3h2V5h4v5h2V7h2v3h2v11H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  thumbsUp:
    '<path d="M7 11v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3zm2 10h8.5a2 2 0 0 0 1.94-1.51l1.35-5.4A2 2 0 0 0 18.85 12H14l.7-4.2a2 2 0 0 0-3.8-1.1L9 11v10a1 1 0 0 0 1 1z" fill="currentColor"/>',
  thumbsDown:
    '<path d="M17 13V3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3zm-2-10H6.5a2 2 0 0 0-1.94 1.51l-1.35 5.4A2 2 0 0 0 5.15 12H10l-.7 4.2a2 2 0 0 0 3.8 1.1L15 13V3a1 1 0 0 0-1-1z" fill="currentColor"/>',
  'slot-weapon':
    '<line x1="6" y1="18" x2="17" y2="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="15" x2="12" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="18" r="1.6" fill="currentColor"/>',
  'slot-shield':
    '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  'slot-hat':
    '<path d="M12 3l5 12H7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  'slot-earring':
    '<circle cx="12" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 9.4c0 3-2.4 5-2.4 7.6a2.4 2.4 0 0 0 4.8 0c0-2.6-2.4-4.6-2.4-7.6z" fill="currentColor"/>',
  'slot-necklace':
    '<path d="M5 5c0 6 3 9 7 9s7-3 7-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 14l2 2-2 2-2-2z" fill="currentColor"/>',
  'slot-top':
    '<path d="M9 4L4 7v3l2 1v9h12v-9l2-1V7l-5-3-1 2h-4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  'slot-bottom':
    '<path d="M6 3h12l1 8-3 10h-3l-1-9-1 9H8L5 11z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  'slot-gloves':
    '<path d="M8 21v-8a4 4 0 0 1 8 0v8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 13V6a1.5 1.5 0 0 1 3 0v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  'slot-shoes':
    '<path d="M7 3v10l-4 4v2h16l-1-4-6-2V3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  'slot-ring':
    '<circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 8l2 3h-4z" fill="currentColor"/>',
  trash:
    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
};

export function icon(name: IconName, className = ''): string {
  return `<svg class="icon icon-${name} ${className}" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}
