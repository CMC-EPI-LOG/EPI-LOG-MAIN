import type { BackfillEvent, ScheduledIngestEvent } from '../shared/types';
import { handler as airKoreaHandler } from '../airkorea/handler';
import { handler as airKoreaForecastHandler } from '../airkorea-forecast/handler';
import { handler as kmaShortForecastHandler } from '../kma-short-forecast/handler';
import { handler as kmaLifestyleHandler } from '../kma-lifestyle/handler';

export async function handler(event: BackfillEvent) {
  const scheduledEvent: ScheduledIngestEvent = {
    job: event.source,
    trigger: 'manual',
    dryRun: event.dryRun,
    scope: event.scope,
  };

  if (event.source === 'airkorea-realtime') {
    return airKoreaHandler(scheduledEvent);
  }

  if (event.source === 'airkorea-forecast') {
    return airKoreaForecastHandler(scheduledEvent);
  }

  if (event.source === 'kma-short-forecast') {
    return kmaShortForecastHandler(scheduledEvent);
  }

  if (event.source === 'kma-lifestyle') {
    return kmaLifestyleHandler(scheduledEvent);
  }

  throw new Error(`Unsupported backfill source: ${event.source}`);
}
