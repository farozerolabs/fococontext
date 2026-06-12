import { loadRuntimeConfig } from "@fococontext/core";
import { createPostgresDatabase, seedDefaultIdentity } from "@fococontext/db";

import { createPostgresApiDatabaseMirror } from "./database/api-database-mirror.js";
import { createPostgresOperationalReadStore } from "./database/operational-read-store.js";
import { createPostgresBoundedRetrievalRepository } from "./retrieve/postgres-bounded-retrieval-repository.js";
import {
  createPostgresApiKeyResolver,
  upsertEnvBootstrapApiKey,
} from "./auth/persisted-api-key.resolver.js";
import { createPostgresSecurityAuditStore } from "./security/security-audit.js";
import { createPostgresWikiStore } from "./wiki/wiki-store.js";
import { createApiApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig(process.env);

  const db = createPostgresDatabase(config.database.url);
  const identity = await seedDefaultIdentity(db, {
    adminUsername: config.admin.username,
  });
  await upsertEnvBootstrapApiKey(db, config.auth.apiKey, identity);
  const app = await createApiApp(config, {
    apiKeyResolver: createPostgresApiKeyResolver(db),
    apiDatabaseMirror: createPostgresApiDatabaseMirror(db, identity),
    boundedRetrievalRepository: createPostgresBoundedRetrievalRepository(db),
    operationalReadStore: createPostgresOperationalReadStore(db),
    securityAuditStore: createPostgresSecurityAuditStore(db),
    defaultIdentity: identity,
    wikiStore: createPostgresWikiStore(db),
  });

  await app.listen(config.api.port, "0.0.0.0");
}

main().catch((error: unknown) => {
  console.error("Failed to start FocoContext API server.", error);
  process.exitCode = 1;
});
