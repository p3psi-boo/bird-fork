import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the cookiecloud module
const mockFetchCookieCloudData = vi.fn();
const mockExtractTwitterCookies = vi.fn();

vi.mock('../src/lib/cookiecloud.js', () => ({
  fetchCookieCloudData: mockFetchCookieCloudData,
  extractTwitterCookies: mockExtractTwitterCookies,
}));

describe('cookies', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchCookieCloudData.mockReset();
    mockExtractTwitterCookies.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CookieCloud', () => {
    it('should fetch cookies from CookieCloud server', async () => {
      mockFetchCookieCloudData.mockResolvedValue({ cookie_data: {} });
      mockExtractTwitterCookies.mockReturnValue({
        authToken: 'cc_auth_token',
        ct0: 'cc_ct0',
      });

      const { extractCookiesFromCookieCloud } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromCookieCloud({
        url: 'https://cookiecloud.example.com',
        uuid: 'test-uuid',
        password: 'test-password',
      });

      expect(result.cookies.authToken).toBe('cc_auth_token');
      expect(result.cookies.ct0).toBe('cc_ct0');
      expect(result.cookies.source).toBe('CookieCloud');
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle missing cookies in CookieCloud response', async () => {
      mockFetchCookieCloudData.mockResolvedValue({ cookie_data: {} });
      mockExtractTwitterCookies.mockReturnValue({
        authToken: null,
        ct0: null,
      });

      const { extractCookiesFromCookieCloud } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromCookieCloud({
        url: 'https://cookiecloud.example.com',
        uuid: 'test-uuid',
        password: 'test-password',
      });

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle CookieCloud server errors', async () => {
      mockFetchCookieCloudData.mockRejectedValue(new Error('Server returned 500: Internal Server Error'));

      const { extractCookiesFromCookieCloud } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromCookieCloud({
        url: 'https://cookiecloud.example.com',
        uuid: 'test-uuid',
        password: 'test-password',
      });

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.some((w) => w.includes('500'))).toBe(true);
    });

    it('should handle network failures', async () => {
      mockFetchCookieCloudData.mockRejectedValue(new Error('Network error'));

      const { extractCookiesFromCookieCloud } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromCookieCloud({
        url: 'https://cookiecloud.example.com',
        uuid: 'test-uuid',
        password: 'test-password',
      });

      expect(result.cookies.authToken).toBeNull();
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.some((w) => w.includes('Network error'))).toBe(true);
    });

    it('should return cookies when both auth_token and ct0 are found', async () => {
      mockFetchCookieCloudData.mockResolvedValue({ cookie_data: {} });
      mockExtractTwitterCookies.mockReturnValue({
        authToken: 'xcom_auth',
        ct0: 'xcom_ct0',
      });

      const { extractCookiesFromCookieCloud } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromCookieCloud({
        url: 'https://cookiecloud.example.com',
        uuid: 'test-uuid',
        password: 'test-password',
      });

      expect(result.cookies.authToken).toBe('xcom_auth');
      expect(result.cookies.ct0).toBe('xcom_ct0');
      expect(result.cookies.source).toBe('CookieCloud');
    });

    it('should warn when only partial cookies found', async () => {
      mockFetchCookieCloudData.mockResolvedValue({ cookie_data: {} });
      mockExtractTwitterCookies.mockReturnValue({
        authToken: 'twitter_auth',
        ct0: null,
      });

      const { extractCookiesFromCookieCloud } = await import('../src/lib/cookies.js');
      const result = await extractCookiesFromCookieCloud({
        url: 'https://cookiecloud.example.com',
        uuid: 'test-uuid',
        password: 'test-password',
      });

      expect(result.cookies.authToken).toBe('twitter_auth');
      expect(result.cookies.ct0).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
