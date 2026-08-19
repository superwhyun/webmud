/// <reference types="node" />

import { ELEMENT_VALUES, JOB_VALUES } from '@mud/shared';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ELEMENT_SKILL_ART, JOB_SKILL_ART, skillArtPath } from './skillAssets';

describe('skill artwork', () => {
  it('provides one crest for every job', () => {
    expect(Object.keys(JOB_SKILL_ART).sort()).toEqual([...JOB_VALUES].sort());
    expect(Object.values(JOB_SKILL_ART).every((path) => /^\/skills\/job-[a-z]+\.png$/.test(path))).toBe(true);
  });

  it('provides one crest for every element', () => {
    expect(Object.keys(ELEMENT_SKILL_ART).sort()).toEqual([...ELEMENT_VALUES].sort());
    expect(Object.values(ELEMENT_SKILL_ART).every((path) => /^\/skills\/element-[a-z]+\.png$/.test(path))).toBe(true);
  });

  it('uses the job crest for common skills and the element crest for branches', () => {
    expect(skillArtPath({ job: 'warrior' })).toBe(JOB_SKILL_ART.warrior);
    expect(skillArtPath({ job: 'warrior', element: 'fire' })).toBe(ELEMENT_SKILL_ART.fire);
  });

  it('ships every mapped crest in the public directory', () => {
    const publicDirectory = fileURLToPath(new URL('../../../public', import.meta.url));
    const paths = [...Object.values(JOB_SKILL_ART), ...Object.values(ELEMENT_SKILL_ART)];

    expect(paths.every((path) => existsSync(`${publicDirectory}${path}`))).toBe(true);
  });
});
