/**
 * Example usage of the encryption utilities
 *
 * This file shows how to use the API key encryption functions
 * in your React components.
 */

import {
  saveEncryptedApiKey,
  getDecryptedApiKey,
  hasApiKey,
  deleteApiKey,
  getApiKeyMetadata,
  validateApiKeyFormat,
  maskApiKey,
  AuthenticationError,
  EncryptionError
} from './supabase-encryption';

/**
 * Example 1: Save an API key from user input
 */
export async function handleSaveApiKey(userInput: string) {
  try {
    // Validate format first (client-side check)
    if (!validateApiKeyFormat(userInput)) {
      return {
        success: false,
        error: 'Invalid API key format. Keys should start with "sk-"'
      };
    }

    // Save encrypted key
    await saveEncryptedApiKey(userInput);

    return {
      success: true,
      message: 'API key saved successfully!'
    };

  } catch (error) {
    if (error instanceof AuthenticationError) {
      return {
        success: false,
        error: 'Please log in to save your API key',
        redirectToLogin: true
      };
    }

    if (error instanceof EncryptionError) {
      return {
        success: false,
        error: `Encryption failed: ${error.message}`
      };
    }

    return {
      success: false,
      error: 'An unexpected error occurred'
    };
  }
}

/**
 * Example 2: Load API key when component mounts
 */
export async function loadApiKeyOnMount() {
  try {
    // Check if user has a key
    const hasKey = await hasApiKey();

    if (!hasKey) {
      return {
        hasKey: false,
        showSetupWizard: true
      };
    }

    // Get the decrypted key
    const apiKey = await getDecryptedApiKey();

    // Get metadata
    const metadata = await getApiKeyMetadata();

    return {
      hasKey: true,
      apiKey, // Use this for API calls
      maskedKey: apiKey ? maskApiKey(apiKey) : null, // Use for display
      metadata
    };

  } catch (error) {
    console.error('Failed to load API key:', error);
    return {
      hasKey: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Example 3: Delete API key
 */
export async function handleDeleteApiKey() {
  try {
    await deleteApiKey();

    return {
      success: true,
      message: 'API key deleted successfully'
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete key'
    };
  }
}

/**
 * Example 4: React component usage
 */
export const ApiKeyManagementExample = `
import { useState, useEffect } from 'react';
import {
  saveEncryptedApiKey,
  getDecryptedApiKey,
  hasApiKey,
  deleteApiKey,
  maskApiKey,
  validateApiKeyFormat
} from '@/lib/supabase-encryption';

function ApiKeySettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load API key on mount
  useEffect(() => {
    async function loadKey() {
      try {
        const key = await getDecryptedApiKey();
        setApiKey(key);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load key');
      } finally {
        setIsLoading(false);
      }
    }
    loadKey();
  }, []);

  // Save new API key
  const handleSave = async () => {
    if (!validateApiKeyFormat(inputValue)) {
      setError('Invalid API key format');
      return;
    }

    try {
      setIsLoading(true);
      await saveEncryptedApiKey(inputValue);
      setApiKey(inputValue);
      setInputValue('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete API key
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete your API key?')) {
      return;
    }

    try {
      setIsLoading(true);
      await deleteApiKey();
      setApiKey(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="api-key-settings">
      <h2>OpenAI API Key</h2>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      {apiKey ? (
        <div className="key-display">
          <p>Current key: {maskApiKey(apiKey)}</p>
          <button onClick={handleDelete} disabled={isLoading}>
            Delete Key
          </button>
        </div>
      ) : (
        <div className="key-input">
          <input
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="sk-..."
          />
          <button onClick={handleSave} disabled={isLoading || !inputValue}>
            Save Key
          </button>
        </div>
      )}
    </div>
  );
}

export default ApiKeySettings;
`;
