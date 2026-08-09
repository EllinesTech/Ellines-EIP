/**
 * Standardized error handling for Pages Functions.
 * All API responses follow { statusCode, message, data? } shape.
 */

export interface ErrorResponse {
  statusCode: number;
  message: string;
  data?: unknown;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests') {
    super(429, message);
    this.name = 'TooManyRequestsError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error') {
    super(500, message);
    this.name = 'InternalServerError';
  }
}

export function json(
  data: ErrorResponse | Record<string, unknown>,
  status = 200,
): Response {
  const body = data.statusCode !== undefined
    ? data
    : { statusCode: status, data };

  return new Response(JSON.stringify(body), {
    status: (typeof body.statusCode === 'number' ? body.statusCode : undefined) || status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers':
        'Content-Type, Authorization, X-EIP-Organization-Id, X-EIP-Webhook-Secret',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    },
  });
}

export function options(): Response {
  return json({ statusCode: 200, message: 'OK' });
}

/**
 * Wrap an async handler to catch errors and return standardized responses.
 */
export async function withErrorHandling(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) {
      return json(
        { statusCode: error.statusCode, message: error.message },
        error.statusCode,
      );
    }

    if (error instanceof TypeError) {
      return json(
        { statusCode: 400, message: error.message || 'Invalid input' },
        400,
      );
    }

    if (error instanceof RangeError) {
      return json(
        { statusCode: 413, message: error.message || 'Payload too large' },
        413,
      );
    }

    if (error instanceof SyntaxError) {
      return json(
        { statusCode: 400, message: error.message || 'Invalid request' },
        400,
      );
    }

    console.error('Unhandled error:', error);
    return json(
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
  }
}
