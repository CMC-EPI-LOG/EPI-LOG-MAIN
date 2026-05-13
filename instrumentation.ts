import * as Sentry from "@sentry/nextjs";
import { validateCriticalServerEnv } from "@/lib/serverEnv";

export async function register() {
  validateCriticalServerEnv();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
