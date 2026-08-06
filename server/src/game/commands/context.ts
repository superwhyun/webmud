import type { ServerMessage } from '@mud/shared';
import type { Session } from '../sessionRegistry.js';

export interface CommandContext {
  session: Session;
  send: (message: ServerMessage) => void;
}
