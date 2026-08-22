import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtmlAttribute } from './domUtils';

describe('escapeHtmlAttribute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('escapes markup and both quote types for quoted HTML attributes', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        let innerHTML = '';
        return {
          get innerHTML() {
            return innerHTML;
          },
          set textContent(value: string) {
            innerHTML = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          },
        };
      },
    });

    expect(escapeHtmlAttribute(`악어\" onerror='attack' <script>`)).toBe(
      '악어&quot; onerror=&#39;attack&#39; &lt;script&gt;',
    );
  });
});
