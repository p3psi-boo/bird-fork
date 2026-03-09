import { Cli, z } from 'incur';
import { KNOWN_COMMANDS } from './cli/program.js';
import { runLegacyCli } from './legacy-cli.js';
import { resolveCliInvocation } from './lib/cli-args.js';
import { getCliVersion } from './lib/version.js';

const rawArgs: string[] = process.argv.slice(2);

const LEGACY_JSON_COMMANDS = new Set([
  'about',
  'bookmarks',
  'followers',
  'following',
  'home',
  'likes',
  'list-timeline',
  'lists',
  'mentions',
  'news',
  'query-ids',
  'read',
  'replies',
  'search',
  'thread',
  'trending',
  'user-tweets',
]);

const NEGATED_BOOLEAN_OPTIONS = new Map([
  ['color', '--no-color'],
  ['emoji', '--no-emoji'],
]);

type Primitive = string | number | boolean | undefined;
type ArgValues = Record<string, Primitive>;
type OptionValues = Record<string, Primitive | string[]>;

const VALUE_OPTIONS = new Set(['--timeout', '--quote-depth', '--media', '--alt']);

const FLAG_OPTIONS = new Set(['--plain', '--no-emoji', '--no-color']);

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function serializeOptions(options: OptionValues): string[] {
  const argv: string[] = [];

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        argv.push(`--${toKebabCase(key)}`, item);
      }
      continue;
    }

    if (typeof value === 'boolean') {
      if (value) {
        argv.push(`--${toKebabCase(key)}`);
        continue;
      }

      const negatedFlag = NEGATED_BOOLEAN_OPTIONS.get(key);
      if (negatedFlag) {
        argv.push(negatedFlag);
      }
      continue;
    }

    argv.push(`--${toKebabCase(key)}`, String(value));
  }

  return argv;
}

function serializeArgs(args: ArgValues): string[] {
  return Object.values(args)
    .filter((value): value is string | number => value !== undefined && typeof value !== 'boolean')
    .map((value) => String(value));
}

function countUnbookmarkTargets(args: string[]): number {
  let count = 0;

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (!value) {
      continue;
    }

    if (value.startsWith('--')) {
      if (value.includes('=')) {
        continue;
      }

      if (VALUE_OPTIONS.has(value)) {
        index += 1;
        continue;
      }

      if (FLAG_OPTIONS.has(value)) {
        continue;
      }
    }

    if (value.startsWith('-')) {
      continue;
    }

    count += 1;
  }

  return count;
}

function preprocessInvocation(args: string[]): {
  serveArgs: string[];
  legacyJson: boolean;
  directLegacyArgs?: string[];
} {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const { argv, showHelp } = resolveCliInvocation(normalizedArgs, KNOWN_COMMANDS);
  const resolvedArgs = argv ? argv.slice(2) : normalizedArgs;

  if (showHelp) {
    return { serveArgs: ['--help'], legacyJson: false };
  }

  const command = resolvedArgs[0];
  if (command === 'unbookmark' && countUnbookmarkTargets(resolvedArgs) > 1) {
    return { serveArgs: resolvedArgs, legacyJson: false, directLegacyArgs: resolvedArgs };
  }

  if (!command || !LEGACY_JSON_COMMANDS.has(command)) {
    return { serveArgs: resolvedArgs, legacyJson: false };
  }

  let legacyJson = false;
  const serveArgs = resolvedArgs.filter((value) => {
    if (value === '--json') {
      legacyJson = true;
      return false;
    }

    return true;
  });

  return { serveArgs, legacyJson };
}

const invocation = preprocessInvocation(rawArgs);

