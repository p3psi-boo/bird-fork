import type { Rss } from 'feedsmith/types';
import type { TweetData } from './twitter-client.js';

export type RssUserFeedConfig = {
  name: string;
  handle: string;
  count?: number;
  title?: string;
  description?: string;
};

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function firstLine(input: string): string {
  const trimmed = input.trim();
  const idx = trimmed.indexOf('\n');
  return idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
}

function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function mimeFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  if (lower.endsWith('.mp4')) {
    return 'video/mp4';
  }
  return null;
}

type Media = NonNullable<TweetData['media']>[number];

function mediaHtml(media: Media): string {
  if (media.type === 'photo') {
    return `<p><a href="${media.url}"><img src="${media.url}" loading="lazy" /></a></p>`;
  }

  const videoUrl = media.videoUrl ?? media.url;
  const preview = media.previewUrl
    ? `<p><a href="${videoUrl}"><img src="${media.previewUrl}" loading="lazy" /></a></p>`
    : '';
  return `${preview}<p><a href="${videoUrl}">${media.type === 'animated_gif' ? 'GIF' : 'Video'}</a></p>`;
}

function tweetDescriptionHtml(tweet: TweetData): string {
  const text = escapeHtml(tweet.text ?? '');
  const base = text ? `<p>${text}</p>` : '';
  const media = tweet.media?.length ? tweet.media.map(mediaHtml).join('') : '';
  return `${base}${media}`;
}

function tweetTitle(tweet: TweetData): string {
  const line = firstLine(tweet.text ?? '');
  const display = line ? truncate(line, 110) : `Tweet by @${tweet.author.username}`;
  return `@${tweet.author.username}: ${display}`;
}

function tweetLink(tweet: TweetData): string {
  return `https://x.com/${tweet.author.username}/status/${tweet.id}`;
}

function tweetEnclosures(tweet: TweetData): Rss.Enclosure[] | undefined {
  const media = tweet.media?.[0];
  if (!media) {
    return undefined;
  }

  const url = media.type === 'photo' ? media.url : (media.videoUrl ?? media.url);
  const type = mimeFromUrl(url);
  if (!type) {
    return undefined;
  }

  return [{ url, type, length: 0 }];
}

export async function renderUserTweetsRssXml(opts: {
  handle: string;
  title: string;
  description: string;
  tweets: TweetData[];
}): Promise<string> {
  const tweets = [...opts.tweets].sort((a, b) => {
    const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bd - ad;
  });

  const newest = tweets[0]?.createdAt ? new Date(tweets[0].createdAt) : new Date();
  const feed: Rss.Feed<Date> = {
    title: opts.title,
    description: opts.description,
    link: `https://x.com/${opts.handle}`,
    language: 'en',
    lastBuildDate: new Date(),
    pubDate: newest,
    items: tweets.map((tweet) => ({
      title: tweetTitle(tweet),
      link: tweetLink(tweet),
      description: tweetDescriptionHtml(tweet),
      pubDate: tweet.createdAt ? new Date(tweet.createdAt) : undefined,
      guid: { value: tweet.id, isPermaLink: false },
      enclosures: tweetEnclosures(tweet),
    })),
  };

  const { generateRssFeed } = await import('feedsmith');
  return generateRssFeed(feed);
}
