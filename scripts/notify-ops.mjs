#!/usr/bin/env node

import crypto from 'node:crypto';

const [
  ,
  ,
  title = 'Workflow failed',
  body = '',
] = process.argv;

const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '';

async function sendDiscord(message) {
  if (!discordWebhook) return;
  await fetch(discordWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });
}

async function sendTelegram(message) {
  if (!telegramToken || !telegramChatId) return;
  await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: message,
    }),
  });
}

async function sendSentry(message) {
  if (!sentryDsn) return;
  try {
    const target = new URL(sentryDsn);
    const projectId = target.pathname.replace(/\//g, '');
    if (!projectId) return;
    const auth = target.username;
    const host = `${target.protocol}//${target.host}`;
    const envelopeUrl = `${host}/api/${projectId}/envelope/`;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const payload = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({
        type: 'event',
        level: 'error',
        platform: 'node',
        message,
        tags: { source: 'github-actions' },
      }),
    ].join('\n');

    await fetch(envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${auth}, sentry_client=workflow-notify/1.0`,
      },
      body: payload,
    });
  } catch (error) {
    console.warn('[notify-ops] sentry notify failed:', error);
  }
}

const message = [title, body].filter(Boolean).join('\n');

await Promise.allSettled([
  sendDiscord(message),
  sendTelegram(message),
  sendSentry(message),
]);
