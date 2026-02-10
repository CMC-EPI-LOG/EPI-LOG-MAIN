const DEFAULT_ALLOWED_METHODS = "GET,POST,OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
  } as const;
}

