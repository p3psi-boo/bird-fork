import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const resolveCredentialsMock = vi.hoisted(() =>
  vi.fn(async () => ({
    cookies: { authToken: null, ct0: null, cookieHeader: null, source: null },
    warnings: [],
  })),
);

vi.mock('../src/lib/cookies.js', () => ({
  resolveCredentials: resolveCredentialsMock,
}));

import { createCliContext } from '../src/cli/shared.js';

describe('cli shared', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = originalHome;
    resolveCredentialsMock.mockClear();
  });

  it('does not inject CookieCloud config when no config file exists', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'bird-home-'));
    process.env.HOME = tempHome;

    try {
      const ctx = createCliContext([]);
      await ctx.resolveCredentialsFromOptions({});

      expect(resolveCredentialsMock).toHaveBeenCalledTimes(1);
      const calls = resolveCredentialsMock.mock.calls as unknown as Array<
        [{ cookieCloud?: { url: string; uuid: string; password: string } }]
      >;
      const options = calls[calls.length - 1]?.[0] as
        | { cookieCloud?: { url: string; uuid: string; password: string } }
        | undefined;
      expect(options?.cookieCloud).toBeUndefined();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('uses cookieCloud from config when provided', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'bird-home-'));
    const configDir = join(tempHome, '.config', 'bird');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json5'),
      '{ cookieCloud: { url: "https://config.example.com", uuid: "config-uuid", password: "config-pass" } }',
      'utf8',
    );
    process.env.HOME = tempHome;

    try {
      const ctx = createCliContext([]);
      await ctx.resolveCredentialsFromOptions({});

      expect(resolveCredentialsMock).toHaveBeenCalledTimes(1);
      const calls = resolveCredentialsMock.mock.calls as unknown as Array<
        [{ cookieCloud?: { url: string; uuid: string; password: string } }]
      >;
      const options = calls[calls.length - 1]?.[0] as
        | { cookieCloud?: { url: string; uuid: string; password: string } }
        | undefined;
      expect(options?.cookieCloud).toEqual({
        url: 'https://config.example.com',
        uuid: 'config-uuid',
        password: 'config-pass',
      });
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
