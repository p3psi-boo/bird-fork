# Cookie Cleanup Plan: Only Keep CookieCloud

## Overview
Remove all cookie reading channels except CookieCloud.

## Checklist

### 1. Core File: `src/lib/cookies.ts`
- [ ] Remove `@steipete/sweet-cookie` import
- [ ] Remove `CookieSource` type
- [ ] Remove browser constants (`TWITTER_COOKIE_NAMES`, `TWITTER_URL`, etc.)
- [ ] Remove helper functions (`normalizeValue`, `readEnvCookie`, `resolveSources`, etc.)
- [ ] Remove `readTwitterCookiesFromBrowser()` function
- [ ] Remove `extractCookiesFromSafari()` export
- [ ] Remove `extractCookiesFromChrome()` export
- [ ] Remove `extractCookiesFromFirefox()` export
- [ ] Simplify `resolveCredentials()` to only accept `cookieCloud` param

### 2. CLI Context: `src/cli/shared.ts`
- [ ] Remove `CookieSource` import
- [ ] Remove `COOKIE_SOURCES` constant
- [ ] Remove `parseCookieSource()` function
- [ ] Remove `collectCookieSource()` function
- [ ] Remove `resolveCookieSourceOrder()` function
- [ ] Remove `resolveCookieTimeoutFromOptions()` function
- [ ] Update `BirdConfig` type (remove browser-related fields)
- [ ] Update `CredentialsOptions` type (remove CLI/env fields)
- [ ] Simplify `resolveCredentialsFromOptions()` function

### 3. Exports: `src/lib/index.ts`
- [ ] Remove `CookieSource` type export
- [ ] Remove `extractCookiesFromChrome` export
- [ ] Remove `extractCookiesFromFirefox` export
- [ ] Remove `extractCookiesFromSafari` export

### 4. Tests: `tests/cookies.test.ts`
- [ ] Remove `@steipete/sweet-cookie` mock
- [ ] Remove all browser-related tests
- [ ] Remove CLI argument tests
- [ ] Remove environment variable tests
- [ ] Add CookieCloud-only tests

### 5. Dependencies: `package.json`
- [ ] Run `npm uninstall @steipete/sweet-cookie`

### 6. Verification
- [ ] Run `npm run build` to check compilation
- [ ] Run `npm test` to verify tests pass
