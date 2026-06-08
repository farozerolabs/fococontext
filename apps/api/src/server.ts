import { loadRuntimeConfig } from "@fococontext/core";
import { createPostgresDatabase, migrateToLatest, seedDefaultIdentity } from "@fococontext/db";

import { createPostgresApiDatabaseMirror } from "./database/api-database-mirror.js";
import {
  apiDatabaseHydratorToken,
  createPostgresApiDatabaseHydrator,
} from "./database/api-database-hydrator.js";
import {
  createPostgresApiKeyResolver,
  upsertEnvBootstrapApiKey,
} from "./auth/persisted-api-key.resolver.js";
import { createPostgresWikiStore } from "./wiki/wiki-store.js";
import { createApiApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig(process.env);
  await migrateToLatest(config.database.url);

  const db = createPostgresDatabase(config.database.url);
  const identity = await seedDefaultIdentity(db, {
    adminUsername: config.admin.username,
  });
  await upsertEnvBootstrapApiKey(db, config.auth.apiKey, identity);
  const app = await createApiApp(config, {
    apiKeyResolver: createPostgresApiKeyResolver(db),
    apiDatabaseMirror: createPostgresApiDatabaseMirror(db, identity),
    apiDatabaseHydratorFactory: (repositories) =>
      createPostgresApiDatabaseHydrator(db, repositories),
    defaultIdentity: identity,
    wikiStore: createPostgresWikiStore(db),
  });
  await app.get(apiDatabaseHydratorToken).refresh();

  await app.listen(config.api.port, "0.0.0.0");
}

main().catch((error: unknown) => {
  console.error("Failed to start FocoContext API server.", error);
  process.exitCode = 1;
});
