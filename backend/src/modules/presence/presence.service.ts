import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Presence Service — tracks device presence via Redis.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Maintains a Redis hash per user with device heartbeats.
 * Devices expire after 90s without heartbeat.
 */
export interface DevicePresenceInfo {
  deviceId: string;
  platform: string;
  lastHeartbeat: number; // unix ms
  status: 'online' | 'offline';
}

const HEARTBEAT_INTERVAL_MS = 30000; // 30s
const EXPIRE_MS = 90000; // 90s
const REDIS_KEY_PREFIX = 'petai:presence:';

@Injectable()
export class PresenceService implements OnModuleInit {
  private readonly logger = new Logger(PresenceService.name);

  // In-memory presence store (production would use Redis)
  private readonly presence = new Map<string, Map<string, { platform: string; lastHeartbeat: number }>>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('PresenceService initialized');
  }

  /**
   * Record a heartbeat for a device.
   */
  heartbeat(userId: string, deviceId: string, platform: string): void {
    let userPresence = this.presence.get(userId);
    if (!userPresence) {
      userPresence = new Map();
      this.presence.set(userId, userPresence);
    }

    userPresence.set(deviceId, {
      platform,
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * Get all device presences for a user.
   * Devices without heartbeat in 90s are marked offline.
   */
  getPresence(userId: string): DevicePresenceInfo[] {
    const userPresence = this.presence.get(userId);
    if (!userPresence) return [];

    const now = Date.now();

    return Array.from(userPresence.entries()).map(([deviceId, data]) => {
      const isOnline = now - data.lastHeartbeat < EXPIRE_MS;
      return {
        deviceId,
        platform: data.platform,
        lastHeartbeat: data.lastHeartbeat,
        status: isOnline ? 'online' : 'offline',
      };
    });
  }

  /**
   * Check if a user has at least one online device.
   */
  hasActiveDevices(userId: string): boolean {
    const presences = this.getPresence(userId);
    return presences.some((p) => p.status === 'online');
  }

  /**
   * Remove a device (disconnection).
   */
  removeDevice(userId: string, deviceId: string): void {
    this.presence.get(userId)?.delete(deviceId);
  }

  /**
   * Clean up expired presences (call periodically).
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [userId, devices] of this.presence) {
      for (const [deviceId, data] of devices) {
        if (now - data.lastHeartbeat > EXPIRE_MS * 3) {
          devices.delete(deviceId);
          removed++;
        }
      }
      if (devices.size === 0) {
        this.presence.delete(userId);
      }
    }

    if (removed > 0) {
      this.logger.debug(`Cleaned up ${removed} expired device presences`);
    }

    return removed;
  }
}
