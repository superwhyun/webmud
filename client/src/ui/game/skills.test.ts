import { describe, expect, it } from 'vitest';
import type { ElementType } from '@mud/shared';
import { fillElementSkillSlots, orderElementPages } from './skills';

describe('skill element drawer', () => {
  it('places the character element first and keeps the other four in their canonical order', () => {
    const elements: ElementType[] = ['wood', 'fire', 'earth', 'metal', 'water'];

    expect(orderElementPages(elements, 'earth')).toEqual(['earth', 'wood', 'fire', 'metal', 'water']);
    expect(elements).toEqual(['wood', 'fire', 'earth', 'metal', 'water']);
  });

  it('keeps an eight-slot 2-column by 4-row element grid while skills are still being added', () => {
    const skills = ['첫째', '둘째', '셋째'];

    expect(fillElementSkillSlots(skills)).toEqual(['첫째', '둘째', '셋째', null, null, null, null, null]);
    expect(skills).toEqual(['첫째', '둘째', '셋째']);
  });
});
