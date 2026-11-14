import { Injectable, Logger } from '@nestjs/common';

/**
 * CRDT Conflict Resolution Service.
 * Feature 022: Offline-First CRDT Sync
 *
 * Implements three conflict resolution strategies:
 * - LWW (Last-Write-Wins): for pet stats (hunger, happiness, etc.)
 * - Merge: for inventory (union of items)
 * - Deterministic: for combat (seed-based, log is immutable)
 */

export type ConflictType = 'stats' | 'inventory' | 'combat';

export interface ConflictEntry {
  key: string;
  localValue: unknown;
  remoteValue: unknown;
  localTimestamp: number;
  remoteTimestamp: number;
  type: ConflictType;
}

export interface ResolvedConflict {
  key: string;
  value: unknown;
  resolution: 'lww_local' | 'lww_remote' | 'merge' | 'deterministic';
}

@Injectable()
export class CrdtService {
  private readonly logger = new Logger(CrdtService.name);

  /**
   * Resolve a batch of conflicts.
   */
  resolveConflicts(conflicts: ConflictEntry[]): ResolvedConflict[] {
    return conflicts.map((c) => this.resolveSingle(c));
  }

  /**
   * Resolve a single conflict entry based on its type.
   */
  private resolveSingle(conflict: ConflictEntry): ResolvedConflict {
    switch (conflict.type) {
      case 'stats':
        return this.resolveLww(conflict);
      case 'inventory':
        return this.resolveMerge(conflict);
      case 'combat':
        return this.resolveDeterministic(conflict);
      default:
        // Default to LWW
        return this.resolveLww(conflict);
    }
  }

  /**
   * Last-Write-Wins: newer timestamp wins.
   * For stats: server wins for decay, client wins for user actions.
   */
  private resolveLww(conflict: ConflictEntry): ResolvedConflict {
    if (conflict.localTimestamp >= conflict.remoteTimestamp) {
      return {
        key: conflict.key,
        value: conflict.localValue,
        resolution: 'lww_local',
      };
    }
    return {
      key: conflict.key,
      value: conflict.remoteValue,
      resolution: 'lww_remote',
    };
  }

  /**
   * Merge: union of both values (for inventory items).
   * If duplicate keys exist, take the higher count.
   */
  private resolveMerge(conflict: ConflictEntry): ResolvedConflict {
    const local = this.toArray(conflict.localValue);
    const remote = this.toArray(conflict.remoteValue);

    const merged = new Map<string, unknown>();

    for (const item of local) {
      const key = this.getItemKey(item);
      merged.set(key, item);
    }

    for (const item of remote) {
      const key = this.getItemKey(item);
      const existing = merged.get(key);
      if (existing) {
        // Take the higher count
        merged.set(key, this.pickHigher(existing, item));
      } else {
        merged.set(key, item);
      }
    }

    return {
      key: conflict.key,
      value: Array.from(merged.values()),
      resolution: 'merge',
    };
  }

  /**
   * Deterministic: for combat, the log is immutable (seed-based).
   * Always use the remote (server) value.
   */
  private resolveDeterministic(conflict: ConflictEntry): ResolvedConflict {
    return {
      key: conflict.key,
      value: conflict.remoteValue,
      resolution: 'deterministic',
    };
  }

  private toArray(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).map(([k, v]) => ({ id: k, ...v as object }));
    }
    return [];
  }

  private getItemKey(item: Record<string, unknown>): string {
    return String(item.id ?? item.itemId ?? item.key ?? JSON.stringify(item));
  }

  private pickHigher(a: unknown, b: unknown): unknown {
    const countA = Number((a as Record<string, unknown>)?.count ?? 1);
    const countB = Number((b as Record<string, unknown>)?.count ?? 1);
    return countB > countA ? b : a;
  }
}
