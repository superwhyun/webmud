import { createRuntime } from './runtime.js';

const port = Number(process.env.PORT ?? 3001);
const runtime = createRuntime();
runtime.httpServer.listen(port, () => {
  console.log(`MUD server listening on http://localhost:${port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n${signal} received, shutting down...`);
  void runtime.close().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
