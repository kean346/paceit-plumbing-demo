import { MongoClient } from "mongodb";
// Run explicitly with: npm run db:cleanup (loads .env.local via Node).
async function main() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI");
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    const db = client.db(process.env.MONGODB_DB || "paceit_plumbing_demo");
    const expired = await db
      .collection("workspaces")
      .find({ expiresAt: { $lte: new Date() } }, { projection: { id: 1 } })
      .toArray();
    for (const w of expired) {
      await client.withSession(async (session) =>
        session.withTransaction(async () => {
          const deleted = await db
            .collection("workspaces")
            .deleteOne(
              { id: w.id, expiresAt: { $lte: new Date() } },
              { session },
            );
          if (deleted.deletedCount)
            for (const name of ["customers", "quotes", "catalogue", "activity"])
              await db
                .collection(name)
                .deleteMany({ workspaceId: w.id }, { session });
        }),
      );
    }
    console.log(`Cleaned ${expired.length} expired demo workspaces.`);
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.name : "Cleanup failed");
  process.exitCode = 1;
});
