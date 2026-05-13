import { ZodError, type ZodType } from "zod";

export class RequestBodyParseError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ParseJsonOptions<T> = {
  maxBytes: number;
  schema: ZodType<T>;
  emptyValue?: T;
};

export async function parseJsonBodyWithSchema<T>(
  request: Request,
  options: ParseJsonOptions<T>,
): Promise<T> {
  const raw = await request.text();
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > options.maxBytes) {
    throw new RequestBodyParseError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Request body must be ${options.maxBytes} bytes or less.`,
    );
  }

  if (!raw.trim()) {
    if (options.emptyValue !== undefined) {
      return options.emptyValue;
    }

    throw new RequestBodyParseError(400, "EMPTY_BODY", "Request body is required.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch {
    throw new RequestBodyParseError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  try {
    return options.schema.parse(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new RequestBodyParseError(
        400,
        "INVALID_PAYLOAD",
        "Request payload does not match the expected schema.",
        error.issues,
      );
    }

    throw error;
  }
}
