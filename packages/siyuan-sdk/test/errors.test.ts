/**
 * SDK Errors Test
 */

import { describe, it, expect } from 'vitest';
import {
  SiYuanError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  NetworkError,
  TimeoutError,
  ServerError,
  wrapAxiosError,
} from '../src/errors.js';

describe('Error Classes', () => {
  it('SiYuanError has correct code and message', () => {
    const err = new SiYuanError('AUTH_ERROR', 'Test error');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.message).toBe('Test error');
    expect(err.name).toBe('SiYuanError');
  });

  it('AuthenticationError has AUTH_ERROR code', () => {
    const err = new AuthenticationError('Invalid token', 401);
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('AuthenticationError');
  });

  it('ValidationError has VALIDATION_ERROR code', () => {
    const err = new ValidationError('Missing field');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
  });

  it('NotFoundError has NOT_FOUND code', () => {
    const err = new NotFoundError('Doc not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
  });

  it('NetworkError has NETWORK_ERROR code', () => {
    const err = new NetworkError('Connection refused');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.name).toBe('NetworkError');
  });

  it('TimeoutError has TIMEOUT_ERROR code', () => {
    const err = new TimeoutError('Request timed out');
    expect(err.code).toBe('TIMEOUT_ERROR');
    expect(err.name).toBe('TimeoutError');
  });

  it('ServerError has SERVER_ERROR code', () => {
    const err = new ServerError('Internal error', 500);
    expect(err.code).toBe('SERVER_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('ServerError');
  });

  it('toJSON returns structured error', () => {
    const err = new AuthenticationError('Test', 401);
    const json = err.toJSON();
    expect(json.code).toBe('AUTH_ERROR');
    expect(json.message).toBe('Test');
    expect(json.statusCode).toBe(401);
  });
});

describe('wrapAxiosError', () => {
  it('wraps 401 as AuthenticationError', () => {
    const axiosErr = {
      response: { status: 401, data: { msg: 'Unauthorized' } },
    };
    const wrapped = wrapAxiosError(axiosErr);
    expect(wrapped).toBeInstanceOf(AuthenticationError);
    expect(wrapped.code).toBe('AUTH_ERROR');
  });

  it('wraps 404 as NotFoundError', () => {
    const axiosErr = {
      response: { status: 404, data: { msg: 'Not found' } },
    };
    const wrapped = wrapAxiosError(axiosErr);
    expect(wrapped).toBeInstanceOf(NotFoundError);
  });

  it('wraps 500 as ServerError', () => {
    const axiosErr = {
      response: { status: 500, data: { msg: 'Internal error' } },
    };
    const wrapped = wrapAxiosError(axiosErr);
    expect(wrapped).toBeInstanceOf(ServerError);
    expect(wrapped.statusCode).toBe(500);
  });

  it('wraps ECONNABORTED as TimeoutError', () => {
    const axiosErr = {
      request: {},
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded',
    };
    const wrapped = wrapAxiosError(axiosErr);
    expect(wrapped).toBeInstanceOf(TimeoutError);
  });

  it('wraps network errors as NetworkError', () => {
    const axiosErr = {
      request: {},
      code: 'ECONNREFUSED',
      message: 'Connection refused',
    };
    const wrapped = wrapAxiosError(axiosErr);
    expect(wrapped).toBeInstanceOf(NetworkError);
  });

  it('passes through existing SiYuanError', () => {
    const original = new ValidationError('test');
    const wrapped = wrapAxiosError(original);
    expect(wrapped).toBe(original);
  });

  it('wraps unknown errors as UNKNOWN_ERROR', () => {
    const wrapped = wrapAxiosError('something weird');
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
  });
});
