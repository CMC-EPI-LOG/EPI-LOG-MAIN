import { handler as airKoreaHandler } from './airkorea/handler';
import { handler as airKoreaForecastHandler } from './airkorea-forecast/handler';
import { handler as kmaShortForecastHandler } from './kma-short-forecast/handler';
import { handler as kmaLifestyleHandler } from './kma-lifestyle/handler';
import type { ScheduledIngestEvent } from './shared/types';

type CliArgs = {
  job: string;
  dryRun: boolean;
  scope?: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    job: '',
    dryRun: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === '--job' && value) {
      args.job = value.trim();
      index += 1;
      continue;
    }

    if (token === '--scope' && value) {
      args.scope = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
    }
  }

  if (!args.job) {
    throw new Error('Missing required --job');
  }

  return args;
}

async function run(event: ScheduledIngestEvent) {
  if (event.job === 'airkorea-realtime') return airKoreaHandler(event);
  if (event.job === 'airkorea-forecast') return airKoreaForecastHandler(event);
  if (event.job === 'kma-short-forecast') return kmaShortForecastHandler(event);
  if (event.job === 'kma-lifestyle') return kmaLifestyleHandler(event);
  throw new Error(`Unsupported job: ${event.job}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await run({
    job: args.job,
    trigger: 'github-actions',
    dryRun: args.dryRun,
    scope: args.scope,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[public-data-cli] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
