/**
 * Unit tests for {@link AnalyticsService}.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AnalyticsService,
  countDistinctVisitors,
  round1,
  toBreakdown,
} from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    link: {
      count: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    visit: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const configStub = {
    get: (key: string) => {
      if (key === 'publicBaseUrl') return 'https://short.ly';
      return undefined;
    },
  };

  beforeEach(async () => {
    prisma = {
      link: {
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      visit: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configStub },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  describe('getOverview', () => {
    it('builds system-wide overview metrics for anonymous callers', async () => {
      const mockVisits = [
        {
          occurredAt: new Date('2026-07-27T10:00:00Z'),
          referrer: 't.co',
          deviceType: 'mobile',
          browser: 'Safari',
          os: 'iOS',
          ipHash: 'hash1',
        },
        {
          occurredAt: new Date('2026-07-27T11:00:00Z'),
          referrer: null,
          deviceType: 'desktop',
          browser: 'Chrome',
          os: 'macOS',
          ipHash: 'hash1',
        },
      ];

      prisma.link.count
        .mockResolvedValueOnce(10) // totalLinks
        .mockResolvedValueOnce(8); // activeLinks

      prisma.link.aggregate.mockResolvedValueOnce({ _sum: { visitCount: 50 } });
      prisma.link.findMany.mockResolvedValueOnce([]); // topLinks
      prisma.visit.findMany.mockResolvedValueOnce(mockVisits);

      const overview = await service.getOverview(30);

      expect(overview.totals.totalLinks).toBe(10);
      expect(overview.totals.activeLinks).toBe(8);
      expect(overview.totals.totalVisits).toBe(50);
      expect(overview.totals.visitsInPeriod).toBe(2);
      expect(overview.totals.uniqueVisitors).toBe(1); // 1 distinct ipHash
      expect(overview.totals.averageVisitsPerLink).toBe(5);
      expect(overview.scopedToUser).toBe(false);
      expect(overview.periodDays).toBe(30);
    });

    it('scopes queries to the authenticated user when userId is provided', async () => {
      prisma.link.count.mockResolvedValue(0);
      prisma.link.aggregate.mockResolvedValue({ _sum: { visitCount: 0 } });
      prisma.link.findMany.mockResolvedValue([]);
      prisma.visit.findMany.mockResolvedValue([]);

      const overview = await service.getOverview(14, 'user-99');

      expect(overview.scopedToUser).toBe(true);
      expect(overview.periodDays).toBe(14);
      expect(prisma.link.count).toHaveBeenCalledWith({ where: { ownerId: 'user-99' } });
    });
  });

  describe('getLinkAnalytics', () => {
    it('returns per-link analytics when caller is the owner', async () => {
      const link = {
        id: 'link-1',
        slug: 'my-slug',
        targetUrl: 'https://example.com',
        title: 'Test',
        isCustomSlug: true,
        visitCount: 5,
        lastVisitedAt: new Date(),
        isActive: true,
        expiresAt: null,
        ownerId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.link.findUnique.mockResolvedValue(link);

      const visits = [
        {
          occurredAt: new Date('2026-07-27T12:00:00Z'),
          referrer: 'google.com',
          deviceType: 'desktop',
          browser: 'Chrome',
          os: 'Windows',
          ipHash: 'ip1',
        },
      ];
      const uniqueRows = [{ ipHash: 'ip1' }];

      prisma.visit.findMany
        .mockResolvedValueOnce(visits)
        .mockResolvedValueOnce(uniqueRows);

      const result = await service.getLinkAnalytics('link-1', 7, 'user-1');

      expect(result.link.id).toBe('link-1');
      expect(result.visitsInPeriod).toBe(1);
      expect(result.uniqueVisitors).toBe(1);
      expect(result.periodDays).toBe(7);
    });

    it('throws NotFoundException if link does not exist', async () => {
      prisma.link.findUnique.mockResolvedValue(null);

      await expect(
        service.getLinkAnalytics('missing-id', 30, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /** A link owned by someone other than the viewer. */
    const ownedByAnother = {
      id: 'link-1',
      slug: 'owned',
      targetUrl: 'https://example.com',
      ownerId: 'user-owner',
      visitCount: 0,
      isActive: true,
      createdAt: new Date(),
    };

    it('refuses another signed-in user', async () => {
      // The link stays listed publicly with its visit count, but its
      // breakdowns are private to its owner.
      prisma.link.findUnique.mockResolvedValue(ownedByAnother);

      await expect(
        service.getLinkAnalytics('link-1', 30, 'user-other'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a signed-out visitor on an owned link', async () => {
      prisma.link.findUnique.mockResolvedValue(ownedByAnother);

      await expect(service.getLinkAnalytics('link-1', 30)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows viewing analytics for anonymous (public) links', async () => {
      const link = {
        id: 'anon-link',
        slug: 'anon',
        targetUrl: 'https://example.com',
        ownerId: null,
        visitCount: 0,
        isActive: true,
        createdAt: new Date(),
      };

      prisma.link.findUnique.mockResolvedValue(link);
      prisma.visit.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.getLinkAnalytics('anon-link', 30, undefined);
      expect(result.link.id).toBe('anon-link');
    });
  });

  describe('Pure Helpers', () => {
    describe('round1', () => {
      it('rounds numbers to 1 decimal place', () => {
        expect(round1(12.3456)).toBe(12.3);
        expect(round1(12.3656)).toBe(12.4);
        expect(round1(0)).toBe(0);
      });
    });

    describe('toBreakdown', () => {
      it('aggregates categorical values, calculates percentages, and uses fallback label', () => {
        const values = ['Chrome', null, 'Chrome', 'Firefox', undefined];
        const breakdown = toBreakdown(values, 5, 'Unknown');

        expect(breakdown).toHaveLength(3);
        expect(breakdown[0]).toEqual({ label: 'Chrome', count: 2, percentage: 40 });
        expect(breakdown[1]).toEqual({ label: 'Unknown', count: 2, percentage: 40 });
        expect(breakdown[2]).toEqual({ label: 'Firefox', count: 1, percentage: 20 });
      });

      it('handles empty input gracefully', () => {
        expect(toBreakdown([], 0, 'Unknown')).toEqual([]);
      });
    });

    describe('countDistinctVisitors', () => {
      it('counts unique non-null IP hashes', () => {
        const visits = [
          { ipHash: 'hash-a' },
          { ipHash: 'hash-b' },
          { ipHash: 'hash-a' },
          { ipHash: null },
        ];
        expect(countDistinctVisitors(visits)).toBe(2);
      });
    });
  });
});
