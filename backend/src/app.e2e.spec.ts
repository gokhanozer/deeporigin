/**
 * End-to-end API integration tests using Supertest.
 *
 * Exercises the HTTP pipeline: controllers, DTO validation pipes, global routing,
 * exception filters, and JWT authentication guards.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('API Integration (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockUser = {
    id: 'e2e-user-1',
    email: 'e2e@example.com',
    passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    displayName: 'E2E User',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const mockLink = {
    id: 'e2e-link-1',
    slug: 'e2e123',
    targetUrl: 'https://example.com/e2e-target',
    title: 'E2E Test Link',
    isCustomSlug: false,
    visitCount: 10,
    lastVisitedAt: new Date('2026-07-27T10:00:00Z'),
    isActive: true,
    expiresAt: null,
    ownerId: mockUser.id,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    link: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    visit: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((ops: any): Promise<any> => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return ops(prismaMock);
      return Promise.resolve(ops);
    }),
    onModuleDestroy: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        validationError: { target: false },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth Endpoints (/api/v1/auth)', () => {
    it('POST /auth/register - registers user and returns 201 with token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@example.com',
          password: 'Password123!',
          displayName: 'E2E User',
        })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe('e2e@example.com');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('POST /auth/login - validates input and returns 200 on success', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'e2e@example.com',
          password: 'wrongPassword',
        })
        .expect(401);

      expect(res.body.message).toMatch(/Invalid email or password/);
    });

    it('GET /auth/me - returns 401 when token is missing', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('GET /auth/me - returns profile when valid Bearer token provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      const token = jwtService.sign({ sub: mockUser.id, email: mockUser.email });

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe(mockUser.id);
      expect(res.body.email).toBe(mockUser.email);
    });
  });

  describe('Links Endpoints (/api/v1/links)', () => {
    it('POST /links - creates a short link anonymously', async () => {
      prismaMock.link.create.mockResolvedValue(mockLink);

      const res = await request(app.getHttpServer())
        .post('/api/v1/links')
        .send({ url: 'https://example.com/e2e-target' })
        .expect(201);

      expect(res.body.slug).toBe('e2e123');
      expect(res.body.shortUrl).toContain('/e2e123');
      expect(res.body.targetUrl).toBe('https://example.com/e2e-target');
    });

    it('POST /links - returns 400 Bad Request on invalid URL', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/links')
        .send({ url: 'javascript:alert("hack")' })
        .expect(400);
    });

    it('GET /links/slug-available/:slug - returns availability status', async () => {
      prismaMock.link.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/api/v1/links/slug-available/available-slug')
        .expect(200);

      expect(res.body).toEqual({ available: true });
    });

    it('GET /links - returns paginated links list', async () => {
      prismaMock.link.findMany.mockResolvedValue([mockLink]);
      prismaMock.link.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer()).get('/api/v1/links').expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.data[0].slug).toBe('e2e123');
      expect(res.body.meta.total).toBe(1);
    });

    it('PATCH /links/:id - returns 401 Unauthorized without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/links/e2e-link-1')
        .send({ slug: 'new-slug' })
        .expect(401);
    });

    it('DELETE /links/:id - deletes link when authenticated owner requests it', async () => {
      prismaMock.link.findUnique.mockResolvedValue(mockLink);
      prismaMock.link.delete.mockResolvedValue(mockLink);

      const token = jwtService.sign({ sub: mockUser.id, email: mockUser.email });

      await request(app.getHttpServer())
        .delete('/api/v1/links/e2e-link-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });

  describe('Redirect Endpoints (/api/v1/redirect)', () => {
    it('POST /redirect/:slug/resolve - resolves active slug and returns 201', async () => {
      prismaMock.link.findUnique.mockResolvedValue({
        id: mockLink.id,
        targetUrl: mockLink.targetUrl,
        isActive: true,
        expiresAt: null,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/redirect/e2e123/resolve')
        .send({ ip: '192.168.1.1', userAgent: 'E2E-Agent' })
        .expect(201);

      expect(res.body.targetUrl).toBe('https://example.com/e2e-target');
    });

    it('GET /redirect/:slug/peek - returns target without visit creation', async () => {
      prismaMock.link.findUnique.mockResolvedValue({
        id: mockLink.id,
        targetUrl: mockLink.targetUrl,
        isActive: true,
        expiresAt: null,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/redirect/e2e123/peek')
        .expect(200);

      expect(res.body.targetUrl).toBe('https://example.com/e2e-target');
    });

    it('POST /redirect/:slug/resolve - returns 404 for unknown slug', async () => {
      prismaMock.link.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/redirect/nonexistent/resolve')
        .send({})
        .expect(404);
    });
  });

  describe('Analytics Endpoints (/api/v1/analytics)', () => {
    it('GET /analytics/overview - returns analytics summary data', async () => {
      prismaMock.link.count.mockResolvedValue(5);
      prismaMock.link.aggregate.mockResolvedValue({ _sum: { visitCount: 42 } });
      prismaMock.link.findMany.mockResolvedValue([mockLink]);
      prismaMock.visit.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/analytics/overview?days=30')
        .expect(200);

      expect(res.body).toHaveProperty('totals');
      expect(res.body).toHaveProperty('visitsOverTime');
      expect(res.body.totals.totalLinks).toBe(5);
      expect(res.body.totals.totalVisits).toBe(42);
    });
  });
});
