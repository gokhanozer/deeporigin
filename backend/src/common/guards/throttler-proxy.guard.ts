/**
 * Proxy-aware rate-limiting guard.
 *
 * The stock `ThrottlerGuard` keys its buckets on `req.ip`. Behind nginx, a load
 * balancer or Docker's userland proxy that value is the *proxy's* address, so
 * every visitor shares one bucket: a single busy user would rate-limit the
 * entire internet, and an attacker would still get the full allowance per
 * container. Overriding the tracker with the real client IP fixes both.
 */

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { extractClientIp } from '../utils/request.util';

@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  /**
   * Produces the bucket key for a request.
   *
   * Authenticated requests are keyed by user ID so that several colleagues
   * behind one office NAT are not throttled as a single client; anonymous
   * requests fall back to the resolved client IP.
   *
   * @param request Inbound Express request.
   * @returns A stable identifier for the caller.
   */
  protected async getTracker(request: Request): Promise<string> {
    const user = (request as Request & { user?: { id?: string } }).user;
    if (user?.id) return `user:${user.id}`;
    return `ip:${extractClientIp(request)}`;
  }
}
