CREATE TABLE IF NOT EXISTS "user_refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "session_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_refresh_sessions_token_hash_key"
    ON "user_refresh_sessions"("token_hash");

CREATE INDEX IF NOT EXISTS "user_refresh_sessions_user_id_idx"
    ON "user_refresh_sessions"("user_id");

CREATE INDEX IF NOT EXISTS "user_refresh_sessions_expires_at_idx"
    ON "user_refresh_sessions"("expires_at");

CREATE INDEX IF NOT EXISTS "user_refresh_sessions_revoked_at_idx"
    ON "user_refresh_sessions"("revoked_at");

ALTER TABLE "user_refresh_sessions"
    ADD CONSTRAINT "user_refresh_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
