import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../config/db.js';
import '../models/index.js';

let repl: MongoMemoryReplSet | undefined;

/** In-memory single-node replica set (needed for multi-document transactions). */
export async function startTestDb() {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDb(repl.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build indexes (unique constraints)
}

export async function stopTestDb() {
  await disconnectDb();
  await repl?.stop();
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
}
