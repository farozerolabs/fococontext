import { migrateToLatest } from "./index.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required to run database migrations.");
  }

  await migrateToLatest(databaseUrl, {
    logger: console,
    serviceName: "migrate",
  });
}

main().catch((error: unknown) => {
  console.error("Failed to run FocoContext database migrations.", error);
  process.exitCode = 1;
});
