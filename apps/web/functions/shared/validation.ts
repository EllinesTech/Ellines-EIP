/**
 * Input validation helpers for security and data integrity.
 * Prevents XSS, SQL injection (via Supabase types), and DOS via large payloads.
 */

export interface ValidationConfig {
  maxLength: number;
  minLength?: number;
  pattern?: RegExp;
  sanitize?: boolean;
}

/**
 * Validate and sanitize a string input.
 * - Checks length bounds
 * - Optionally matches regex pattern
 * - Strips HTML/script tags if sanitize=true
 */
export function validateString(value: unknown, config: ValidationConfig): string {
  if (typeof value !== 'string') {
    throw new TypeError('Value must be a string');
  }

  if (value.length > config.maxLength) {
    throw new RangeError(`Value exceeds max length of ${config.maxLength}`);
  }

  if (config.minLength && value.length < config.minLength) {
    throw new RangeError(`Value is shorter than min length of ${config.minLength}`);
  }

  if (config.pattern && !config.pattern.test(value)) {
    throw new SyntaxError(`Value does not match required pattern`);
  }

  if (config.sanitize) {
    return sanitizeHtml(value);
  }

  return value;
}

/**
 * Basic HTML sanitization: strips script tags and event handlers.
 * For production, use DOMPurify or similar.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');
}

/**
 * Validate an email address (basic RFC 5322 approximation).
 */
export function validateEmail(value: unknown): string {
  const email = validateString(value, {
    maxLength: 254,
    minLength: 3,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  });
  return email.toLowerCase().trim();
}

/**
 * Validate a password.
 * Enforces minimum length and recommends complexity.
 */
export function validatePassword(value: unknown, minLength = 8): string {
  const pwd = validateString(value, {
    maxLength: 256,
    minLength,
  });

  // Optional: enforce complexity (uppercase, lowercase, number, symbol)
  // For MVP, just require length. Uncomment below for stricter security:
  // const hasUpper = /[A-Z]/.test(pwd);
  // const hasLower = /[a-z]/.test(pwd);
  // const hasNumber = /\d/.test(pwd);
  // const hasSymbol = /[!@#$%^&*]/.test(pwd);
  // if (!(hasUpper && hasLower && hasNumber)) {
  //   throw new Error('Password must contain uppercase, lowercase, and number');
  // }

  return pwd;
}

/**
 * Validate a URL.
 */
export function validateUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('URL must be a string');
  }
  try {
    new URL(value);
  } catch {
    throw new SyntaxError('Invalid URL');
  }
  return value;
}

/**
 * Validate an object by checking required fields and types.
 */
export function validateObject<T extends Record<string, unknown>>(
  obj: unknown,
  schema: Record<keyof T, { type: string; required?: boolean }>,
): T {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError('Value must be an object');
  }

  const result: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(schema)) {
    const value = (obj as Record<string, unknown>)[key];
    if (rule.required && (value === undefined || value === null)) {
      throw new Error(`Required field missing: ${key}`);
    }
    if (value !== undefined && typeof value !== rule.type) {
      throw new TypeError(`Field ${key} must be ${rule.type}, got ${typeof value}`);
    }
    result[key] = value;
  }

  return result as T;
}

/**
 * Check request content-length before parsing JSON to prevent DOS.
 */
export function checkContentLength(request: Request, maxBytes = 5_000_000): void {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxBytes) {
    throw new RangeError(`Payload exceeds maximum size of ${maxBytes} bytes`);
  }
}

/**
 * Validate a connector ID or similar identifier (alphanumeric + dashes).
 */
export function validateIdentifier(value: unknown, maxLength = 80): string {
  return validateString(value, {
    maxLength,
    minLength: 1,
    pattern: /^[a-zA-Z0-9-_]+$/,
  });
}

/**
 * Validate a UUID v4.
 */
export function validateUuid(value: unknown): string {
  return validateString(value, {
    maxLength: 36,
    minLength: 36,
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  });
}
