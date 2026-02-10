/**
 * Twitter cookie extraction via CookieCloud.
 */

import { type CookieCloudConfig, extractTwitterCookies, fetchCookieCloudData } from './cookiecloud.js';

export interface TwitterCookies {
  authToken: string | null;
  ct0: string | null;
  cookieHeader: string | null;
  source: string | null;
}

export interface CookieExtractionResult {
  cookies: TwitterCookies;
  warnings: string[];
}

function cookieHeader(authToken: string, ct0: string): string {
  return `auth_token=${authToken}; ct0=${ct0}`;
}

function buildEmpty(): TwitterCookies {
  return { authToken: null, ct0: null, cookieHeader: null, source: null };
}

/**
 * Extract Twitter cookies from CookieCloud.
 */
export async function extractCookiesFromCookieCloud(config: CookieCloudConfig): Promise<CookieExtractionResult> {
  const warnings: string[] = [];
  const out = buildEmpty();

  try {
    const data = await fetchCookieCloudData(config);
    const { authToken, ct0 } = extractTwitterCookies(data);

    if (authToken) {
      out.authToken = authToken;
    }
    if (ct0) {
      out.ct0 = ct0;
    }

    if (out.authToken && out.ct0) {
      out.cookieHeader = cookieHeader(out.authToken, out.ct0);
      out.source = 'CookieCloud';
      return { cookies: out, warnings };
    }

    warnings.push(
      'No Twitter cookies found in CookieCloud data. Make sure you are logged into x.com in a synced browser.',
    );
  } catch (error) {
    warnings.push(`Failed to fetch from CookieCloud: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { cookies: out, warnings };
}

/**
 * Resolve Twitter credentials from CookieCloud.
 */
export async function resolveCredentials(options: {
  authToken?: string;
  ct0?: string;
  cookieCloud?: CookieCloudConfig;
}): Promise<CookieExtractionResult> {
  const warnings: string[] = [];

  // Direct token auth takes priority
  if (options.authToken && options.ct0) {
    return {
      cookies: {
        authToken: options.authToken,
        ct0: options.ct0,
        cookieHeader: cookieHeader(options.authToken, options.ct0),
        source: 'CLI',
      },
      warnings,
    };
  }

  // Try CookieCloud
  if (options.cookieCloud) {
    return extractCookiesFromCookieCloud(options.cookieCloud);
  }

  warnings.push('No credentials provided. Use --auth-token/--ct0 or configure CookieCloud.');
  return { cookies: buildEmpty(), warnings };
}
