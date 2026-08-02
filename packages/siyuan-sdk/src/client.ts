/**
 * SiYuan SDK - HTTP Client
 *
 * Core HTTP layer: handles authentication, retry, timeout, and error mapping.
 * All API modules delegate to this client — no raw fetch/axios elsewhere.
 */

import axios, { AxiosInstance } from 'axios';
import type { SiYuanClientConfig, SiYuanAPIResponse } from './types.js';
import { wrapAxiosError, SiYuanError } from './errors.js';
import { logger } from './logger.js';

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRY = 3;
const DEFAULT_RETRY_DELAY = 1000;

export class SiYuanHTTPClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: Required<SiYuanClientConfig>;

  constructor(config: SiYuanClientConfig) {
    const url = (config.url || process.env.SIYUAN_URL || 'http://127.0.0.1:6806').replace(/\/+$/, '');
    const token = config.token ?? process.env.SIYUAN_TOKEN ?? '';
    const timeout = config.timeout ?? Number(process.env.TIMEOUT) ?? DEFAULT_TIMEOUT;
    const retry = config.retry ?? Number(process.env.RETRY) ?? DEFAULT_RETRY;

    this.config = {
      url,
      token,
      timeout,
      retry,
      retryDelay: DEFAULT_RETRY_DELAY,
    };

    this.axiosInstance = axios.create({
      baseURL: url,
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    });

    logger.info('SiYuan HTTP client initialized', {
      url,
      timeout,
      retry,
      hasToken: !!token,
    });
  }

  /** Get the base URL (without trailing slash) */
  get baseURL(): string {
    return this.config.url;
  }

  /**
   * Send a POST request to a SiYuan API endpoint.
   * Retries on network/timeout errors.
   */
  async post<T = unknown>(endpoint: string, payload?: Record<string, unknown>): Promise<T> {
    const url = endpoint.startsWith('/api/') ? endpoint : `/api/${endpoint}`;
    const maxAttempts = this.config.retry + 1;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug('API request', { url, attempt, maxAttempts });

        const response = await this.axiosInstance.post<SiYuanAPIResponse<T>>(url, payload ?? {});

        const body = response.data;

        // SiYuan API convention: code 0 = success, non-zero = error
        if (body.code !== 0) {
          const msg = body.msg;
          if (msg) {
            logger.warn('SiYuan API returned error', { url, code: body.code, msg });

            if (body.code === 401) {
              throw new (await import('./errors.js')).AuthenticationError(msg, 401);
            }
            throw new (await import('./errors.js')).SiYuanError('SERVER_ERROR', msg, body.code);
          }

          // Non-standard response: no msg field — log raw body for diagnosis
          const rawBody = JSON.stringify(body).slice(0, 2000);
          logger.error('SiYuan API returned unrecognized response (no code/msg)', {
            url,
            payload: JSON.stringify(payload).slice(0, 500),
            rawBody,
          });
          throw new (await import('./errors.js')).SiYuanError(
            'SERVER_ERROR',
            `SiYuan API returned unrecognized response. Raw: ${rawBody}`,
            body.code,
          );
        }

        return body.data;
      } catch (err) {
        lastError = err;

        // Don't retry on auth/validation errors — retrying won't help
        if (err instanceof SiYuanError && err.code !== 'NETWORK_ERROR' && err.code !== 'TIMEOUT_ERROR') {
          throw err;
        }

        const wrapped = wrapAxiosError(err);

        // Retryable?
        if (attempt < maxAttempts && (wrapped.code === 'NETWORK_ERROR' || wrapped.code === 'TIMEOUT_ERROR')) {
          const delay = this.config.retryDelay * attempt;
          logger.warn('Request failed, retrying', {
            url,
            attempt,
            delay,
            error: wrapped.message,
          });
          await sleep(delay);
          continue;
        }

        throw wrapped;
      }
    }

    // Should not reach here, but just in case
    throw wrapAxiosError(lastError);
  }

  /**
   * Raw GET request (used for health check etc.)
   */
  async get(path: string): Promise<unknown> {
    try {
      const response = await this.axiosInstance.get(path);
      return response.data;
    } catch (err) {
      throw wrapAxiosError(err);
    }
  }

  /** Check connectivity by calling a lightweight API */
  async ping(): Promise<boolean> {
    try {
      await this.post('system/version');
      return true;
    } catch {
      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
