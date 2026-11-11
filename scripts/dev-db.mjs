// Local development MongoDB (single-node replica set, data persisted in ./.data/mongo).
// Production uses MongoDB Atlas. Usage: npm run dev:db   -> mongodb://127.0.0.1:27017/?replicaSet=rs0
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';

mkdirSync('.data/mongo', { recursive: true });
const repl = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger', dbName: 'beauty_organic' },
  instanceOpts: [{ port: 27017, dbPath: '.data/mongo', storageEngine: 'wiredTiger' }],
});
console.log('Dev MongoDB ready:', repl.getUri());
const stop = async () => { await repl.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
