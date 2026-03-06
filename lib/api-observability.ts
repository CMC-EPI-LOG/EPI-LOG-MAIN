import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';

type LogLevel = 'info' | 'warn' | 'error';
type BreadcrumbLevel = 'info' | 'warning' | 'error';

export type ApiHandler = (request: Request) => Promise<Response> | Response;

function addSentryBreadcrumb(breadcrumb: {
  category: string;
  level: BreadcrumbLevel;
  message: string;
  data?: Record<string, unknown>;
}) {
  const candidate = (Sentry as { addBreadcrumb?: (input: unknown) => void }).addBreadcrumb;
  if (typeof candidate === 'function') {
    candidate(breadcrumb);
  }
}

function captureSentryException(
  error: unknown,
  context: { route: string; method: string; requestId: string; durationMs: number },
) {
  const withScope = (Sentry as {
    withScope?: (cb: (scope: {
      setTag: (key: string, value: string) => void;
      setExtra: (key: string, value: unknown) => void;
    }) => void) => void;
  }).withScope;
  const captureException = (Sentry as { captureException?: (error: Error) => void }).captureException;

  if (typeof withScope === 'function' && typeof captureException === 'function') {
    withScope((scope) => {
      scope.setTag('api.route', context.route);
      scope.setTag('api.method', context.method);
      scope.setTag('request_id', context.requestId);
      scope.setExtra('duration_ms', context.durationMs);
      captureException(error instanceof Error ? error : new Error(String(error)));
    });
    return;
  }

  if (typeof captureException === 'function') {
    captureException(error instanceof Error ? error : new Error(String(error)));
  }
}

function logStructured(level: LogLevel, event: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  });

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

function statusToLevel(status: number): BreadcrumbLevel {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warning';
  return 'info';
}

function withRequestIdHeader(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function withApiObservability(route: string, method: string, handler: ApiHandler): ApiHandler {
  return async (request: Request) => {
    const requestId = request.headers.get('x-request-id') || randomUUID();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    const observedRequest = new Request(request, { headers: requestHeaders });
    const startedAt = Date.now();
    const url = new URL(observedRequest.url);
    const path = url.pathname;

    addSentryBreadcrumb({
      category: 'api.request',
      level: 'info',
      message: `${method} ${path}`,
      data: {
        route,
        request_id: requestId,
      },
    });

    logStructured('info', 'api.request', {
      route,
      method,
      path,
      request_id: requestId,
    });

    try {
      const response = await handler(observedRequest);
      const durationMs = Date.now() - startedAt;
      const level = statusToLevel(response.status);

      addSentryBreadcrumb({
        category: 'api.response',
        level,
        message: `${method} ${path} -> ${response.status}`,
        data: {
          route,
          request_id: requestId,
          status: response.status,
          duration_ms: durationMs,
        },
      });

      logStructured(level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'info', 'api.response', {
        route,
        method,
        path,
        request_id: requestId,
        status: response.status,
        duration_ms: durationMs,
      });

      return withRequestIdHeader(response, requestId);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = error instanceof Error ? error.message : String(error);

      addSentryBreadcrumb({
        category: 'api.exception',
        level: 'error',
        message: `${method} ${path} exception`,
        data: {
          route,
          request_id: requestId,
          duration_ms: durationMs,
          error: errorMessage,
        },
      });

      captureSentryException(error, {
        route,
        method,
        requestId,
        durationMs,
      });

      logStructured('error', 'api.exception', {
        route,
        method,
        path,
        request_id: requestId,
        duration_ms: durationMs,
        error: errorMessage,
      });

      throw error;
    }
  };
}

export function logStructuredInfo(event: string, payload: Record<string, unknown>) {
  logStructured('info', event, payload);
}

export function logStructuredWarn(event: string, payload: Record<string, unknown>) {
  logStructured('warn', event, payload);
}

export function logStructuredError(event: string, payload: Record<string, unknown>) {
  logStructured('error', event, payload);
}