async function runLegacyCommand(command: string, args: ArgValues = {}, options: OptionValues = {}): Promise<void> {
  const exitCode = await runLegacyCli([
    command,
    ...serializeArgs(args),
    ...serializeOptions(options),
    ...(invocation.legacyJson ? ['--json'] : []),
  ]);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

const sharedOptions = {
  timeout: z.coerce.number().optional().describe('Request timeout in milliseconds'),
  quoteDepth: z.coerce.number().optional().describe('Max quoted tweet depth'),
  plain: z.boolean().optional().describe('Plain output (stable, no emoji, no color)'),
  emoji: z.boolean().optional().describe('Disable emoji output with --no-emoji'),
  color: z.boolean().optional().describe('Disable ANSI colors with --no-color'),
};

const mediaOptions = {
  media: z.array(z.string()).optional().describe('Attach media files (repeatable)'),
  alt: z.array(z.string()).optional().describe('Alt text for matching --media entries'),
};

const cli = Cli.create('bird', {
  version: getCliVersion(),
  description: 'Fast X CLI for tweeting, reading, and account workflows.',
  sync: {
    suggestions: ['show the logged-in account', 'read a tweet as json', 'list bookmarks with thread context'],
  },
});

cli.command('tweet', {
  description: 'Post a new tweet.',
  args: z.object({ text: z.string().describe('Tweet text') }),
  options: z.object({ ...sharedOptions, ...mediaOptions }),
  examples: [{ args: { text: 'hello from bird' }, description: 'Post a simple tweet' }],
  run: ({ args, options }) => runLegacyCommand('tweet', args, options),
});

cli.command('reply', {
  description: 'Reply to an existing tweet.',
  args: z.object({ tweetIdOrUrl: z.string().describe('Tweet ID or URL'), text: z.string().describe('Reply text') }),
  options: z.object({ ...sharedOptions, ...mediaOptions }),
  examples: [
    {
      args: { tweetIdOrUrl: 'https://x.com/user/status/1234567890123456789', text: 'nice thread' },
      description: 'Reply to a tweet URL',
    },
  ],
  run: ({ args, options }) => runLegacyCommand('reply', args, options),
});

cli.command('read', {
  description: 'Read a tweet by ID or URL.',
  args: z.object({ tweetIdOrUrl: z.string().describe('Tweet ID or URL') }),
  options: z.object({
    ...sharedOptions,
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  hint: 'Use --json for the existing raw JSON response, or --json-full to include raw API payloads.',
  run: ({ args, options }) => runLegacyCommand('read', args, options),
});

cli.command('replies', {
  description: 'List replies to a tweet.',
  args: z.object({ tweetIdOrUrl: z.string().describe('Tweet ID or URL') }),
  options: z.object({
    ...sharedOptions,
    all: z.boolean().optional().describe('Fetch all replies'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    delay: z.coerce.number().optional().describe('Delay between page fetches in ms'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  hint: 'Use --json for raw JSON output.',
  run: ({ args, options }) => runLegacyCommand('replies', args, options),
});

cli.command('thread', {
  description: 'Show the full conversation thread for a tweet.',
  args: z.object({ tweetIdOrUrl: z.string().describe('Tweet ID or URL') }),
  options: z.object({
    ...sharedOptions,
    all: z.boolean().optional().describe('Fetch the full thread'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    delay: z.coerce.number().optional().describe('Delay between page fetches in ms'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  hint: 'Use --json for raw JSON output.',
  run: ({ args, options }) => runLegacyCommand('thread', args, options),
});

cli.command('search', {
  description: 'Search tweets with X query syntax.',
  args: z.object({ query: z.string().describe('Search query') }),
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of tweets to return'),
    all: z.boolean().optional().describe('Paginate through all results'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ args, options }) => runLegacyCommand('search', args, options),
});

cli.command('mentions', {
  description: 'Find tweets mentioning a user.',
  options: z.object({
    ...sharedOptions,
    user: z.string().optional().describe('User handle, defaults to the authenticated user'),
    count: z.coerce.number().optional().describe('Number of tweets to return'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { user: 'u', count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('mentions', {}, options),
});

cli.command('bookmarks', {
  description: 'List bookmarked tweets or a bookmark folder.',
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of bookmarks to return'),
    folderId: z.string().optional().describe('Bookmark folder ID'),
    all: z.boolean().optional().describe('Paginate through all bookmarks'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    expandRootOnly: z.boolean().optional().describe('Expand threads only for root bookmarks'),
    authorChain: z.boolean().optional().describe('Keep only the author self-reply chain'),
    authorOnly: z.boolean().optional().describe('Keep all tweets from the bookmarked author'),
    fullChainOnly: z.boolean().optional().describe('Keep the full reply chain connected to the bookmark'),
    includeAncestorBranches: z.boolean().optional().describe('Include sibling branches for ancestors'),
    includeParent: z.boolean().optional().describe('Include the direct parent tweet'),
    threadMeta: z.boolean().optional().describe('Include thread metadata fields'),
    sortChronological: z.boolean().optional().describe('Sort oldest to newest'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('bookmarks', {}, options),
});

cli.command('unbookmark', {
  description: 'Remove a bookmark by tweet ID or URL.',
  args: z.object({ tweetIdOrUrl: z.string().describe('Tweet ID or URL') }),
  options: z.object(sharedOptions),
  hint: 'Multi-target legacy usage is still supported: bird unbookmark <id-or-url> <id-or-url...>',
  run: ({ args, options }) => runLegacyCommand('unbookmark', args, options),
});

cli.command('follow', {
  description: 'Follow a user by handle or user ID.',
  args: z.object({ usernameOrId: z.string().describe('Username or user ID') }),
  options: z.object(sharedOptions),
  run: ({ args, options }) => runLegacyCommand('follow', args, options),
});

cli.command('unfollow', {
  description: 'Unfollow a user by handle or user ID.',
  args: z.object({ usernameOrId: z.string().describe('Username or user ID') }),
  options: z.object(sharedOptions),
  run: ({ args, options }) => runLegacyCommand('unfollow', args, options),
});

cli.command('lists', {
  description: 'List your lists or list memberships.',
  options: z.object({
    ...sharedOptions,
    memberOf: z.boolean().optional().describe('List memberships instead of owned lists'),
    count: z.coerce.number().optional().describe('Number of lists to return'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('lists', {}, options),
});

cli.command('list-timeline', {
  description: 'Read tweets from a list timeline.',
  args: z.object({ listIdOrUrl: z.string().describe('List ID or list URL') }),
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of tweets to return'),
    all: z.boolean().optional().describe('Paginate through the entire timeline'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ args, options }) => runLegacyCommand('list-timeline', args, options),
});

cli.command('home', {
  description: 'Fetch your home timeline.',
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of tweets to return'),
    following: z.boolean().optional().describe('Fetch the Following feed instead of For You'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('home', {}, options),
});

cli.command('following', {
  description: 'List accounts a user follows.',
  options: z.object({
    ...sharedOptions,
    user: z.string().optional().describe('User ID to inspect'),
    count: z.coerce.number().optional().describe('Number of users to return'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    all: z.boolean().optional().describe('Paginate through all followings'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('following', {}, options),
});

cli.command('followers', {
  description: 'List accounts following a user.',
  options: z.object({
    ...sharedOptions,
    user: z.string().optional().describe('User ID to inspect'),
    count: z.coerce.number().optional().describe('Number of users to return'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    all: z.boolean().optional().describe('Paginate through all followers'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('followers', {}, options),
});

cli.command('likes', {
  description: 'List liked tweets.',
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of tweets to return'),
    all: z.boolean().optional().describe('Paginate through all likes'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('likes', {}, options),
});

cli.command('whoami', {
  description: 'Show which X account the current cookies belong to.',
  options: z.object(sharedOptions),
  run: ({ options }) => runLegacyCommand('whoami', {}, options),
});

cli.command('about', {
  description: 'Show account origin and location details for a user.',
  args: z.object({ username: z.string().describe('Username or handle') }),
  options: z.object(sharedOptions),
  hint: 'Use --json for raw JSON output.',
  run: ({ args, options }) => runLegacyCommand('about', args, options),
});

cli.command('user-tweets', {
  description: 'Read tweets from a user timeline.',
  args: z.object({ handle: z.string().describe('User handle') }),
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of tweets to return'),
    maxPages: z.coerce.number().optional().describe('Fetch N pages'),
    delay: z.coerce.number().optional().describe('Delay between page fetches in ms'),
    cursor: z.string().optional().describe('Resume pagination from a cursor'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ args, options }) => runLegacyCommand('user-tweets', args, options),
});

cli.command('news', {
  description: 'Fetch AI-curated news and trending topics from X Explore.',
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of items to return'),
    aiOnly: z.boolean().optional().describe('Filter out regular trends'),
    withTweets: z.boolean().optional().describe('Include related tweets'),
    tweetsPerItem: z.coerce.number().optional().describe('Tweets per news item'),
    forYou: z.boolean().optional().describe('Fetch only the For You tab'),
    newsOnly: z.boolean().optional().describe('Fetch only the News tab'),
    sports: z.boolean().optional().describe('Fetch only the Sports tab'),
    entertainment: z.boolean().optional().describe('Fetch only the Entertainment tab'),
    trendingOnly: z.boolean().optional().describe('Fetch only the Trending tab'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('news', {}, options),
});

cli.command('trending', {
  description: 'Alias for news.',
  options: z.object({
    ...sharedOptions,
    count: z.coerce.number().optional().describe('Number of items to return'),
    aiOnly: z.boolean().optional().describe('Filter out regular trends'),
    withTweets: z.boolean().optional().describe('Include related tweets'),
    tweetsPerItem: z.coerce.number().optional().describe('Tweets per news item'),
    forYou: z.boolean().optional().describe('Fetch only the For You tab'),
    newsOnly: z.boolean().optional().describe('Fetch only the News tab'),
    sports: z.boolean().optional().describe('Fetch only the Sports tab'),
    entertainment: z.boolean().optional().describe('Fetch only the Entertainment tab'),
    trendingOnly: z.boolean().optional().describe('Fetch only the Trending tab'),
    jsonFull: z.boolean().optional().describe('Include raw API response in _raw'),
  }),
  alias: { count: 'n' },
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('trending', {}, options),
});

cli.command('query-ids', {
  description: 'Inspect or refresh cached GraphQL query IDs.',
  options: z.object({ ...sharedOptions, fresh: z.boolean().optional().describe('Force a fresh query ID refresh') }),
  hint: 'Use --json for raw JSON output.',
  run: ({ options }) => runLegacyCommand('query-ids', {}, options),
});

cli.command('check', {
  description: 'Show which credentials are available and where they came from.',
  options: z.object(sharedOptions),
  run: ({ options }) => runLegacyCommand('check', {}, options),
});

cli.command('help', {
  description: 'Show compatibility help for a command using the legacy renderer.',
  args: z.object({ command: z.string().optional().describe('Command name') }),
  run: ({ args }) => runLegacyCommand('help', args),
});

export default cli;

if (invocation.directLegacyArgs) {
  const exitCode = await runLegacyCli(invocation.directLegacyArgs);
  process.exit(exitCode);
}

await cli.serve(invocation.serveArgs);
