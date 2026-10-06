import type { CommandContext } from './context.js';

export type CommandHandler = (context: CommandContext, argumentsText: string) => void;

export interface CommandDefinition {
  name: string;
  aliases?: readonly string[];
  handle: CommandHandler;
}

/** Build once; extensions add definitions without changing the dispatcher. */
export function createCommandRegistry(definitions: readonly CommandDefinition[]): ReadonlyMap<string, CommandHandler> {
  const handlers = new Map<string, CommandHandler>();
  for (const definition of definitions) {
    for (const name of [definition.name, ...(definition.aliases ?? [])]) {
      const key = name.toLowerCase();
      if (!key || /\s/.test(key)) throw new Error(`Invalid command name: ${name}`);
      if (handlers.has(key)) throw new Error(`Duplicate command name: ${name}`);
      handlers.set(key, definition.handle);
    }
  }
  return handlers;
}
