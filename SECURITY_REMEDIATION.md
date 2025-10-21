# COGITO-SUITE SECURITY REMEDIATION GUIDE

**CRITICAL: Execute these steps in order. DO NOT SKIP STEPS.**

## ⚠️ EMERGENCY: Rotate Credentials First

### Step 1: Rotate Supabase Credentials (5 minutes)

**IMPORTANT: Do this BEFORE fixing code to prevent race condition where old keys still work**

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/jmhfaqlxketpqrxvuejv/settings/api

2. **Generate New Anon Key:**
   - Click "Rotate Keys" → "Anon Key"
   - Copy the NEW key (starts with `eyJhbGciOiJIUzI1NiI...`)
   - Save it securely (we'll need it in Step 2)

3. **Verify Old Key is Revoked:**
   - Try using old key in Postman/curl - should return 401
   - Old key in git history is now useless ✓

4. **Update Edge Function Environment Variables:**
   - Dashboard → Edge Functions → Settings
   - Update `SUPABASE_SERVICE_ROLE_KEY` if needed
   - Click "Save"

**Why do this first?** Once rotated, the exposed keys in git become useless immediately.

---

## 🔧 Phase 1: Fix Code and Git History (30 minutes)

### Step 2: Add .env to .gitignore

```bash
cd /workspace/cogito-suite

# Add to .gitignore
cat >> .gitignore << 'EOF'

# Environment variables - NEVER COMMIT
.env
.env.local
.env.production
.env.development
*.env
!.env.example

# Supabase
supabase/.temp/
EOF
```

### Step 3: Create .env.example Template

```bash
cat > .env.example << 'EOF'
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# IMPORTANT:
# 1. Copy this file to .env
# 2. Replace with your actual credentials
# 3. NEVER commit .env to git
EOF
```

### Step 4: Update client.ts to Use Environment Variables

**File:** `src/integrations/supabase/client.ts`

Replace lines 5-11 with:

```typescript
// Load from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please copy .env.example to .env and add your credentials.'
  );
}

// Remove debug logging in production
if (import.meta.env.DEV) {
  console.log('Supabase configured for project:', SUPABASE_URL.split('.')[0].split('//')[1]);
}
```

### Step 5: Update .env with NEW Credentials

```bash
# Use the NEW rotated key from Step 1
cat > .env << 'EOF'
VITE_SUPABASE_URL=https://jmhfaqlxketpqrxvuejv.supabase.co
VITE_SUPABASE_ANON_KEY=<PASTE_NEW_KEY_FROM_STEP_1_HERE>
EOF
```

### Step 6: Remove .env from Git History

**WARNING: This rewrites git history. Coordinate with team first.**

```bash
# Option A: Using git-filter-repo (recommended, faster)
# Install: pip install git-filter-repo
git filter-repo --path .env --invert-paths --force

# Option B: Using BFG Repo-Cleaner (if Option A not available)
# Download from: https://rtyley.github.io/bfg-repo-cleaner/
# java -jar bfg.jar --delete-files .env

# Option C: Using git filter-branch (slower, built-in)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (WARNING: Destructive operation)
git push origin --force --all
git push origin --force --tags
```

### Step 7: Verify Clean Git History

```bash
# Ensure .env is gone from all commits
git log --all --full-history -- .env
# Should return: (nothing)

# Check current files
git status
# .env should be untracked (not staged)
```

---

## 🔐 Phase 2: Implement API Key Encryption (60 minutes)

### Step 8: Create pgcrypto Extension Migration

**File:** `supabase/migrations/20251021_encrypt_api_keys.sql`

```sql
-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create encrypted API keys table (replaces old table)
DROP TABLE IF EXISTS public.api_keys CASCADE;

CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Store encrypted API key
  openai_api_key_encrypted BYTEA NOT NULL,

  -- Store encryption key ID (for key rotation)
  encryption_version INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own API keys"
ON public.api_keys
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys"
ON public.api_keys
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys"
ON public.api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
ON public.api_keys
FOR DELETE
USING (auth.uid() = user_id);

-- Function to encrypt API key
CREATE OR REPLACE FUNCTION encrypt_api_key(
  api_key TEXT,
  encryption_key TEXT
) RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(api_key, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt API key
CREATE OR REPLACE FUNCTION decrypt_api_key(
  encrypted_key BYTEA,
  encryption_key TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted_key, encryption_key);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL; -- Return NULL on decryption failure
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION encrypt_api_key TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_api_key TO authenticated;
```

### Step 9: Apply Migration

```bash
cd /workspace/cogito-suite

# Apply migration to local Supabase
npx supabase db push

# Or apply to remote (after testing locally)
npx supabase db push --db-url "postgresql://postgres:[password]@db.jmhfaqlxketpqrxvuejv.supabase.co:5432/postgres"
```

### Step 10: Update Frontend to Use Encryption

**File:** `src/lib/supabase-encryption.ts` (NEW FILE)

```typescript
/**
 * Supabase API Key Encryption Utilities
 */

import { supabase } from '@/integrations/supabase/client';

const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn('VITE_ENCRYPTION_KEY not set. API key encryption disabled.');
}

/**
 * Save encrypted OpenAI API key for current user
 */
export async function saveEncryptedApiKey(apiKey: string): Promise<void> {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Encrypt on the client side before sending
  const { data, error } = await supabase.rpc('encrypt_api_key', {
    api_key: apiKey,
    encryption_key: ENCRYPTION_KEY
  });

  if (error) throw error;

  // Store encrypted key
  const { error: insertError } = await supabase
    .from('api_keys')
    .upsert({
      user_id: user.id,
      openai_api_key_encrypted: data,
      encryption_version: 1
    });

  if (insertError) throw insertError;
}

/**
 * Retrieve and decrypt OpenAI API key for current user
 */
export async function getDecryptedApiKey(): Promise<string | null> {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: keyData, error } = await supabase
    .from('api_keys')
    .select('openai_api_key_encrypted')
    .eq('user_id', user.id)
    .single();

  if (error || !keyData) return null;

  // Decrypt
  const { data: decrypted, error: decryptError } = await supabase.rpc('decrypt_api_key', {
    encrypted_key: keyData.openai_api_key_encrypted,
    encryption_key: ENCRYPTION_KEY
  });

  if (decryptError) {
    console.error('Decryption failed:', decryptError);
    return null;
  }

  return decrypted;
}

/**
 * Delete API key for current user
 */
export async function deleteApiKey(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('user_id', user.id);

  if (error) throw error;
}
```

### Step 11: Generate and Store Encryption Key

```bash
# Generate a strong encryption key (keep this VERY secure)
openssl rand -base64 32

# Add to .env (NEVER commit this)
echo "VITE_ENCRYPTION_KEY=<generated_key_here>" >> .env

# Add to .env.example (with placeholder)
echo "VITE_ENCRYPTION_KEY=your-32-byte-encryption-key-here" >> .env.example

# Store in Supabase Edge Functions environment
# Dashboard → Edge Functions → Settings → Environment Variables
# Add: ENCRYPTION_KEY = <same_key>
```

---

## 🔒 Phase 3: Fix CORS Configuration (15 minutes)

### Step 12: Update Edge Function CORS Headers

**File:** `supabase/functions/generate-response/index.ts`

Replace lines 11-14 with:

```typescript
// Whitelist specific origins
const ALLOWED_ORIGINS = [
  'http://localhost:5173',  // Development
  'http://localhost:3000',  // Alternative dev port
  'https://your-production-domain.com',  // Production
  'https://your-staging-domain.com'  // Staging (if applicable)
];

const corsHeaders = (origin: string | null) => {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
};
```

Update request handler:

```typescript
serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    // ... rest of code ...

    return new Response(JSON.stringify(result), {
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
});
```

### Step 13: Apply CORS Fix to All Edge Functions

Repeat Step 12 for:
- `supabase/functions/process-pdf/index.ts`
- `supabase/functions/purge-vectors/index.ts`
- `supabase/functions/reset-knowledge/index.ts`

Or create a shared CORS utility:

**File:** `supabase/functions/_shared/cors.ts`

```typescript
export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://your-production-domain.com'
];

export function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}
```

Then import in each function:
```typescript
import { getCorsHeaders } from '../_shared/cors.ts';
```

---

## ✅ Phase 4: Verification & Testing (30 minutes)

### Step 14: Test Environment Variable Loading

```bash
cd /workspace/cogito-suite

# Start dev server
npm run dev

# Check console - should NOT see hardcoded credentials
# Should see: "Supabase configured for project: jmhfaqlxketpqrxvuejv"
```

### Step 15: Test API Key Encryption

```typescript
// In browser console:
import { saveEncryptedApiKey, getDecryptedApiKey } from '@/lib/supabase-encryption';

// Test encryption
await saveEncryptedApiKey('sk-test-key-123456789');

// Test decryption
const key = await getDecryptedApiKey();
console.log('Decrypted key:', key); // Should be: sk-test-key-123456789
```

### Step 16: Test CORS Protection

```bash
# Test from allowed origin (should work)
curl -X POST https://jmhfaqlxketpqrxvuejv.supabase.co/functions/v1/generate-response \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'

# Test from disallowed origin (should fail or get default origin)
curl -X POST https://jmhfaqlxketpqrxvuejv.supabase.co/functions/v1/generate-response \
  -H "Origin: https://evil-site.com" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

### Step 17: Security Checklist

```markdown
- [ ] New Supabase anon key generated and working
- [ ] Old key confirmed revoked (test returns 401)
- [ ] .env added to .gitignore
- [ ] .env removed from git history (verified with git log)
- [ ] client.ts uses environment variables
- [ ] No console.log of credentials in production
- [ ] API keys encrypted in database (check pgAdmin)
- [ ] CORS only allows whitelisted origins
- [ ] All 4 edge functions updated with new CORS
- [ ] Encryption key stored securely (not in git)
- [ ] .env.example created with placeholders
- [ ] Team notified of .env requirement
- [ ] Documentation updated
```

---

## 🚀 Deployment Checklist

### Production Environment Setup

```bash
# 1. Set environment variables in production hosting
# Vercel: Dashboard → Settings → Environment Variables
# Netlify: Dashboard → Site Settings → Build & Deploy → Environment

VITE_SUPABASE_URL=https://jmhfaqlxketpqrxvuejv.supabase.co
VITE_SUPABASE_ANON_KEY=<NEW_ROTATED_KEY>
VITE_ENCRYPTION_KEY=<32_BYTE_KEY>

# 2. Update Supabase Edge Functions environment
# Dashboard → Edge Functions → Settings
ENCRYPTION_KEY=<SAME_32_BYTE_KEY>

# 3. Deploy
npm run build
# Deploy to your hosting platform
```

---

## 📚 Additional Security Enhancements (Optional)

### Enable TypeScript Strict Mode

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Add Pre-commit Hook for Secrets

```bash
# Install detect-secrets
pip install detect-secrets

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
EOF

# Initialize
detect-secrets scan > .secrets.baseline
pre-commit install
```

### Add Rate Limiting to Edge Functions

```typescript
// In each edge function
const RATE_LIMIT = 60; // requests per minute
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRequests = rateLimitMap.get(userId) || [];

  // Remove requests older than 1 minute
  const recentRequests = userRequests.filter(time => now - time < 60000);

  if (recentRequests.length >= RATE_LIMIT) {
    return false; // Rate limit exceeded
  }

  recentRequests.push(now);
  rateLimitMap.set(userId, recentRequests);
  return true;
}
```

---

## 🆘 Emergency Rollback

If something goes wrong:

```bash
# Rollback code changes
git reset --hard HEAD~1

# Restore old Supabase key (if you saved it)
# Go to Supabase Dashboard → Settings → API
# Note: You can't "unrotate" a key, but you can generate a new one

# Rollback database migration
npx supabase db reset
```

---

## 📞 Support & Documentation

### Useful Links
- Supabase Encryption: https://supabase.com/docs/guides/database/extensions/pgcrypto
- CORS Best Practices: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- Git History Rewriting: https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History

### Questions?
- Review this guide step-by-step
- Test each phase before proceeding to the next
- Keep backups of .env files (securely, not in git!)

---

**Last Updated:** 2025-10-20
**Estimated Total Time:** 4-6 hours
**Priority:** 🔴 CRITICAL - Execute within 24 hours
