-- Personal agents: the agents members make for themselves, kept by the Workspace (scope "workspace" in
-- src/migrations.ts). Each is a bot user, as an administrator's chat bot is, whose owner_id names the
-- person who made it, and answers for it. Administrators' bots, @ember and their AI agents have none.
--
-- A personal agent has no bot_token. Its key's token is kept only as bot_key_digest, its HMAC under
-- SESSION_SECRET (src/bots/personal-agents.ts), so its key is shown once, as it's made or given anew,
-- and a copy of the database opens nothing. bot_key_used_at says when its key last opened the bot API,
-- to within a few minutes. Turning one off deactivates it and forgets its digest, so no key opens
-- anything as it again; its messages stay.
ALTER TABLE users ADD COLUMN owner_id TEXT REFERENCES users (id);
ALTER TABLE users ADD COLUMN bot_key_digest TEXT;
ALTER TABLE users ADD COLUMN bot_key_used_at TEXT;
CREATE INDEX IF NOT EXISTS users_owner ON users (owner_id) WHERE owner_id IS NOT NULL;

-- How many personal agents each person may have at once, which an administrator sets: 0, as every
-- workspace starts, lets nobody make one.
ALTER TABLE accounts ADD COLUMN personal_agents INTEGER NOT NULL DEFAULT 0;
