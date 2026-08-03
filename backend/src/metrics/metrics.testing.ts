/**
 * Test double for {@link MetricsService}.
 *
 * Services increment counters as a side effect, so unit tests must satisfy the
 * dependency without pulling in a real Prometheus registry — which would
 * otherwise leak state between suites, since `prom-client` instruments are
 * process-global unless carefully scoped.
 *
 * The counters are `jest.fn()`s, so a test can additionally assert *that* a
 * metric was recorded when that is the behaviour under test.
 */

import type { Provider } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/** Shape of the stub, with every instrument spied. */
export interface MetricsServiceStub {
  httpDuration: { observe: jest.Mock };
  redirectTotal: { inc: jest.Mock };
  redirectDuration: { observe: jest.Mock };
  linkCreatedTotal: { inc: jest.Mock };
  slugCollisionTotal: { inc: jest.Mock };
  rateLimitRejectedTotal: { inc: jest.Mock };
  visitRecordFailedTotal: { inc: jest.Mock };
  observeRedirect: jest.Mock;
  render: jest.Mock;
}

/**
 * Builds a fresh stub. Call per test so counts never leak between cases.
 *
 * @returns A stubbed metrics service.
 */
export function createMetricsStub(): MetricsServiceStub {
  return {
    httpDuration: { observe: jest.fn() },
    redirectTotal: { inc: jest.fn() },
    redirectDuration: { observe: jest.fn() },
    linkCreatedTotal: { inc: jest.fn() },
    slugCollisionTotal: { inc: jest.fn() },
    rateLimitRejectedTotal: { inc: jest.fn() },
    visitRecordFailedTotal: { inc: jest.fn() },
    observeRedirect: jest.fn(),
    render: jest.fn().mockResolvedValue(''),
  };
}

/**
 * Convenience provider for `Test.createTestingModule({ providers: [...] })`.
 *
 * @param stub Optional stub to reuse, when the test needs to assert on it.
 * @returns A Nest provider overriding `MetricsService`.
 */
export function metricsStubProvider(stub: MetricsServiceStub = createMetricsStub()): Provider {
  return { provide: MetricsService, useValue: stub };
}
