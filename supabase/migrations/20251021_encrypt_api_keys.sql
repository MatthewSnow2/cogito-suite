-- Migration: Encrypt API Keys in Database
-- Date: 2025-10-21
-- Description: Replace plaintext API key storage with encrypted storage using pgcrypto

-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing api_keys table if it exists (backup data first in production!)
-- In production: Migrate existing data before dropping
DROP TABLE IF EXISTS public.api_keys CASCADE;

-- Create new api_keys table with encryption support
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Store encrypted API key as bytea
  openai_api_key_encrypted BYTEA NOT NULL,

  -- Track encryption version for key rotation
  encryption_version INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Optional: Track last usage
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster user lookups
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_updated_at ON public.api_keys(updated_at);

-- Add comments for documentation
COMMENT ON TABLE public.api_keys IS 'Stores encrypted OpenAI API keys for users';
COMMENT ON COLUMN public.api_keys.openai_api_key_encrypted IS 'Encrypted API key using pgp_sym_encrypt';
COMMENT ON COLUMN public.api_keys.encryption_version IS 'Tracks encryption key version for rotation';

-- Enable Row Level Security
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own API keys
CREATE POLICY "Users can view their own API keys"
ON public.api_keys
FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own API keys
CREATE POLICY "Users can insert their own API keys"
ON public.api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own API keys
CREATE POLICY "Users can update their own API keys"
ON public.api_keys
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own API keys
CREATE POLICY "Users can delete their own API keys"
ON public.api_keys
FOR DELETE
USING (auth.uid() = user_id);

-- Function: Encrypt API key
-- Usage: SELECT encrypt_api_key('sk-...', 'encryption_key');
CREATE OR REPLACE FUNCTION public.encrypt_api_key(
  api_key TEXT,
  encryption_key TEXT
) RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs
  IF api_key IS NULL OR api_key = '' THEN
    RAISE EXCEPTION 'API key cannot be empty';
  END IF;

  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key cannot be empty';
  END IF;

  -- Encrypt using AES (via pgp_sym_encrypt)
  RETURN pgp_sym_encrypt(api_key, encryption_key, 'cipher-algo=aes256');
END;
$$;

-- Function: Decrypt API key
-- Usage: SELECT decrypt_api_key(encrypted_data, 'encryption_key');
CREATE OR REPLACE FUNCTION public.decrypt_api_key(
  encrypted_key BYTEA,
  encryption_key TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs
  IF encrypted_key IS NULL THEN
    RETURN NULL;
  END IF;

  IF encryption_key IS NULL OR encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key cannot be empty';
  END IF;

  -- Decrypt and return as text
  RETURN pgp_sym_decrypt(encrypted_key, encryption_key);
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but return NULL instead of exposing details
    RAISE WARNING 'Decryption failed for user %: %', auth.uid(), SQLERRM;
    RETURN NULL;
END;
$$;

-- Function: Safely store API key (helper for application)
-- This combines encryption and storage in one call
CREATE OR REPLACE FUNCTION public.store_encrypted_api_key(
  p_user_id UUID,
  p_api_key TEXT,
  p_encryption_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted BYTEA;
  v_id UUID;
BEGIN
  -- Validate user matches authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot store API key for another user';
  END IF;

  -- Encrypt the API key
  v_encrypted := public.encrypt_api_key(p_api_key, p_encryption_key);

  -- Insert or update
  INSERT INTO public.api_keys (user_id, openai_api_key_encrypted, encryption_version)
  VALUES (p_user_id, v_encrypted, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET
    openai_api_key_encrypted = EXCLUDED.openai_api_key_encrypted,
    encryption_version = EXCLUDED.encryption_version,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Function: Get decrypted API key for current user
CREATE OR REPLACE FUNCTION public.get_my_api_key(
  p_encryption_key TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted BYTEA;
  v_decrypted TEXT;
BEGIN
  -- Get encrypted key for current user
  SELECT openai_api_key_encrypted INTO v_encrypted
  FROM public.api_keys
  WHERE user_id = auth.uid();

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  -- Decrypt and return
  v_decrypted := public.decrypt_api_key(v_encrypted, p_encryption_key);

  -- Update last used timestamp
  UPDATE public.api_keys
  SET last_used_at = now()
  WHERE user_id = auth.uid();

  RETURN v_decrypted;
END;
$$;

-- Function: Update timestamps automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger: Auto-update updated_at on changes
CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.encrypt_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_encrypted_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_api_key TO authenticated;

-- Grant table permissions (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;

-- Security: Revoke from anon (public) users
REVOKE ALL ON public.api_keys FROM anon;
REVOKE ALL ON FUNCTION public.encrypt_api_key FROM anon;
REVOKE ALL ON FUNCTION public.decrypt_api_key FROM anon;
REVOKE ALL ON FUNCTION public.store_encrypted_api_key FROM anon;
REVOKE ALL ON FUNCTION public.get_my_api_key FROM anon;

-- Add helpful view for debugging (admins only)
CREATE OR REPLACE VIEW admin_api_keys_status AS
SELECT
  id,
  user_id,
  encryption_version,
  created_at,
  updated_at,
  last_used_at,
  CASE
    WHEN openai_api_key_encrypted IS NOT NULL THEN true
    ELSE false
  END as has_encrypted_key,
  length(openai_api_key_encrypted) as encrypted_size_bytes
FROM public.api_keys;

COMMENT ON VIEW admin_api_keys_status IS 'Admin view showing API key status without exposing encrypted data';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✓ API key encryption migration completed successfully';
  RAISE NOTICE '  - pgcrypto extension enabled';
  RAISE NOTICE '  - api_keys table created with encryption';
  RAISE NOTICE '  - RLS policies configured';
  RAISE NOTICE '  - Encryption/decryption functions created';
  RAISE NOTICE '  - Helper functions for secure storage created';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update frontend to use store_encrypted_api_key()';
  RAISE NOTICE '  2. Set VITE_ENCRYPTION_KEY in environment';
  RAISE NOTICE '  3. Test encryption/decryption workflow';
END $$;
