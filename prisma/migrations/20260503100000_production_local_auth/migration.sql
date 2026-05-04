ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key"
  ON public."User"(username)
  WHERE username IS NOT NULL;

ALTER TABLE public."UserProfile"
  ADD COLUMN IF NOT EXISTS personal_email TEXT,
  ADD COLUMN IF NOT EXISTS personal_email_pending TEXT,
  ADD COLUMN IF NOT EXISTS personal_email_verified_at TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_personal_email_key"
  ON public."UserProfile"(personal_email)
  WHERE personal_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  consumed_at TIMESTAMP(3),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_email_otps_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."User"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_email_otps_user_id_idx ON public.user_email_otps(user_id);
CREATE INDEX IF NOT EXISTS user_email_otps_email_idx ON public.user_email_otps(email);
CREATE INDEX IF NOT EXISTS user_email_otps_purpose_idx ON public.user_email_otps(purpose);
CREATE INDEX IF NOT EXISTS user_email_otps_expires_at_idx ON public.user_email_otps(expires_at);
