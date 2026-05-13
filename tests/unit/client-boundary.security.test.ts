import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOTS = [
  path.resolve(process.cwd(), 'components'),
  path.resolve(process.cwd(), 'hooks'),
  path.resolve(process.cwd(), 'store'),
  path.resolve(process.cwd(), 'miniapps/ait-webview/src'),
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const FORBIDDEN_CLIENT_ENV_NAMES = [
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_SIGNING_SECRET',
  'SENTRY_AUTH_TOKEN',
  'KAKAO_REST_API_KEY',
];
const ALLOWED_CLIENT_ENV_NAMES = new Set([
  'NODE_ENV',
  'NEXT_PUBLIC_PLATFORM',
  'NEXT_PUBLIC_GA_ID',
  'NEXT_PUBLIC_GA4_ID',
  'NEXT_PUBLIC_KAKAO_JS_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_AI_API_URL',
]);
const SECRET_LITERAL_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /KakaoAK\s+[a-f0-9]{32}/gi,
];

function collectSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('client boundary security', () => {
  const clientFiles = CLIENT_ROOTS.flatMap((root) => collectSourceFiles(root));

  it('does not reference server-only env vars from client-executable code', () => {
    const offenders: string[] = [];

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const envName of FORBIDDEN_CLIENT_ENV_NAMES) {
        if (content.includes(`process.env.${envName}`) || content.includes(`import.meta.env.${envName}`)) {
          offenders.push(`${file}:${envName}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('uses only allowlisted process.env names in client code', () => {
    const offenders: string[] = [];
    const pattern = /process\.env\.([A-Z0-9_]+)/g;

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const match of content.matchAll(pattern)) {
        const envName = match[1];
        if (!ALLOWED_CLIENT_ENV_NAMES.has(envName)) {
          offenders.push(`${file}:${envName}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not contain obvious hardcoded secret literals in client-executable code', () => {
    const offenders: string[] = [];

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of SECRET_LITERAL_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
