import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Missing env: MONGODB_URI');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  __mongooseCache?: MongooseCache;
};

const cache: MongooseCache = globalForMongoose.__mongooseCache ?? {
  conn: null,
  promise: null,
};

globalForMongoose.__mongooseCache = cache;

export async function dbConnect() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const options = process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : undefined;
    cache.promise = mongoose
      .connect(MONGODB_URI!, options)
      .then((m) => m);
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
