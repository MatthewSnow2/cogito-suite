/**
 * Supabase API Key Encryption Utilities
 *
 * Provides secure storage and retrieval of OpenAI API keys using
 * server-side encryption with pgcrypto.
 *
 * @module supabase-encryption
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Get encryption key from environment
 * This key must match the one used in Supabase Edge Functions
 */
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;

/**
 * Validate encryption key is configured
 */
function validateEncryptionKey(): void {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY === 'your-32-byte-encryption-key-here') {
    throw new Error(
      'Encryption key not configured. ' +
      'Please set VITE_ENCRYPTION_KEY in your .env file. ' +
      'Generate one with: openssl rand -base64 32'
    );
  }
}

/**
 * Error types for better error handling
 */
export class EncryptionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'User not authenticated') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Save encrypted OpenAI API key for the current user
 *
 * @param apiKey - The OpenAI API key to encrypt and store
 * @throws {AuthenticationError} If user is not authenticated
 * @throws {EncryptionError} If encryption or storage fails
 *
 * @example
 * ```typescript
 * try {
 *   await saveEncryptedApiKey('sk-...');
 *   console.log('API key saved successfully');
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     // Redirect to login
 *   } else {
 *     // Show error message
 *   }
 * }
 * ```
 */
export async function saveEncryptedApiKey(apiKey: string): Promise<void> {
  validateEncryptionKey();

  // Validate API key format
  if (!apiKey || !apiKey.trim()) {
    throw new EncryptionError('API key cannot be empty', 'INVALID_API_KEY');
  }

  if (!apiKey.startsWith('sk-')) {
    throw new EncryptionError(
      'Invalid OpenAI API key format. Keys should start with "sk-"',
      'INVALID_API_KEY_FORMAT'
    );
  }

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthenticationError();
  }

  try {
    // Call the secure storage function
    const { data, error } = await supabase.rpc('store_encrypted_api_key', {
      p_user_id: user.id,
      p_api_key: apiKey,
      p_encryption_key: ENCRYPTION_KEY
    });

    if (error) {
      console.error('Encryption error:', error);
      throw new EncryptionError(
        `Failed to encrypt API key: ${error.message}`,
        'ENCRYPTION_FAILED'
      );
    }

    // Log success (without exposing the key)
    if (import.meta.env.DEV) {
      console.log('✓ API key encrypted and stored successfully');
    }

  } catch (error) {
    if (error instanceof EncryptionError || error instanceof AuthenticationError) {
      throw error;
    }

    // Wrap unexpected errors
    throw new EncryptionError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNKNOWN_ERROR'
    );
  }
}

/**
 * Retrieve and decrypt the OpenAI API key for the current user
 *
 * @returns The decrypted API key, or null if no key is stored
 * @throws {AuthenticationError} If user is not authenticated
 * @throws {EncryptionError} If decryption fails
 *
 * @example
 * ```typescript
 * const apiKey = await getDecryptedApiKey();
 * if (apiKey) {
 *   // Use the API key
 *   const openai = new OpenAI({ apiKey });
 * } else {
 *   // Prompt user to configure API key
 * }
 * ```
 */
export async function getDecryptedApiKey(): Promise<string | null> {
  validateEncryptionKey();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthenticationError();
  }

  try {
    // Call the secure retrieval function
    const { data, error } = await supabase.rpc('get_my_api_key', {
      p_encryption_key: ENCRYPTION_KEY
    });

    if (error) {
      console.error('Decryption error:', error);
      throw new EncryptionError(
        `Failed to decrypt API key: ${error.message}`,
        'DECRYPTION_FAILED'
      );
    }

    // data is the decrypted API key (or null)
    return data as string | null;

  } catch (error) {
    if (error instanceof EncryptionError || error instanceof AuthenticationError) {
      throw error;
    }

    throw new EncryptionError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNKNOWN_ERROR'
    );
  }
}

/**
 * Check if the current user has an API key stored
 *
 * @returns True if user has an API key, false otherwise
 * @throws {AuthenticationError} If user is not authenticated
 *
 * @example
 * ```typescript
 * if (await hasApiKey()) {
 *   // Show dashboard
 * } else {
 *   // Show setup wizard
 * }
 * ```
 */
