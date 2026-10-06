/** Every member of a protocol union must have a correctly typed handler. */
export type MessageHandlers<Context, Message extends { type: string }> = {
  [Type in Message['type']]: (context: Context, message: Extract<Message, { type: Type }>) => void;
};

export function createMessageDispatcher<Context, Message extends { type: string }>(
  handlers: MessageHandlers<Context, Message>,
): (context: Context, message: Message) => void {
  return (context, message) => {
    // The mapped type guarantees the key/payload relationship; TS loses it at dynamic indexing.
    const handler = handlers[message.type as Message['type']] as (context: Context, message: Message) => void;
    if (Object.hasOwn(handlers, message.type)) handler(context, message);
  };
}
