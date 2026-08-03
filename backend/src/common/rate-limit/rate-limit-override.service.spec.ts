/**
 * Unit tests for the runtime rate-limit override service.
 *
 * These are security-adjacent: a bug here either disables rate limiting when it
 * should be on, or locks out all traffic when it should be permissive. The
 * malformed-input and Redis-failure cases matter as much as the happy path.
 */

import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RateLimitOverrideService } from './rate-limit-override.service';

describe('RateLimitOverrideService', () => {
  /** Builds the service with a stubbed Redis client. */
  async function build(redis: { get: jest.Mock } | null) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RateLimitOverrideService,
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    return moduleRef.get(RateLimitOverrideService);
  }

  describe('without Redis configured', () => {
    it('reports no override, rather than failing', async () => {
      const service = await build(null);
      expect(await service.resolve('create')).toBeNull();
    });
  });

  describe('reading overrides', () => {
    it('returns a limit override', async () => {
      const redis = { get: jest.fn().mockResolvedValue('{"limit":2}') };
      const service = await build(redis);

      expect(await service.resolve('create')).toEqual({ limit: 2 });
      expect(redis.get).toHaveBeenCalledWith('ratelimit:override:create');
    });

    it('returns a disable flag', async () => {
      const redis = { get: jest.fn().mockResolvedValue('{"disabled":true}') };
      const service = await build(redis);
      expect(await service.resolve('auth')).toEqual({ disabled: true });
    });

    it('returns null when no override is set', async () => {
      const redis = { get: jest.fn().mockResolvedValue(null) };
      const service = await build(redis);
      expect(await service.resolve('default')).toBeNull();
    });

    it('reads each bucket from its own key', async () => {
      const redis = { get: jest.fn().mockResolvedValue(null) };
      const service = await build(redis);

      await service.resolve('auth');
      await service.resolve('create');

      expect(redis.get).toHaveBeenCalledWith('ratelimit:override:auth');
      expect(redis.get).toHaveBeenCalledWith('ratelimit:override:create');
    });
  });

  describe('rejecting unusable values', () => {
    it.each([
      ['malformed JSON', 'not json at all'],
      ['a JSON array', '[1,2,3]'],
      ['null', 'null'],
      ['an object with no usable fields', '{"nonsense":1}'],
      ['a zero limit', '{"limit":0}'],
      ['a negative limit', '{"limit":-5}'],
      ['a non-numeric limit', '{"limit":"lots"}'],
      ['NaN', '{"limit":null}'],
    ])('ignores %s', async (_label, raw) => {
      const redis = { get: jest.fn().mockResolvedValue(raw) };
      const service = await build(redis);
      // Never apply a corrupt value — a limit of 0 would lock out all traffic.
      expect(await service.resolve('create')).toBeNull();
    });

    it('floors fractional values', async () => {
      const redis = { get: jest.fn().mockResolvedValue('{"limit":7.9,"ttl":1500.6}') };
      const service = await build(redis);
      expect(await service.resolve('create')).toEqual({ limit: 7, ttl: 1500 });
    });

    it('keeps the valid fields of a partially-invalid override', async () => {
      const redis = { get: jest.fn().mockResolvedValue('{"limit":5,"ttl":-1}') };
      const service = await build(redis);
      expect(await service.resolve('create')).toEqual({ limit: 5 });
    });
  });

  describe('failing open', () => {
    it('reports no override when Redis errors', async () => {
      const redis = { get: jest.fn().mockRejectedValue(new Error('connection lost')) };
      const service = await build(redis);

      // Must NOT throw — the configured limit simply stays in effect.
      expect(await service.resolve('create')).toBeNull();
    });

    it('does not hammer a failing Redis on every request', async () => {
      const redis = { get: jest.fn().mockRejectedValue(new Error('down')) };
      const service = await build(redis);

      await service.resolve('create');
      await service.resolve('create');
      await service.resolve('create');

      // The negative result is cached too, so an outage costs one call, not one
      // per request.
      expect(redis.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('caching', () => {
    it('serves repeat lookups from memory', async () => {
      const redis = { get: jest.fn().mockResolvedValue('{"limit":3}') };
      const service = await build(redis);

      await service.resolve('create');
      await service.resolve('create');

      // A Redis round-trip per request would put network latency on the hot path.
      expect(redis.get).toHaveBeenCalledTimes(1);
    });

    it('caches buckets independently', async () => {
      const redis = { get: jest.fn().mockResolvedValue(null) };
      const service = await build(redis);

      await service.resolve('auth');
      await service.resolve('create');

      expect(redis.get).toHaveBeenCalledTimes(2);
    });

    it('re-reads after the cache is cleared', async () => {
      const redis = { get: jest.fn().mockResolvedValue(null) };
      const service = await build(redis);

      await service.resolve('create');
      service.clearCache();
      await service.resolve('create');

      expect(redis.get).toHaveBeenCalledTimes(2);
    });
  });
});
