/**
 * Tests for the configuration factory.
 *
 * Focused on `SWAGGER_ENABLED`, because boolean environment parsing is the
 * exact shape of bug that made `?mineOnly=false` behave as `true`: every
 * environment variable arrives as a string, and `Boolean('false')` is `true`.
 */

import { configuration } from './configuration';

describe('configuration', () => {
  const original = process.env;

  beforeEach(() => {
    // Work on a copy so one case cannot leak into the next.
    process.env = { ...original };
    delete process.env.SWAGGER_ENABLED;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = original;
  });

  describe('swaggerEnabled', () => {
    it('defaults to on outside production', () => {
      process.env.NODE_ENV = 'development';
      expect(configuration().swaggerEnabled).toBe(true);
    });

    it('defaults to off in production', () => {
      process.env.NODE_ENV = 'production';
      expect(configuration().swaggerEnabled).toBe(false);
    });

    it('defaults to on when NODE_ENV is unset', () => {
      expect(configuration().swaggerEnabled).toBe(true);
    });

    it.each(['true', 'TRUE', ' True ', '1'])(
      'treats %p as an explicit opt-in, even in production',
      (value) => {
        process.env.NODE_ENV = 'production';
        process.env.SWAGGER_ENABLED = value;
        expect(configuration().swaggerEnabled).toBe(true);
      },
    );

    it.each(['false', 'FALSE', ' False ', '0'])(
      'treats %p as an explicit opt-out, even in development',
      (value) => {
        process.env.NODE_ENV = 'development';
        process.env.SWAGGER_ENABLED = value;
        expect(configuration().swaggerEnabled).toBe(false);
      },
    );

    it('does not treat the string "false" as truthy', () => {
      // The regression guard. A naive Boolean(process.env.X) returns true here.
      process.env.NODE_ENV = 'development';
      process.env.SWAGGER_ENABLED = 'false';
      expect(configuration().swaggerEnabled).not.toBe(true);
    });

    it.each(['', '   ', 'yes', 'on', 'maybe'])(
      'falls back to the NODE_ENV default for the unrecognised value %p',
      (value) => {
        process.env.NODE_ENV = 'production';
        process.env.SWAGGER_ENABLED = value;
        expect(configuration().swaggerEnabled).toBe(false);
      },
    );
  });
});
