/**
 * Unit tests for {@link RedirectService}.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RedirectService } from './redirect.service';
import { PrismaService } from '../prisma/prisma.service';
import { VisitsService } from '../visits/visits.service';
import { metricsStubProvider } from '../metrics/metrics.testing';

describe('RedirectService', () => {
  let service: RedirectService;
  let prisma: {
    link: {
      findUnique: jest.Mock;
    };
  };
  let visitsService: {
    recordVisit: jest.Mock;
  };

  const activeLink = {
    id: 'link-100',
    slug: 'target-slug',
    targetUrl: 'https://example.com/dest',
    isActive: true,
    expiresAt: null,
  };

  beforeEach(async () => {
    prisma = {
      link: {
        findUnique: jest.fn(),
      },
    };

    visitsService = {
      recordVisit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        metricsStubProvider(),
        RedirectService,
        { provide: PrismaService, useValue: prisma },
        { provide: VisitsService, useValue: visitsService },
      ],
    }).compile();

    service = module.get(RedirectService);
  });

  describe('resolve', () => {
    it('resolves a valid active slug and triggers visit recording', async () => {
      prisma.link.findUnique.mockResolvedValue(activeLink);

      const metadata = { ip: '1.2.3.4', userAgent: 'Mozilla/5.0' };
      const result = await service.resolve('  target-slug  ', metadata);

      expect(prisma.link.findUnique).toHaveBeenCalledWith({
        where: { slug: 'target-slug' },
        select: { id: true, targetUrl: true, isActive: true, expiresAt: true },
      });
      expect(visitsService.recordVisit).toHaveBeenCalledWith('link-100', metadata);
      expect(result).toEqual({
        id: 'link-100',
        targetUrl: 'https://example.com/dest',
      });
    });

    it('throws NotFoundException when slug does not exist', async () => {
      prisma.link.findUnique.mockResolvedValue(null);

      await expect(service.resolve('unknown-slug')).rejects.toBeInstanceOf(NotFoundException);
      expect(visitsService.recordVisit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when link is inactive', async () => {
      prisma.link.findUnique.mockResolvedValue({
        ...activeLink,
        isActive: false,
      });

      await expect(service.resolve('target-slug')).rejects.toBeInstanceOf(NotFoundException);
      expect(visitsService.recordVisit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when link has expired', async () => {
      prisma.link.findUnique.mockResolvedValue({
        ...activeLink,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      });

      await expect(service.resolve('target-slug')).rejects.toBeInstanceOf(NotFoundException);
      expect(visitsService.recordVisit).not.toHaveBeenCalled();
    });
  });

  describe('peek', () => {
    it('resolves slug without calling recordVisit', async () => {
      prisma.link.findUnique.mockResolvedValue(activeLink);

      const result = await service.peek('target-slug');

      expect(prisma.link.findUnique).toHaveBeenCalledWith({
        where: { slug: 'target-slug' },
        select: { id: true, targetUrl: true, isActive: true, expiresAt: true },
      });
      expect(visitsService.recordVisit).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'link-100',
        targetUrl: 'https://example.com/dest',
      });
    });

    it('throws NotFoundException when peeked slug is missing or unresolvable', async () => {
      prisma.link.findUnique.mockResolvedValue(null);

      await expect(service.peek('missing-slug')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
