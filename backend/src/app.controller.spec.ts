/**
 * Tests for the service index.
 *
 * The point of this endpoint is that the paths it advertises are real. These
 * tests pin that: the prefix is read from configuration rather than hard-coded,
 * so renaming `API_PREFIX` cannot leave the index pointing at dead URLs.
 */

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

/**
 * Builds a controller wired to a stub config.
 *
 * @param apiPrefix      Value the stub returns for `apiPrefix`.
 * @param swaggerEnabled Value the stub returns for `swaggerEnabled`.
 * @returns The instantiated controller.
 */
async function buildController(
  apiPrefix: string,
  swaggerEnabled: boolean,
): Promise<AppController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'apiPrefix' ? apiPrefix : swaggerEnabled,
        },
      },
    ],
  }).compile();

  return moduleRef.get(AppController);
}

describe('AppController', () => {
  it('names the service and its version', async () => {
    const index = (await buildController('api/v1', true)).index();

    expect(index.name).toBe('Shortly URL Shortener API');
    expect(index.version).toBe('1.0');
  });

  it('advertises every feature area', async () => {
    const index = (await buildController('api/v1', true)).index();

    expect(Object.keys(index.endpoints).sort()).toEqual(
      ['analytics', 'auth', 'links', 'metrics', 'redirect'].sort(),
    );
  });

  it('builds every path from the configured prefix', async () => {
    const index = (await buildController('gateway/v9', true)).index();
    const paths = [index.docs, index.health, ...Object.values(index.endpoints)];

    for (const path of paths) {
      expect(path).toMatch(/^\/gateway\/v9\//);
    }
  });

  it('emits absolute paths, never relative ones', async () => {
    const index = (await buildController('api/v1', true)).index();

    for (const path of [index.health, ...Object.values(index.endpoints)]) {
      expect(path.startsWith('/')).toBe(true);
    }
  });

  it('links the docs when Swagger is enabled', async () => {
    const index = (await buildController('api/v1', true)).index();

    expect(index.docs).toBe('/api/v1/docs');
  });

  it('reports docs as null when Swagger is disabled', async () => {
    // Never advertise a URL that would 404 — the bug this endpoint exists to
    // stop should not be reintroduced by the endpoint itself.
    const index = (await buildController('api/v1', false)).index();

    expect(index.docs).toBeNull();
  });

  it('points health at the readiness probe, not liveness', async () => {
    const index = (await buildController('api/v1', true)).index();

    expect(index.health).toBe('/api/v1/health/ready');
  });
});
