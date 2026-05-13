import * as Sentry from "@sentry/nextjs";
import { sanitizeSentryEvent } from "@/lib/securityRedaction";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  enableLogs: true,
  beforeSend(event) {
    if (event.user) {
      delete event.user.ip_address;
    }
    return sanitizeSentryEvent(event);
  },
});
