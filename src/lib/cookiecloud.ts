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
 * Generate the same passphrase used in CookieCloud's CryptoJS example:
 * MD5(uuid-password) as hex, truncated to 16 chars.
 */
function generatePassphrase(uuid: string, password: string): string {
  const keyString = `${uuid}-${password}`;
  return createHash('md5').update(keyString).digest('hex').substring(0, 16);
}

/**
 * Reproduce CryptoJS/OpenSSL EVP_BytesToKey derivation (MD5, 1 iteration)
 * used by CryptoJS when decrypting with a passphrase string.
 */
function evpBytesToKey(passphrase: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const password = Buffer.from(passphrase, 'utf8');
  const targetLength = 32 + 16; // AES-256 key + CBC IV
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);

  while (derived.length < targetLength) {
    block = createHash('md5')
      .update(Buffer.concat([block, password, salt]))
      .digest();
    derived = Buffer.concat([derived, block]);
  }

  return {
    key: derived.subarray(0, 32),
    iv: derived.subarray(32, 48),
  };
}

/**
 * Decrypt CookieCloud data with CryptoJS-compatible passphrase mode.
 */
function decryptData(encryptedData: string, passphrase: string): string {
  try {
    const payload = Buffer.from(encryptedData, 'base64');

    // CryptoJS OpenSSL formatter prepends "Salted__" + 8-byte salt.
    if (payload.length < 16 || payload.subarray(0, 8).toString('utf8') !== 'Salted__') {
      throw new Error('Invalid CryptoJS/OpenSSL payload format');
    }

    const salt = payload.subarray(8, 16);
    const ciphertext = payload.subarray(16);
    const { key, iv } = evpBytesToKey(passphrase, salt);

    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
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

    // Generate CryptoJS passphrase and decrypt
    const passphrase = generatePassphrase(uuid, password);
    const decryptedJson = decryptData(result.encrypted, passphrase);
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
