/**
 * Unit tests for {@link VisitsService}.
 *
 * Visit recording is intentionally isolated from redirects. These tests keep
 * the stored analytics payload and the "never break redirects" error handling
 * explicit without requiring a database.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { VisitsService } from './visits.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashIp } from '../common/utils/request.util';
import { metricsStubProvider } from '../metrics/metrics.testing';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('VisitsService', () => {
  let service: VisitsService;
  let prisma: {
    visit: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    link: {
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const configStub = {
    get: (key: string) => {
      if (key === 'privacy') return { ipHashSalt: 'test-salt' };
      return undefined;
    },
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-27T12:34:56.000Z'));

    prisma = {
      visit: {
        create: jest.fn().mockReturnValue({ operation: 'visit.create' }),
        findMany: jest.fn(),
      },
      link: {
        update: jest.fn().mockReturnValue({ operation: 'link.update' }),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        metricsStubProvider(),
        VisitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configStub },
      ],
    }).compile();

    service = module.get(VisitsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('recordVisit', () => {
    it('stores visit metadata and increments the link counter in one transaction', async () => {
      await service.recordVisit('link-1', {
        ip: '203.0.113.7',
        userAgent: CHROME_MAC,
        referrer: 'example.com',
      });

      const occurredAt = new Date('2026-07-27T12:34:56.000Z');
      expect(prisma.visit.create).toHaveBeenCalledWith({
        data: {
          linkId: 'link-1',
          occurredAt,
          ipHash: hashIp('203.0.113.7', 'test-salt'),
          userAgent: CHROME_MAC,
          browser: 'Chrome',
          os: 'macOS',
          deviceType: 'desktop',
          referrer: 'example.com',
        },
      });
      expect(prisma.link.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: {
          visitCount: { increment: 1 },
          lastVisitedAt: occurredAt,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        { operation: 'visit.create' },
        { operation: 'link.update' },
      ]);
    });

    it('stores nulls and unknown user-agent fields when metadata is absent', async () => {
      await service.recordVisit('link-1', {});

      expect(prisma.visit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipHash: null,
          userAgent: null,
          browser: 'Unknown',
          os: 'Unknown',
          deviceType: 'unknown',
          referrer: null,
        }),
      });
    });

    it('swallows transaction failures after logging them', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      prisma.$transaction.mockRejectedValue(new Error('database unavailable'));

      await expect(service.recordVisit('link-1', {})).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to record visit for link link-1: database unavailable',
      );
    });
  });

  describe('countUniqueVisitors', () => {
    it('counts distinct non-null IP hashes returned by Prisma', async () => {
      prisma.visit.findMany.mockResolvedValue([{ ipHash: 'a' }, { ipHash: 'b' }]);

      await expect(service.countUniqueVisitors('link-1')).resolves.toBe(2);
      expect(prisma.visit.findMany).toHaveBeenCalledWith({
        where: { linkId: 'link-1', ipHash: { not: null } },
        distinct: ['ipHash'],
        select: { ipHash: true },
      });
    });
  });
});
