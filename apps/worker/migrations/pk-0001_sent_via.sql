-- The AI app that sent a message as its writer (scope "room" in src/migrations.ts): a connected app's
-- send_message posts as the person who connected it (src/outside/tools.ts), and the room says which app
-- sent it by its name as the app registered it, cut as the connection keeps it. It's a copy, so the
-- message keeps it once the app is disconnected. Other messages have none.
ALTER TABLE messages ADD COLUMN sent_via TEXT;
