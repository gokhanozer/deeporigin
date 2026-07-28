/**
 * Unit tests for {@link AuthService}.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthService, toUserDto } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './utils/password.util';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    email: 'user@example.com',
    passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    displayName: 'Test User',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let jwtService: {
    sign: jest.Mock;
  };

  const configStub = {
    get: (key: string) => {
      if (key === 'auth') {
        return { bcryptRounds: 4 }; // Fast rounds for tests
      }
      return undefined;
    },
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configStub },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('creates a new account and returns token with user profile', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const createdUser = makeUser({ email: 'newuser@example.com', displayName: 'New User' });
      prisma.user.create.mockResolvedValue(createdUser);

      const result = await service.register({
        email: '  NEWUSER@EXAMPLE.COM  ',
        password: 'securePassword123!',
        displayName: '  New User  ',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'newuser@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'newuser@example.com',
          passwordHash: expect.any(String),
          displayName: 'New User',
        },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: createdUser.id,
        email: createdUser.email,
      });
      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        user: {
          id: createdUser.id,
          email: 'newuser@example.com',
          displayName: 'New User',
          createdAt: createdUser.createdAt,
        },
      });
    });

    it('rejects duplicate email with ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.register({
          email: 'user@example.com',
          password: 'password123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('authenticates valid credentials and returns token', async () => {
      const password = 'mySecretPassword';
      const passwordHash = await hashPassword(password, 4);
      const user = makeUser({ passwordHash });

      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login({
        email: 'USER@example.com',
        password,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        user: toUserDto(user),
      });
    });

    it('throws UnauthorizedException when email is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'somePassword',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const passwordHash = await hashPassword('realPassword', 4);
      const user = makeUser({ passwordHash });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'wrongPassword',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('returns the public user profile', async () => {
      const user = makeUser();
      prisma.user.findUnique.mockResolvedValue(user);

      const profile = await service.getProfile(user.id);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: user.id } });
      expect(profile).toEqual(toUserDto(user));
    });

    it('throws UnauthorizedException when user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('deleted-id')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('toUserDto', () => {
    it('strips passwordHash from output', async () => {
      const user = makeUser();
      const dto = toUserDto(user);

      expect(dto).not.toHaveProperty('passwordHash');
      expect(dto).toEqual({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      });
    });
  });
});
