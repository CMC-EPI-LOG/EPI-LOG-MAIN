'use client';

import { useEffect } from 'react';
import { Analytics } from '@apps-in-toss/web-framework';
import { GA_ID, persistUtmAttribution, trackCoreEvent, trackPageview } from '@/lib/analytics/ga';

const BOOTSTRAP_KEY = '__aisoom_analytics_bootstrap_v1';
const ENTRY_TRACKED_KEY = '__aisoom_miniapp_entry_tracked_v1';
const LAST_PAGE_PATH_KEY = '__aisoom_last_page_path_v1';
const HISTORY_CHANGE_EVENT = 'aisoom:history-change';
const G_TAG_DATA_ATTR = 'data-aisoom-gtag';

declare global {
  interface Window {
    __aisoomHistoryPatched?: boolean;
  }
}

function readSessionValue(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage write errors
  }
}

function getCurrentPagePath() {
  const { pathname, search } = window.location;
  return search ? `${pathname}${search}` : pathname;
}

function resolveEntrySource() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('utm_source') ||
    params.get('ref') ||
    params.get('source') ||
    (params.get('shared_by') ? 'share' : 'direct')
  );
}

function ensureGtagInitialized(gaId: string) {
  if (!gaId) return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args as unknown as object);
    };
  }

  window.gtag('js', new Date());
  window.gtag('config', gaId, {
    anonymize_ip: true,
    send_page_view: false,
  });

  const existingScript = document.querySelector(`script[${G_TAG_DATA_ATTR}="${gaId}"]`);
  if (existingScript) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  script.setAttribute(G_TAG_DATA_ATTR, gaId);
  document.head.appendChild(script);
}

function patchHistoryChangeEvent() {
  if (window.__aisoomHistoryPatched) return;
  window.__aisoomHistoryPatched = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  const emitHistoryChange = () => {
    window.dispatchEvent(new Event(HISTORY_CHANGE_EVENT));
  };

  window.history.pushState = ((...args: Parameters<History['pushState']>) => {
    originalPushState(...args);
    emitHistoryChange();
  }) as History['pushState'];

  window.history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    originalReplaceState(...args);
    emitHistoryChange();
  }) as History['replaceState'];
}

export default function AnalyticsBootstrap() {
  useEffect(() => {
    persistUtmAttribution(window.location.search.slice(1) || undefined);

    if (!GA_ID) return;

    ensureGtagInitialized(GA_ID);
    patchHistoryChangeEvent();

    const trackCurrentPage = () => {
      persistUtmAttribution(window.location.search.slice(1) || undefined);

      const pagePath = getCurrentPagePath();
      const lastTrackedPath = readSessionValue(LAST_PAGE_PATH_KEY);
      if (lastTrackedPath === pagePath) return;

      writeSessionValue(LAST_PAGE_PATH_KEY, pagePath);
      Promise.resolve(
        Analytics.screen({
          page_path: pagePath,
          platform: process.env.NEXT_PUBLIC_PLATFORM || 'TOSS',
        }),
      ).catch(() => {
        // Ignore bridge failures so app rendering is unaffected.
      });
      trackPageview(GA_ID, pagePath);
      trackCoreEvent('miniapp_pageview', {
        page_path: pagePath,
        platform: process.env.NEXT_PUBLIC_PLATFORM || 'TOSS',
      });
    };

    if (!readSessionValue(BOOTSTRAP_KEY)) {
      writeSessionValue(BOOTSTRAP_KEY, '1');
      if (!readSessionValue(ENTRY_TRACKED_KEY)) {
        writeSessionValue(ENTRY_TRACKED_KEY, '1');
        trackCoreEvent('miniapp_entry', {
          entry_source: resolveEntrySource(),
          page_path: getCurrentPagePath(),
          platform: process.env.NEXT_PUBLIC_PLATFORM || 'TOSS',
        });
      }
    }

    trackCurrentPage();
    window.addEventListener('popstate', trackCurrentPage);
    window.addEventListener('hashchange', trackCurrentPage);
    window.addEventListener(HISTORY_CHANGE_EVENT, trackCurrentPage);

    return () => {
      window.removeEventListener('popstate', trackCurrentPage);
      window.removeEventListener('hashchange', trackCurrentPage);
      window.removeEventListener(HISTORY_CHANGE_EVENT, trackCurrentPage);
    };
  }, []);

  return null;
}
