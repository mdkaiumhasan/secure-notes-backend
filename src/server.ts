import mongoose from 'mongoose';
import { app } from './app';
import { config } from './config';

async function main() {
  await mongoose.connect(config.MONGODB_URI);
  const server = app.listen(config.PORT, '0.0.0.0', () => console.log(`API listening on :${config.PORT}`));

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error('Failed to start server', err); process.exit(1); });
