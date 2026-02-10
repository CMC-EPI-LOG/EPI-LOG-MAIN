function normalizeBase(value: string): string {
  return value.replace(/\/$/, "");
}

export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) || "";
  if (raw) return normalizeBase(raw.trim());

  // In the Toss miniapp build we default to the deployed Next.js API origin.
  if (process.env.NEXT_PUBLIC_PLATFORM === "TOSS") {
    return "https://epi-log-main.vercel.app";
  }

  // Default to same-origin when running as a normal web app.
  return "";
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}
