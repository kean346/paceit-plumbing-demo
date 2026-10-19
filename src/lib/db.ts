import "server-only";
import { MongoClient } from "mongodb";
const globalDb = globalThis as unknown as {
  mongoPromise?: Promise<MongoClient>;
};
export async function connection() {
  if (!process.env.MONGODB_URI) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!globalDb.mongoPromise)
    globalDb.mongoPromise = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    })
      .connect()
      .catch((e) => {
        delete globalDb.mongoPromise;
        throw e;
      });
  const client = await globalDb.mongoPromise;
  return {
    client,
    db: client.db(process.env.MONGODB_DB || "paceit_plumbing_demo"),
  };
}
