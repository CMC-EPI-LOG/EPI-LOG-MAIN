function normalizeBase(value: string): string {
  return value.replace(/\/$/, "");
}

export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) || "";
  return raw ? normalizeBase(raw.trim()) : "";
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

