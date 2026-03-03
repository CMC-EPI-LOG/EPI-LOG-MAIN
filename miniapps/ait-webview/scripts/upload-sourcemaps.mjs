import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const sentryCliPath = path.join(projectRoot, "node_modules", ".bin", "sentry-cli");

const requiredEnvKeys = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"];
const missingEnvKeys = requiredEnvKeys.filter((key) => !process.env[key]);
if (missingEnvKeys.length > 0) {
  console.error(
    `[sentry-upload] Missing environment variables: ${missingEnvKeys.join(", ")}`,
  );
  process.exit(1);
}

const release =
  process.env.SENTRY_RELEASE ||
  process.env.VITE_SENTRY_RELEASE ||
  process.env.VERCEL_GIT_COMMIT_SHA;

if (!release) {
  console.error(
    "[sentry-upload] Missing release identifier. Set SENTRY_RELEASE or VITE_SENTRY_RELEASE.",
  );
  process.exit(1);
}

if (!existsSync(sentryCliPath)) {
  console.error(
    "[sentry-upload] sentry-cli binary not found. Run `npm install` in miniapps/ait-webview first.",
  );
  process.exit(1);
}

function runSentry(args, allowFailure = false) {
  const result = spawnSync(sentryCliPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 1;
}

const webDistPath = path.join(projectRoot, "dist", "web");
const nativeDistPath = path.join(projectRoot, "dist");

const releaseExists =
  runSentry(["releases", "info", release], true) === 0;
if (!releaseExists) {
  runSentry(["releases", "new", release]);
}

if (existsSync(webDistPath)) {
  runSentry([
    "releases",
    "files",
    release,
    "upload-sourcemaps",
    webDistPath,
    "--url-prefix",
    "~/web",
    "--rewrite",
    "--validate",
  ]);
}

if (existsSync(nativeDistPath)) {
  runSentry([
    "releases",
    "files",
    release,
    "upload-sourcemaps",
    nativeDistPath,
    "--url-prefix",
    "~/",
    "--ext",
    "js",
    "--ext",
    "map",
    "--ignore",
    "web",
    "--rewrite",
    "--validate",
  ]);
}

runSentry(["releases", "finalize", release]);

console.log(`[sentry-upload] Completed sourcemap upload for release: ${release}`);
