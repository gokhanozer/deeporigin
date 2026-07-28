/**
 * Development seed script.
 *
 * Creates a demo account, a handful of links and a realistic spread of visits
 * so the dashboard has something to draw on a fresh database.
 *
 * Run with: `npm run db:seed`
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/utils/password.util';
import { generateUsableSlug } from '../src/common/utils/slug.util';
import { parseUserAgent } from '../src/common/utils/user-agent.util';
import { hashIp } from '../src/common/utils/request.util';

const prisma = new PrismaClient();

/** Demo account credentials, printed at the end of a successful seed. */
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo12345';

/** Sample destinations used to build the demo links. */
const SAMPLE_TARGETS: ReadonlyArray<{ url: string; title: string; slug?: string }> = [
  { url: 'https://some.place.example.com/foo/bar/biz', title: 'The task description example', slug: 'abc123' },
  { url: 'https://nestjs.com/', title: 'NestJS homepage', slug: 'nest' },
  { url: 'https://nextjs.org/docs/app', title: 'Next.js App Router docs' },
  { url: 'https://www.prisma.io/docs', title: 'Prisma documentation' },
  { url: 'https://react.dev/learn', title: 'React — Learn' },
  { url: 'https://www.typescriptlang.org/docs/handbook/intro.html', title: 'TypeScript handbook' },
];

/** User-Agent strings covering the device classes the dashboard reports on. */
const SAMPLE_USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36 Edg/119.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/604.1',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

/** Referrers, including `null` to represent direct traffic. */
const SAMPLE_REFERRERS: ReadonlyArray<string | null> = [
  null,
  null,
  't.co',
  'news.ycombinator.com',
  'google.com',
  'linkedin.com',
  'reddit.com',
];

/**
 * Returns a random element of an array.
 *
 * @param items Non-empty array.
 * @returns One randomly chosen element.
 */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Produces a random timestamp within the last `days` days.
 *
 * Weighted towards the recent past (by squaring the random factor) so the
 * dashboard's trend line slopes upward and looks like real traffic.
 *
 * @param days Size of the window.
 * @returns A `Date` inside the window.
 */
function randomRecentDate(days: number): Date {
  const factor = Math.random() ** 2;
  const msAgo = factor * days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - msAgo);
}

/**
 * Populates the database with demo data.
 *
 * Idempotent: re-running clears the previous demo user's links first, so the
 * seed can be applied repeatedly without piling up duplicates.
 */
async function seed(): Promise<void> {
  console.log('Seeding database…');

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD, 10),
      displayName: 'Demo User',
    },
  });

  // Clear this user's previous demo links (visits cascade automatically).
  await prisma.link.deleteMany({ where: { ownerId: user.id } });

  let totalVisits = 0;

  for (const [index, sample] of SAMPLE_TARGETS.entries()) {
    const slug = sample.slug ?? generateUsableSlug(7);

    // The first two links are anonymous, to exercise the "no account" path.
    const ownerId = index < 2 ? null : user.id;

    const link = await prisma.link.create({
      data: {
        slug,
        targetUrl: sample.url,
        title: sample.title,
        isCustomSlug: Boolean(sample.slug),
        ownerId,
      },
    });

    // Popularity decays down the list, which makes the "top links" chart varied.
    const visitCount = Math.max(0, Math.floor(120 / (index + 1)) + Math.floor(Math.random() * 20));

    const visits = Array.from({ length: visitCount }, () => {
      const userAgent = pick(SAMPLE_USER_AGENTS);
      const { browser, os, deviceType } = parseUserAgent(userAgent);
      return {
        linkId: link.id,
        occurredAt: randomRecentDate(30),
        ipHash: hashIp(`10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, 'seed-salt'),
        userAgent,
        browser,
        os,
        deviceType,
        referrer: pick(SAMPLE_REFERRERS),
      };
    });

    if (visits.length > 0) {
      await prisma.visit.createMany({ data: visits });
      const latest = visits.reduce((a, b) => (a.occurredAt > b.occurredAt ? a : b));
      // Keep the denormalised counters consistent with the rows just inserted.
      await prisma.link.update({
        where: { id: link.id },
        data: { visitCount: visits.length, lastVisitedAt: latest.occurredAt },
      });
    }

    totalVisits += visits.length;
    console.log(`  • /${slug} → ${sample.url} (${visits.length} visits)`);
  }

  console.log(`\nSeeded ${SAMPLE_TARGETS.length} links and ${totalVisits} visits.`);
  console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
