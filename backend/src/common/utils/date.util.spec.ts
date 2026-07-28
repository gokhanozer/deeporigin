/**
 * Unit tests for the analytics date helpers.
 *
 * The gap-filling behaviour is the important one: without it, a chart silently
 * omits days that had no traffic, which misrepresents the data.
 */

import {
  buildDailySeries,
  buildDateRange,
  countByValue,
  daysAgo,
  startOfUtcDay,
  toUtcDateKey,
} from './date.util';

describe('startOfUtcDay', () => {
  it('truncates the time portion in UTC', () => {
    const result = startOfUtcDay(new Date('2026-07-27T15:42:31.123Z'));
    expect(result.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });
});

describe('toUtcDateKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toUtcDateKey(new Date('2026-07-27T15:42:31Z'))).toBe('2026-07-27');
  });

  it('uses UTC rather than the local timezone', () => {
    // 23:30 UTC is already the next day in some local zones; the key must not shift.
    expect(toUtcDateKey(new Date('2026-07-27T23:30:00Z'))).toBe('2026-07-27');
  });
});

describe('daysAgo', () => {
  it('returns midnight UTC n days back', () => {
    const from = new Date('2026-07-27T15:00:00Z');
    expect(daysAgo(7, from).toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });
});

describe('buildDateRange', () => {
  it('returns an ascending, contiguous window ending today', () => {
    const end = new Date('2026-07-27T12:00:00Z');
    expect(buildDateRange(3, end)).toEqual(['2026-07-25', '2026-07-26', '2026-07-27']);
  });

  it('returns exactly `days` entries', () => {
    expect(buildDateRange(30, new Date('2026-07-27T00:00:00Z'))).toHaveLength(30);
  });

  it('crosses month boundaries correctly', () => {
    expect(buildDateRange(2, new Date('2026-08-01T00:00:00Z'))).toEqual([
      '2026-07-31',
      '2026-08-01',
    ]);
  });
});

describe('buildDailySeries', () => {
  const end = new Date('2026-07-27T12:00:00Z');

  it('counts events into their day buckets', () => {
    const series = buildDailySeries(
      [
        new Date('2026-07-27T01:00:00Z'),
        new Date('2026-07-27T20:00:00Z'),
        new Date('2026-07-26T10:00:00Z'),
      ],
      2,
      end,
    );
    expect(series).toEqual([
      { date: '2026-07-26', count: 1 },
      { date: '2026-07-27', count: 2 },
    ]);
  });

  it('zero-fills days with no events, leaving no gaps', () => {
    const series = buildDailySeries([new Date('2026-07-27T01:00:00Z')], 3, end);
    expect(series).toEqual([
      { date: '2026-07-25', count: 0 },
      { date: '2026-07-26', count: 0 },
      { date: '2026-07-27', count: 1 },
    ]);
  });

  it('returns an all-zero series when there are no events at all', () => {
    expect(buildDailySeries([], 3, end).every((point) => point.count === 0)).toBe(true);
  });

  it('ignores events outside the window', () => {
    const series = buildDailySeries([new Date('2020-01-01T00:00:00Z')], 2, end);
    expect(series.reduce((sum, point) => sum + point.count, 0)).toBe(0);
  });
});

describe('countByValue', () => {
  it('ranks values by frequency, highest first', () => {
    expect(countByValue(['a', 'b', 'a', 'c', 'a', 'b'])).toEqual([
      { label: 'a', count: 3 },
      { label: 'b', count: 2 },
      { label: 'c', count: 1 },
    ]);
  });

  it('folds null and empty values into the fallback label', () => {
    expect(countByValue([null, undefined, '', 't.co'], 10, 'Direct')).toEqual([
      { label: 'Direct', count: 3 },
      { label: 't.co', count: 1 },
    ]);
  });

  it('honours the limit', () => {
    expect(countByValue(['a', 'b', 'c', 'd'], 2)).toHaveLength(2);
  });

  it('breaks ties alphabetically, so output is deterministic', () => {
    expect(countByValue(['b', 'a']).map((entry) => entry.label)).toEqual(['a', 'b']);
  });

  it('returns an empty array for no input', () => {
    expect(countByValue([])).toEqual([]);
  });
});
