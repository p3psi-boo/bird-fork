import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { normalizeHandle } from '../lib/normalize-handle.js';
import { renderUserTweetsRssXml } from '../lib/rss.js';
import { TwitterClient } from '../lib/twitter-client.js';

type RssCommandOpts = {
  output?: string;
};

function expandHome(path: string): string {
  const trimmed = path.trim();
  if (trimmed === '~') {
    return homedir();
  }
  if (trimmed.startsWith('~/')) {
    return join(homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function resolveOutputDir(cfgDir: string | undefined, overrideDir: string | undefined): string {
  const raw = overrideDir?.trim() || cfgDir?.trim();
  if (!raw) {
    throw new Error('Missing rss.outputDir in config (or pass --output).');
  }

  const expanded = expandHome(raw);
  return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded);
}

export function registerRssCommand(program: Command, ctx: CliContext): void {
  program
    .command('rss')
    .description('Generate RSS feeds for configured user timelines')
    .argument('[feedName]', 'Optional feed name from config')
    .option('-o, --output <dir>', 'Output directory (overrides config rss.outputDir)')
    .action(async (feedName: string | undefined, cmdOpts: RssCommandOpts) => {
      const rssCfg = ctx.config.rss;
      if (!rssCfg) {
        console.error(`${ctx.p('err')}Missing rss config. Add rss.outputDir and rss.feeds to your config.`);
        process.exit(1);
      }

      const feeds = rssCfg.feeds ?? [];
      if (feeds.length === 0) {
        console.error(`${ctx.p('err')}Missing rss.feeds in config.`);
        process.exit(1);
      }

      const outputDir = resolveOutputDir(rssCfg.outputDir, cmdOpts.output);
      mkdirSync(outputDir, { recursive: true });

      const selected = feedName ? feeds.filter((f) => f.name === feedName) : feeds;
      if (feedName && selected.length === 0) {
        console.error(`${ctx.p('err')}Unknown feed "${feedName}". Configured: ${feeds.map((f) => f.name).join(', ')}`);
        process.exit(1);
      }

      const opts = program.opts();
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts);
      const quoteDepth = ctx.resolveQuoteDepthFromOptions(opts);
      const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);

      for (const warning of warnings) {
        console.error(`${ctx.p('warn')}${warning}`);
      }

      if (!cookies.authToken || !cookies.ct0) {
        console.error(`${ctx.p('err')}Missing required credentials`);
        process.exit(1);
      }

      const client = new TwitterClient({ cookies, timeoutMs, quoteDepth });

      for (const feed of selected) {
        const handle = normalizeHandle(feed.handle);
        if (!handle) {
          console.error(`${ctx.p('err')}Invalid rss feed handle for "${feed.name}": "${feed.handle}"`);
          process.exit(1);
        }

        const count = feed.count ?? 30;
        if (!Number.isFinite(count) || count <= 0 || count > 200) {
          console.error(`${ctx.p('err')}Invalid rss feed count for "${feed.name}". Expected 1-200.`);
          process.exit(1);
        }

        console.error(`${ctx.p('info')}Generating ${feed.name} (@${handle})...`);
        const userIdResult = await client.getUserIdByUsername(handle);
        if (!userIdResult.success || !userIdResult.userId) {
          console.error(
            `${ctx.p('err')}Failed to resolve user ID for @${handle}: ${userIdResult.error || 'Unknown error'}`,
          );
          process.exit(1);
        }

        const result = await client.getUserTweetsPaged(userIdResult.userId, count, {
          includeRaw: false,
          maxPages: 1,
        });
        if (!result.success) {
          console.error(`${ctx.p('err')}Failed to fetch tweets for @${handle}: ${result.error || 'Unknown error'}`);
          process.exit(1);
        }

        const tweets = (result.tweets ?? []).sort((a, b) => {
          const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bd - ad;
        });

        const title = feed.title ?? `@${handle} tweets`;
        const description = feed.description ?? `Latest tweets from @${handle}`;
        const xml = await renderUserTweetsRssXml({ handle, title, description, tweets });

        const outPath = join(outputDir, `${feed.name}.rss.xml`);
        writeFileSync(outPath, xml);
        console.error(`${ctx.p('ok')}Wrote ${outPath}`);
      }
    });
}
