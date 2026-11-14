import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Co-op Care Service — handles visit actions between friends.
 * Feature 021: Multi-Device Presence + Co-op
 *
 * Validates friendship, rate limits visits (5/day/pet/visitor),
 * and processes visit actions (feed, play, clean).
 */
export interface VisitAction {
  action: 'feed' | 'play' | 'clean';
  petId: string;
  itemId?: string; // for feed
}

export interface VisitResult {
  success: boolean;
  message: string;
  xpGained: number;
  petState?: { hunger: number; happiness: number; hygiene: number };
}

const MAX_VISITS_PER_DAY = 5;
const MAX_FRIENDS = 10;

// In-memory stores (production: Prisma + Redis)
const friendshipStore = new Map<string, { ownerId: string; visitorId: string; status: string }>();
const visitCountStore = new Map<string, number>(); // key: `${petId}:${visitorId}:${date}`

@Injectable()
export class CoopCareService {
  private readonly logger = new Logger(CoopCareService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Check if a visitor has an accepted friendship with the pet owner.
   */
  async checkFriendship(ownerId: string, visitorId: string): Promise<boolean> {
    const friendship = friendshipStore.get(`${ownerId}:${visitorId}`);
    return friendship?.status === 'accepted';
  }

  /**
   * Process a visit action.
   */
  async processVisit(
    ownerId: string,
    visitorId: string,
    action: VisitAction,
  ): Promise<VisitResult> {
    // 1. Validate friendship
    const hasFriendship = await this.checkFriendship(ownerId, visitorId);
    if (!hasFriendship) {
      throw new ForbiddenException('No accepted friendship with pet owner');
    }

    // 2. Rate limit check
    const dateKey = new Date().toISOString().slice(0, 10);
    const rateKey = `${action.petId}:${visitorId}:${dateKey}`;
    const visitCount = visitCountStore.get(rateKey) ?? 0;

    if (visitCount >= MAX_VISITS_PER_DAY) {
      throw new HttpException(
        `Daily visit limit reached (${MAX_VISITS_PER_DAY} per pet per day)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Process action (limited stat changes: max 10%)
    const statDelta = this.applyActionLimited(action.action);
    visitCountStore.set(rateKey, visitCount + 1);

    const xpGained = this.getXpForAction(action.action);

    this.logger.debug(
      `Visit: ${visitorId} → ${ownerId}'s pet ${action.petId}, action=${action.action}, xp=${xpGained}`,
    );

    return {
      success: true,
      message: `Successfully ${action.action} the pet`,
      xpGained,
      petState: {
        hunger: statDelta.hunger,
        happiness: statDelta.happiness,
        hygiene: statDelta.hygiene,
      },
    };
  }

  /**
   * Get visit history for a pet owner.
   */
  async getVisitHistory(ownerId: string, petId?: string): Promise<Array<{
    visitorId: string;
    action: string;
    petId: string;
    xpGained: number;
    createdAt: string;
  }>> {
    // In production: query Prisma CoopVisit table
    // For now, return empty (will be populated by DB in full implementation)
    return [];
  }

  /**
   * Add a friendship (owner approves visitor).
   */
  async addFriendship(ownerId: string, visitorId: string): Promise<void> {
    const currentFriends = this.getFriendCount(ownerId);
    if (currentFriends >= MAX_FRIENDS) {
      throw new HttpException(
        `Maximum number of friends reached (${MAX_FRIENDS})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    friendshipStore.set(`${ownerId}:${visitorId}`, {
      ownerId,
      visitorId,
      status: 'accepted',
    });
  }

  /**
   * Revoke a friendship.
   */
  async revokeFriendship(ownerId: string, visitorId: string): Promise<void> {
    friendshipStore.delete(`${ownerId}:${visitorId}`);
  }

  /**
   * Get number of friends for a user.
   */
  private getFriendCount(ownerId: string): number {
    let count = 0;
    for (const key of friendshipStore.keys()) {
      if (key.startsWith(`${ownerId}:`)) count++;
    }
    return count;
  }

  /**
   * Apply action with stat limits (max 10% change per visit).
   */
  private applyActionLimited(action: string): { hunger: number; happiness: number; hygiene: number } {
    const MAX_DELTA = 10; // 10% max stat change per visit

    switch (action) {
      case 'feed':
        return { hunger: MAX_DELTA, happiness: 2, hygiene: 0 };
      case 'play':
        return { hunger: -3, happiness: MAX_DELTA, hygiene: -2 };
      case 'clean':
        return { hunger: 0, happiness: 3, hygiene: MAX_DELTA };
      default:
        return { hunger: 0, happiness: 0, hygiene: 0 };
    }
  }

  /**
   * XP for each visit action type.
   */
  private getXpForAction(action: string): number {
    switch (action) {
      case 'feed': return 5;
      case 'play': return 10;
      case 'clean': return 8;
      default: return 2;
    }
  }
}
