/** Command names and aliases are shared by dispatch and client completion. */
export const COMMAND_ALIASES = {
  look: ['l'],
  help: [],
  say: [],
  shout: [],
  tell: [],
  who: [],
  attack: ['공격'],
  flee: ['도망'],
  rest: ['휴식'],
  get: [],
  drop: [],
  give: [],
  examine: ['ex'],
  consider: ['con'],
  inventory: ['inv'],
  equip: [],
  use: [],
  shop: [],
  buy: [],
  sell: [],
  village: [],
  travel: [],
  leave: [],
  enter: ['e', '입장'],
  raid: [],
  stat: [],
  skill: [],
  cast: ['마법'],
} as const;

export type CommandName = keyof typeof COMMAND_ALIASES;
export const COMMAND_NAMES = Object.keys(COMMAND_ALIASES) as CommandName[];
export const COMMAND_VERBS: readonly string[] = COMMAND_NAMES.flatMap((name) => [name, ...COMMAND_ALIASES[name]]);
