/**
 * Test Helpers - Mock HTTP Client
 *
 * Creates a mock SiYuanHTTPClient for testing SDK modules
 * without making real HTTP requests.
 */

import { vi } from 'vitest';

export interface MockCall {
  endpoint: string;
  payload?: Record<string, unknown>;
}

export function createMockClient() {
  const calls: MockCall[] = [];
  const responses = new Map<string, unknown>();
  const defaultResponse = { code: 0, msg: '', data: {} };

  const mockClient = {
    baseURL: 'http://mock-siyuan:6806',

    async post(endpoint: string, payload?: Record<string, unknown>): Promise<unknown> {
      calls.push({ endpoint, payload });

      // Check for specific endpoint mock
      for (const [pattern, response] of responses) {
        if (endpoint.includes(pattern)) {
          if (response instanceof Error) throw response;
          if (typeof response === 'function') return response(payload);
          // Unwrap apiResponse wrapper: { code, msg, data } → return data
          if (
            response &&
            typeof response === 'object' &&
            'code' in response &&
            'data' in response
          ) {
            return (response as { data: unknown }).data;
          }
          return response;
        }
      }

      return {};
    },

    async get(path: string): Promise<unknown> {
      return { path };
    },

    async ping(): Promise<boolean> {
      return true;
    },

    // Test helpers
    calls,
    mockResponse(pattern: string, response: unknown): void {
      responses.set(pattern, response);
    },
    mockError(pattern: string, error: unknown): void {
      responses.set(pattern, error instanceof Error ? error : new Error(String(error)));
    },
    resetMocks(): void {
      calls.length = 0;
      responses.clear();
    },
    getCalls(): MockCall[] {
      return calls;
    },
    getLastCall(): MockCall | undefined {
      return calls[calls.length - 1];
    },
  };

  return mockClient;
}

/**
 * Create a mock SiYuan API response wrapper.
 */
export function apiResponse(data: unknown, code = 0, msg = '') {
  return { code, msg, data };
}
