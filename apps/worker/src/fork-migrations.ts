import sentVia from "../migrations/pk-0001_sent_via.sql";
import personalAgents from "../migrations/pk-0002_personal_agents.sql";
import type { Migration } from "./migrations";

// This fork's own migrations, oldest first, which migrations.ts adds to the end of MIGRATIONS.
// docs/fork-migrations.md says why they're named pk-NNNN and not numbered with Ember's, and what one
// may and may not do. In short: add columns and tables of our own, depend on nothing but what Ember's
// migrations make, and never change one that has been deployed.
export const FORK_MIGRATIONS: Migration[] = [
  { name: "pk-0001_sent_via.sql", scope: "room", sql: sentVia },
  { name: "pk-0002_personal_agents.sql", scope: "workspace", sql: personalAgents },
];
