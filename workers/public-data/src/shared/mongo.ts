import { Collection, type Document, MongoClient } from 'mongodb';
import { requireEnv } from './env';

let clientPromise: Promise<MongoClient> | null = null;

export async function getMongoClient() {
  if (!clientPromise) {
    clientPromise = MongoClient.connect(requireEnv('MONGODB_URI'));
  }
  return clientPromise;
}

export async function getCollection<T extends Document>(dbName: string, collectionName: string) {
  const client = await getMongoClient();
  return client.db(dbName).collection<T>(collectionName);
}

export async function bulkUpsert<T extends Document>(
  collection: Collection<T>,
  operations: Parameters<Collection<T>['bulkWrite']>[0],
) {
  if (operations.length === 0) return null;
  return collection.bulkWrite(operations, { ordered: false });
}
