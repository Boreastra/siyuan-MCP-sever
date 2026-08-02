/**
 * SiYuan SDK - Error Hierarchy
 *
 * Unified error types for all SDK operations.
 * Each error carries a machine-readable code and human-readable message.
 */

export type ErrorCode =
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export class SiYuanError extends Error {
  readonly code: ErrorCode;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, statusCode?: number, cause?: unknown) {
    super(message);
    this.name = 'SiYuanError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export class AuthenticationError extends SiYuanError {
  constructor(message: string, statusCode?: number, cause?: unknown) {
    super('AUTH_ERROR', message, statusCode, cause);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends SiYuanError {
  constructor(message: string, cause?: unknown) {
    super('VALIDATION_ERROR', message, undefined, cause);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends SiYuanError {
  constructor(message: string, cause?: unknown) {
    super('NOT_FOUND', message, undefined, cause);
    this.name = 'NotFoundError';
  }
}

export class NetworkError extends SiYuanError {
  constructor(message: string, cause?: unknown) {
    super('NETWORK_ERROR', message, undefined, cause);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends SiYuanError {
  constructor(message: string, cause?: unknown) {
    super('TIMEOUT_ERROR', message, undefined, cause);
    this.name = 'TimeoutError';
  }
}

export class ServerError extends SiYuanError {
  constructor(message: string, statusCode?: number, cause?: unknown) {
    super('SERVER_ERROR', message, statusCode, cause);
    this.name = 'ServerError';
  }
}

/**
 * Convert an axios error to a SiYuanError.
 */
export function wrapAxiosError(err: unknown): SiYuanError {
  if (err instanceof SiYuanError) return err;

  // Axios error structure
  const anyErr = err as {
    response?: { status?: number; data?: { msg?: string } };
    request?: unknown;
    code?: string;
    message?: string;
  };

  // Response received but with error status
  if (anyErr?.response) {
    const status = anyErr.response.status ?? 500;
    const apiMsg = anyErr.response.data?.msg ?? 'Unknown server error';

    if (status === 401 || status === 403) {
      return new AuthenticationError(`SiYuan auth failed: ${apiMsg}`, status, err);
    }
    if (status === 404) {
      return new NotFoundError(`Not found: ${apiMsg}`, err);
    }
    if (status >= 500) {
      return new ServerError(`SiYuan server error (${status}): ${apiMsg}`, status, err);
    }
    return new SiYuanError('SERVER_ERROR', `SiYuan error (${status}): ${apiMsg}`, status, err);
  }

  // Request made but no response (timeout, network)
  if (anyErr?.request) {
    if (anyErr.code === 'ECONNABORTED' || anyErr.code === 'ETIMEDOUT') {
      return new TimeoutError(`Request timed out: ${anyErr.message ?? 'no message'}`, err);
    }
    return new NetworkError(`Network error: ${anyErr.message ?? 'no message'}`, err);
  }

  // Something else
  return new SiYuanError('UNKNOWN_ERROR', err instanceof Error ? err.message : String(err), undefined, err);
}
