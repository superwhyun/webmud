import { describe, expect, it } from 'vitest';
import { buildStatAllocationMessage, STAT_MANAGEMENT_ENTRIES, STATS_TAB_STATE_KEYS } from './statsTab';

describe('stat management tab', () => {
  it('lists all six allocatable stats in a stable order', () => {
    expect(STAT_MANAGEMENT_ENTRIES.map(({ key, label }) => [key, label])).toEqual([
      ['str', '힘'],
      ['dex', '민첩'],
      ['int', '지능'],
      ['vit', '체력'],
      ['wis', '지혜'],
      ['luk', '행운'],
    ]);
  });

  it('builds the existing allocateStat protocol message', () => {
    expect(buildStatAllocationMessage('int')).toEqual({ type: 'allocateStat', statKey: 'int', amount: 1 });
  });

  it('refreshes the tab when the job changes because the primary stat badge depends on it', () => {
    expect(STATS_TAB_STATE_KEYS).toContain('job');
  });
});
