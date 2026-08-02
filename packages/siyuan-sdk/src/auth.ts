/**
 * SiYuan SDK - Auth Module
 */

import type { SiYuanHTTPClient } from './client.js';

export interface SystemInfo {
  /** SiYuan version string */
  version: string;
  /** Whether the kernel is running */
  kernelStarted: boolean;
}

export class AuthModule {
  constructor(private readonly client: SiYuanHTTPClient) {}

  /** Verify that the token is valid by calling a lightweight system API */
  async checkAuth(): Promise<boolean> {
    try {
      await this.client.post('system/version');
      return true;
    } catch {
      return false;
    }
  }

  /** Get SiYuan version and system status */
  async getSystemInfo(): Promise<SystemInfo> {
    const data = await this.client.post<{ version: string; bazaar: boolean; disabledPlugins: string[] }>(
      'system/version',
    );
    return {
      version: data.version,
      kernelStarted: true,
    };
  }

  /** Get the current user's SiYuan token status (without exposing the token) */
  async getStatus(): Promise<{ authenticated: boolean; version: string }> {
    const ok = await this.checkAuth();
    let version = 'unknown';
    if (ok) {
      const info = await this.getSystemInfo();
      version = info.version;
    }
    return { authenticated: ok, version };
  }
}
