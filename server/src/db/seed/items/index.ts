import type { ItemSeed } from '../types.js';
import { LOW_ITEMS } from './low.js';
import { MID_ITEMS } from './mid.js';
import { HIGH_ITEMS } from './high.js';
import { RARE_ITEMS } from './rare.js';
import { LEGEND_ITEMS } from './legend.js';
import { EPIC_ITEMS } from './epic.js';

export const ITEMS: ItemSeed[] = [...LOW_ITEMS, ...MID_ITEMS, ...HIGH_ITEMS, ...RARE_ITEMS, ...LEGEND_ITEMS, ...EPIC_ITEMS];
