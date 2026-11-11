import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../config/db.js';
import '../models/index.js';

let repl: MongoMemoryReplSet | undefined;

/** In-memory single-node replica set (needed for multi-document transactions). */
export async function startTestDb() {
  if (repl) {
    await disconnectDb();
    await repl.stop();
    repl = undefined;
  }

  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDb(repl.getUri());

  // Build indexes / unique constraints for every registered model.
  await Promise.all(
    mongoose.modelNames().map((modelName) => mongoose.model(modelName).init())
  );
}

export async function stopTestDb() {
  await disconnectDb();

  if (repl) {
    await repl.stop();
    repl = undefined;
  }
}

export async function clearDb() {
  await Promise.all(
    mongoose.modelNames().map((modelName) => mongoose.model(modelName).deleteMany({}))
  );
}