export async function hasApiKey(): Promise<boolean> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthenticationError();
  }

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // PGRST116 = no rows returned (user has no API key)
      if (error.code === 'PGRST116') {
        return false;
      }
      throw error;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking API key existence:', error);
    return false;
  }
}

/**
 * Delete the API key for the current user
 *
 * @throws {AuthenticationError} If user is not authenticated
 * @throws {EncryptionError} If deletion fails
 *
 * @example
 * ```typescript
 * await deleteApiKey();
 * console.log('API key deleted successfully');
 * ```
 */
export async function deleteApiKey(): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthenticationError();
  }

  try {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      throw new EncryptionError(
        `Failed to delete API key: ${error.message}`,
        'DELETE_FAILED'
      );
    }

    if (import.meta.env.DEV) {
      console.log('✓ API key deleted successfully');
    }

  } catch (error) {
    if (error instanceof EncryptionError || error instanceof AuthenticationError) {
      throw error;
    }

    throw new EncryptionError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNKNOWN_ERROR'
    );
  }
}

/**
 * Get metadata about the stored API key (without decrypting it)
 *
 * @returns Metadata about the API key, or null if no key is stored
 * @throws {AuthenticationError} If user is not authenticated
 *
 * @example
 * ```typescript
 * const metadata = await getApiKeyMetadata();
 * if (metadata) {
 *   console.log('Key created:', metadata.created_at);
 *   console.log('Last used:', metadata.last_used_at);
 * }
 * ```
 */
export async function getApiKeyMetadata(): Promise<{
  id: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  encryption_version: number;
} | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthenticationError();
  }

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, created_at, updated_at, last_used_at, encryption_version')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // PGRST116 = no rows returned
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching API key metadata:', error);
    return null;
  }
}

/**
 * Validate an API key format (client-side check only)
 *
 * @param apiKey - The API key to validate
 * @returns True if the format appears valid, false otherwise
 *
 * @example
 * ```typescript
 * if (!validateApiKeyFormat(inputValue)) {
 *   setError('Invalid API key format');
 * }
 * ```
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // OpenAI keys start with 'sk-' and are typically 48-51 characters
  if (!apiKey.startsWith('sk-')) {
    return false;
  }

  // Check reasonable length (OpenAI keys are usually 48-51 chars)
  if (apiKey.length < 20 || apiKey.length > 200) {
    return false;
  }

  // Check for valid characters (base64-like)
  const validChars = /^sk-[A-Za-z0-9_-]+$/;
  return validChars.test(apiKey);
}

/**
 * Mask an API key for display purposes
 *
 * @param apiKey - The API key to mask
 * @returns Masked version showing only first/last few characters
 *
 * @example
 * ```typescript
 * const masked = maskApiKey('sk-1234567890abcdef');
 * console.log(masked); // "sk-12...cdef"
 * ```
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 10) {
    return '••••••••';
  }

  const start = apiKey.substring(0, 5);
  const end = apiKey.substring(apiKey.length - 4);
  return `${start}...${end}`;
}

/**
 * React hook for managing encrypted API keys
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const {
 *     apiKey,
 *     isLoading,
 *     error,
 *     saveKey,
 *     deleteKey,
 *     refreshKey
 *   } = useEncryptedApiKey();
 *
 *   return (
 *     <div>
 *       {isLoading && <p>Loading...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *       {apiKey ? (
 *         <div>
 *           <p>Key: {maskApiKey(apiKey)}</p>
 *           <button onClick={deleteKey}>Delete</button>
 *         </div>
 *       ) : (
 *         <button onClick={() => saveKey('sk-...')}>Save Key</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEncryptedApiKey() {
  // This would be implemented as a React hook in a separate file
  // Keeping it here as a stub to show the intended usage
  throw new Error(
    'useEncryptedApiKey hook not yet implemented. ' +
    'Use saveEncryptedApiKey() and getDecryptedApiKey() directly for now.'
  );
}

// All exports are defined above
