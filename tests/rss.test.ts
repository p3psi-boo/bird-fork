import { describe, expect, it } from 'vitest';
import { renderUserTweetsRssXml } from '../src/lib/rss.js';
import type { TweetData } from '../src/lib/twitter-client.js';

const PHOTO_ENCLOSURE = /<enclosure[^>]+url="https:\/\/example\.com\/a\.jpg"/;
const VIDEO_ENCLOSURE = /<enclosure[^>]+url="https:\/\/example\.com\/v\.mp4"/;

describe('renderUserTweetsRssXml', () => {
  it('sorts tweets by createdAt desc and includes media HTML', async () => {
    const tweets: TweetData[] = [
      {
        id: '1',
        text: 'older tweet',
        author: { username: 'alice', name: 'Alice' },
        createdAt: '2026-01-20T10:00:00.000Z',
        media: [{ type: 'photo', url: 'https://example.com/a.jpg' }],
      },
      {
        id: '2',
        text: 'newer tweet',
        author: { username: 'alice', name: 'Alice' },
        createdAt: '2026-01-21T10:00:00.000Z',
        media: [
          {
            type: 'video',
            url: 'https://example.com/poster.jpg',
            previewUrl: 'https://example.com/poster.jpg',
            videoUrl: 'https://example.com/v.mp4',
          },
        ],
      },
    ];

    const xml = await renderUserTweetsRssXml({
      handle: 'alice',
      title: '@alice tweets',
      description: 'Latest tweets from @alice',
      tweets,
    });

    expect(xml).toContain('<rss');

    const newerIdx = xml.indexOf('/status/2');
    const olderIdx = xml.indexOf('/status/1');
    expect(newerIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThanOrEqual(0);
    expect(newerIdx).toBeLessThan(olderIdx);

    expect(xml).toContain('<img');
    expect(xml).toContain('https://example.com/a.jpg');
    expect(xml).toContain('https://example.com/v.mp4');

    expect(xml).toMatch(PHOTO_ENCLOSURE);
    expect(xml).toMatch(VIDEO_ENCLOSURE);
  });
});
