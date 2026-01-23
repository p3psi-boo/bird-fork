/**
 * CookieCloud client for fetching cookies from a CookieCloud server.
 * CookieCloud is a cookie synchronization service that stores encrypted cookies.
 */

import { createDecipheriv, createHash } from 'node:crypto';

export interface CookieCloudConfig {
  url: string;
  uuid: string;
  password: string;
}

export interface CookieCloudCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface CookieCloudData {
  cookie_data: Record<string, CookieCloudCookie[]>;
}

/**
 * Generate encryption key from UUID and password.
 * Uses MD5 hash of concatenated uuid-password string.
 */
function generateKey(uuid: string, password: string): Buffer {
  const keyString = `${uuid}-${password}`;
  return createHash('md5').update(keyString).digest();
}

/**
 * Decrypt CookieCloud data using AES-128-CBC.
 */
function decryptData(encryptedData: string, key: Buffer): string {
  try {
    // CookieCloud uses the key as both key and IV
    const decipher = createDecipheriv('aes-128-cbc', key, key);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt CookieCloud data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetch and decrypt cookies from CookieCloud server.
 */
export async function fetchCookieCloudData(config: CookieCloudConfig): Promise<CookieCloudData> {
  const { url, uuid, password } = config;

  // Normalize URL
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const endpoint = `${baseUrl}/get/${uuid}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'bird-cli/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`CookieCloud server returned ${response.status}: ${response.statusText}`);
    }

    const result = (await response.json()) as { encrypted?: string };

    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response from CookieCloud server');
    }

    // Check if encrypted data exists
    if (!result.encrypted) {
      throw new Error('No encrypted data in CookieCloud response');
    }

    // Generate decryption key and decrypt
    const key = generateKey(uuid, password);
    const decryptedJson = decryptData(result.encrypted, key);
    const data = JSON.parse(decryptedJson) as CookieCloudData;

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch CookieCloud data: ${String(error)}`);
  }
}

/**
 * Extract Twitter cookies from CookieCloud data.
 */
export function extractTwitterCookies(data: CookieCloudData): {
  authToken: string | null;
  ct0: string | null;
} {
  const result = { authToken: null as string | null, ct0: null as string | null };

  if (!data.cookie_data || typeof data.cookie_data !== 'object') {
    return result;
  }

  // Search for Twitter/X cookies in all domains
  const twitterDomains = ['x.com', '.x.com', 'twitter.com', '.twitter.com'];

  for (const domain of twitterDomains) {
    const cookies = data.cookie_data[domain];
    if (!Array.isArray(cookies)) {
      continue;
    }

    for (const cookie of cookies) {
      if (cookie.name === 'auth_token' && cookie.value && !result.authToken) {
        result.authToken = cookie.value;
      }
      if (cookie.name === 'ct0' && cookie.value && !result.ct0) {
        result.ct0 = cookie.value;
      }
    }

    // If we found both cookies, we can stop searching
    if (result.authToken && result.ct0) {
      break;
    }
  }

  return result;
}
