/**
 * Unit tests for {@link LinksService}.
 *
 * Prisma is mocked rather than hit for real: these tests are about the
 * service's *decisions* — retry on collision, reject invalid input, enforce
 * ownership — and mocking keeps them fast and free of a database dependency.
 * (The database's own behaviour, such as the unique index actually firing, is
 * the database's contract, not this class's.)
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, type Link } from '@prisma/client';
import { LinksService } from './links.service';
import { PrismaService } from '../prisma/prisma.service';

/** Builds a link row for use as a mocked query result. */
function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'link-1',
    slug: 'abc123',
    targetUrl: 'https://example.com/foo',
    title: null,
    isCustomSlug: false,
    visitCount: 0,
    lastVisitedAt: null,
    isActive: true,
    expiresAt: null,
    ownerId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Constructs the Prisma unique-constraint error the database raises on a
 * duplicate slug.
 *
 * @returns A `P2002` known-request error.
 */
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
    meta: { target: ['slug'] },
  });
}

describe('LinksService', () => {
  let service: LinksService;
  let prisma: {
    link: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  /** Configuration stub returning the same values as the defaults. */
  const configStub = {
    get: (key: string) => {
      switch (key) {
        case 'links':
          return { slugLength: 7, maxSlugGenerationAttempts: 3 };
        case 'publicBaseUrl':
          return 'https://short.ly';
        case 'nodeEnv':
          return 'test';
        default:
          return undefined;
      }
    },
  };

  beforeEach(async () => {
    prisma = {
      link: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // The real $transaction takes an array of promises and resolves them all.
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinksService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configStub },
      ],
    }).compile();

    service = module.get(LinksService);
  });

  describe('create', () => {
    it('generates a slug and stores the normalised URL', async () => {
      prisma.link.create.mockResolvedValue(makeLink());

      const result = await service.create({ url: 'example.com/foo' });

      expect(prisma.link.create).toHaveBeenCalledTimes(1);
      const data = prisma.link.create.mock.calls[0][0].data;
      expect(data.targetUrl).toBe('https://example.com/foo');
      expect(data.isCustomSlug).toBe(false);
      expect(data.slug).toHaveLength(7);
      expect(result.shortUrl).toBe('https://short.ly/abc123');
    });

    it('attaches ownership when a user is signed in', async () => {
      prisma.link.create.mockResolvedValue(makeLink());
      await service.create({ url: 'https://example.com' }, 'user-1');
      expect(prisma.link.create.mock.calls[0][0].data.ownerId).toBe('user-1');
    });

    it('creates an anonymous link when no user is signed in', async () => {
      prisma.link.create.mockResolvedValue(makeLink({ ownerId: null }));
      await service.create({ url: 'https://example.com' });
      expect(prisma.link.create.mock.calls[0][0].data.ownerId).toBeUndefined();
    });

    it('retries with a fresh slug when a generated one collides', async () => {
      prisma.link.create
        .mockRejectedValueOnce(uniqueViolation())
        .mockResolvedValueOnce(makeLink());

      const result = await service.create({ url: 'https://example.com' });

      expect(prisma.link.create).toHaveBeenCalledTimes(2);
      // The retry must use a *different* slug, or it would collide again.
      const [first, second] = prisma.link.create.mock.calls;
      expect(first[0].data.slug).not.toBe(second[0].data.slug);
      expect(result.slug).toBe('abc123');
    });

    it('gives up after the configured number of attempts', async () => {
      prisma.link.create.mockRejectedValue(uniqueViolation());
      await expect(service.create({ url: 'https://example.com' })).rejects.toThrow(
        /Could not generate a unique short link/,
      );
      expect(prisma.link.create).toHaveBeenCalledTimes(3);
    });

    it('reports a taken custom slug as a conflict rather than retrying', async () => {
      prisma.link.create.mockRejectedValue(uniqueViolation());

      await expect(service.create({ url: 'https://example.com', slug: 'taken' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      // A custom slug must never be silently replaced with a random one.
      expect(prisma.link.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a reserved custom slug before touching the database', async () => {
      await expect(
        service.create({ url: 'https://example.com', slug: 'dashboard' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.link.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid URL before touching the database', async () => {
      await expect(service.create({ url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.link.create).not.toHaveBeenCalled();
    });

    it('rejects an expiry in the past', async () => {
      await expect(
        service.create({ url: 'https://example.com', expiresAt: '2020-01-01T00:00:00Z' }),
      ).rejects.toThrow(/must be in the future/);
    });

    it('propagates non-collision database errors untouched', async () => {
      prisma.link.create.mockRejectedValue(new Error('connection lost'));
      await expect(service.create({ url: 'https://example.com' })).rejects.toThrow('connection lost');
    });
  });

  describe('update', () => {
    it('changes the slug and flags it as custom', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink());
      prisma.link.update.mockResolvedValue(makeLink({ slug: 'new-slug', isCustomSlug: true }));

      const result = await service.update('link-1', { slug: 'new-slug' }, 'user-1');

      expect(prisma.link.update.mock.calls[0][0].data).toMatchObject({
        slug: 'new-slug',
        isCustomSlug: true,
      });
      expect(result.slug).toBe('new-slug');
    });

    it('skips the write when the slug is unchanged', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink({ slug: 'abc123' }));
      await service.update('link-1', { slug: 'abc123' }, 'user-1');
      // Re-submitting an unchanged form must not trip the unique constraint.
      expect(prisma.link.update).not.toHaveBeenCalled();
    });

    it('refuses to update a link owned by someone else', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink({ ownerId: 'someone-else' }));
      await expect(service.update('link-1', { slug: 'new' }, 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to update an anonymous link', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink({ ownerId: null }));
      await expect(service.update('link-1', { slug: 'new' }, 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('reports a missing link as not found', async () => {
      prisma.link.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { slug: 'new' }, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('surfaces a slug collision as a conflict', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink());
      prisma.link.update.mockRejectedValue(uniqueViolation());
      await expect(service.update('link-1', { slug: 'taken' }, 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes a link the caller owns', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink());
      prisma.link.delete.mockResolvedValue(makeLink());
      await service.remove('link-1', 'user-1');
      expect(prisma.link.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    });

    it('refuses to delete another user’s link', async () => {
      prisma.link.findUnique.mockResolvedValue(makeLink({ ownerId: 'other' }));
      await expect(service.remove('link-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.link.delete).not.toHaveBeenCalled();
    });
  });

  describe('findMany', () => {
    it('requires authentication for the "my links" view', async () => {
      await expect(service.findMany({ mineOnly: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('scopes results to the owner when mineOnly is set', async () => {
      prisma.link.findMany.mockResolvedValue([makeLink()]);
      prisma.link.count.mockResolvedValue(1);

      const result = await service.findMany({ mineOnly: true, page: 1, pageSize: 20 }, 'user-1');

      expect(prisma.link.findMany.mock.calls[0][0].where).toEqual({ ownerId: 'user-1' });
      expect(result.meta.total).toBe(1);
      expect(result.data[0].isOwner).toBe(true);
    });

    it('searches across slug, title and target URL', async () => {
      prisma.link.findMany.mockResolvedValue([]);
      prisma.link.count.mockResolvedValue(0);

      await service.findMany({ search: 'nest' });

      const where = prisma.link.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(3);
      expect(where.OR[0].slug.mode).toBe('insensitive');
    });

    it('applies a stable secondary sort for deterministic pagination', async () => {
      prisma.link.findMany.mockResolvedValue([]);
      prisma.link.count.mockResolvedValue(0);

      await service.findMany({ sortBy: 'visitCount', sortOrder: 'desc' });

      expect(prisma.link.findMany.mock.calls[0][0].orderBy).toEqual([
        { visitCount: 'desc' },
        { id: 'asc' },
      ]);
    });
  });

  describe('checkSlugAvailability', () => {
    it('reports a free slug as available', async () => {
      prisma.link.findUnique.mockResolvedValue(null);
      expect(await service.checkSlugAvailability('free-slug')).toEqual({ available: true });
    });

    it('reports a taken slug as unavailable', async () => {
      prisma.link.findUnique.mockResolvedValue({ id: 'link-1' });
      expect(await service.checkSlugAvailability('taken')).toMatchObject({ available: false });
    });

    it('rejects a reserved slug without querying the database', async () => {
      const result = await service.checkSlugAvailability('login');
      expect(result.available).toBe(false);
      expect(prisma.link.findUnique).not.toHaveBeenCalled();
    });
  });
});
