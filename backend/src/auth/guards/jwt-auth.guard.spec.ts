/**
 * Tests for the authentication guards' rejection behaviour.
 *
 * The three guards differ only in what they do when no valid token is present,
 * which is exactly the behaviour worth pinning: each choice is deliberate and
 * a silent change to any of them would alter who can reach what.
 */

import { UnauthorizedException } from '@nestjs/common';
import { LinkOwnerAuthGuard, OptionalJwtAuthGuard } from './jwt-auth.guard';

describe('LinkOwnerAuthGuard', () => {
  const guard = new LinkOwnerAuthGuard();
  const message = "Anonymous users can't edit existing URLs — create a new one instead.";

  it('rejects an anonymous caller with actionable guidance', () => {
    // A bare "Unauthorized" states the rule without saying what to do about it.
    expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedException);
    expect(() => guard.handleRequest(null, false)).toThrow(message);
  });

  it('rejects an invalid or expired token the same way', () => {
    expect(() => guard.handleRequest(new Error('jwt expired'), false)).toThrow(message);
  });

  it('rejects when Passport reports an error even with a user present', () => {
    expect(() => guard.handleRequest(new Error('malformed'), { id: 'user-1' })).toThrow(
      UnauthorizedException,
    );
  });

  it('passes an authenticated user through untouched', () => {
    const user = { id: 'user-1', email: 'a@b.com' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('never rejects — an anonymous caller proceeds', () => {
    expect(guard.handleRequest(null, false)).toBeUndefined();
  });

  it('treats an invalid token as no token rather than failing', () => {
    // This is what lets a stale token still shorten a URL anonymously.
    expect(guard.handleRequest(new Error('jwt expired'), false)).toBeUndefined();
  });

  it('passes an authenticated user through, so the link gets an owner', () => {
    const user = { id: 'user-1', email: 'a@b.com' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
