/**
 * Business logic for creating, listing, updating and deleting short links.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Link } from '@prisma/client';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { generateUsableSlug, normalizeSlug, validateSlug } from '../common/utils/slug.util';
import { validateUrl } from '../common/utils/url.util';
import { buildPaginatedResult, toSkipTake, type PaginatedResult } from '../common/utils/pagination.util';
import { toLinkDto, toLinkDtoList } from './links.mapper';
import type {
  CreateLinkDto,
  LinkResponseDto,
  ListLinksQueryDto,
  UpdateLinkDto,
} from './dto/link.dto';

/** Prisma's error code for a violated unique constraint. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Creates a short link.
   *
   * Slug selection has two modes:
   *
   *  • **Custom** — validated, then inserted. A collision is a user error, so it
   *    surfaces as `409 Conflict` with an actionable message.
   *  • **Generated** — inserted optimistically and retried on collision. We
   *    deliberately do *not* "SELECT then INSERT": between those two statements
   *    another request could take the same slug. Letting the unique index reject
   *    the insert and retrying is the only race-free approach.
   *
   * Shortening a URL that already has a matching link returns that link rather
   * than creating a second one — see {@link findReusableLink} for how the match
   * is scoped by ownership.
   *
   * @param dto     Validated creation payload.
   * @param ownerId Authenticated user's ID, or `undefined` for an anonymous link.
   * @returns The created link, or an existing reusable one with
   *          `alreadyExisted: true`.
   * @throws {BadRequestException} When the URL is not a valid public http(s) URL.
   * @throws {ConflictException}   When a requested custom slug is taken.
   */
  async create(dto: CreateLinkDto, ownerId?: string): Promise<LinkResponseDto> {
    const targetUrl = this.validateTargetUrl(dto.url);
    const expiresAt = this.parseExpiry(dto.expiresAt);

    const reusable = await this.findReusableLink(dto, targetUrl, ownerId);
    if (reusable) {
      return { ...this.present(reusable, ownerId), alreadyExisted: true };
    }

    const { slugLength, maxSlugGenerationAttempts } = this.config.get('links', { infer: true });

    // ---- Custom slug: validate up front, single insert attempt. ------------
    if (dto.slug) {
      const slug = normalizeSlug(dto.slug);
      const check = validateSlug(slug);
      if (!check.valid) throw new BadRequestException(check.reason);

      try {
        const link = await this.prisma.link.create({
          data: { slug, targetUrl, title: dto.title || null, isCustomSlug: true, ownerId, expiresAt },
        });
        this.metrics.linkCreatedTotal.inc({ slug_type: 'custom' });
        return this.present(link, ownerId);
      } catch (error) {
        if (this.isSlugCollision(error)) {
          throw new ConflictException(`The slug "${slug}" is already taken`);
        }
        throw error;
      }
    }

    // ---- Generated slug: optimistic insert with bounded retries. -----------
    for (let attempt = 1; attempt <= maxSlugGenerationAttempts; attempt += 1) {
      const slug = generateUsableSlug(slugLength);
      try {
        const link = await this.prisma.link.create({
          data: { slug, targetUrl, title: dto.title || null, isCustomSlug: false, ownerId, expiresAt },
        });
        this.metrics.linkCreatedTotal.inc({ slug_type: 'generated' });
        return this.present(link, ownerId);
      } catch (error) {
        if (this.isSlugCollision(error)) {
          // Rising steadily means the keyspace is filling — the signal to
          // raise SLUG_LENGTH, and otherwise invisible until creates fail.
          this.metrics.slugCollisionTotal.inc();
          this.logger.warn(`Slug collision on "${slug}" (attempt ${attempt})`);
          continue;
        }
        throw error;
      }
    }

    // Statistically almost impossible; if it happens, the keyspace is saturated
    // and the fix is to raise SLUG_LENGTH rather than to retry harder.
    this.logger.error(`Failed to generate a unique slug after ${maxSlugGenerationAttempts} attempts`);
    throw new InternalServerErrorException(
      'Could not generate a unique short link. Please try again.',
    );
  }

  /**
   * Lists links with search, sorting and pagination.
   *
   * Serves both the public "all links in the database" view and the
   * authenticated "my links" view, switched by `query.mineOnly`.
   *
   * @param query    Validated filter/sort/pagination options.
   * @param viewerId Requesting user's ID, if authenticated.
   * @returns A paginated envelope of links.
   * @throws {ForbiddenException} When `mineOnly` is requested anonymously.
   */
  async findMany(
    query: ListLinksQueryDto,
    viewerId?: string,
  ): Promise<PaginatedResult<LinkResponseDto>> {
    if (query.mineOnly && !viewerId) {
      throw new ForbiddenException('You must be signed in to view your links');
    }

    const where = this.buildWhere(query, viewerId);
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const orderBy = this.buildOrderBy(query);

    // A single transaction keeps the rows and the count consistent with each
    // other, so the page and the total can never disagree.
    const [links, total] = await this.prisma.$transaction([
      this.prisma.link.findMany({ where, orderBy, skip, take }),
      this.prisma.link.count({ where }),
    ]);

    return buildPaginatedResult(
      toLinkDtoList(links, this.publicBaseUrl, viewerId),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * Fetches a single link by its ID.
   *
   * @param id       Link ID.
   * @param viewerId Requesting user's ID, if authenticated.
   * @returns The link.
   * @throws {NotFoundException} When no link has that ID.
   */
  async findOne(id: string, viewerId?: string): Promise<LinkResponseDto> {
    const link = await this.prisma.link.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    return this.present(link, viewerId);
  }

  /**
   * Updates a link the caller owns.
   *
   * @param id      Link ID.
   * @param dto     Fields to change.
   * @param ownerId Authenticated user's ID.
   * @returns The updated link.
   * @throws {NotFoundException}   When the link does not exist.
   * @throws {ForbiddenException}  When the caller does not own it.
   * @throws {ConflictException}   When the requested slug is taken.
   * @throws {BadRequestException} When a supplied slug or URL is invalid.
   */
  async update(id: string, dto: UpdateLinkDto, ownerId: string): Promise<LinkResponseDto> {
    const existing = await this.assertOwnership(id, ownerId);

    const data: Prisma.LinkUpdateInput = {};

    if (dto.slug !== undefined) {
      const slug = normalizeSlug(dto.slug);
      const check = validateSlug(slug);
      if (!check.valid) throw new BadRequestException(check.reason);
      // Skip the write when nothing actually changed, so re-saving a form does
      // not trip the unique constraint against the link's own current slug.
      if (slug !== existing.slug) {
        data.slug = slug;
        data.isCustomSlug = true;
      }
    }

    if (dto.url !== undefined) {
      data.targetUrl = this.validateTargetUrl(dto.url);
    }
    if (dto.title !== undefined) {
      data.title = dto.title.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt === null ? null : this.parseExpiry(dto.expiresAt);
    }

    if (Object.keys(data).length === 0) {
      return this.present(existing, ownerId);
    }

    try {
      const updated = await this.prisma.link.update({ where: { id }, data });
      return this.present(updated, ownerId);
    } catch (error) {
      if (this.isSlugCollision(error)) {
        throw new ConflictException(`The slug "${data.slug as string}" is already taken`);
      }
      throw error;
    }
  }

  /**
   * Deletes a link the caller owns. Its visits cascade away with it.
   *
   * @param id      Link ID.
   * @param ownerId Authenticated user's ID.
   * @throws {NotFoundException}  When the link does not exist.
   * @throws {ForbiddenException} When the caller does not own it.
   */
  async remove(id: string, ownerId: string): Promise<void> {
    await this.assertOwnership(id, ownerId);
    await this.prisma.link.delete({ where: { id } });
    this.logger.log(`Deleted link ${id}`);
  }

  /**
   * Reports whether a slug is free, for the UI's live availability check.
   *
   * Intentionally leaks only a boolean — never the target of an existing link.
   *
   * @param slug Candidate slug.
   * @returns Availability plus a reason when unavailable.
   */
  async checkSlugAvailability(slug: string): Promise<{ available: boolean; reason?: string }> {
    const candidate = normalizeSlug(slug);
    const check = validateSlug(candidate);
    if (!check.valid) return { available: false, reason: check.reason };

    const existing = await this.prisma.link.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    return existing ? { available: false, reason: 'This slug is already taken' } : { available: true };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Configured public base URL used to build short links. */
  private get publicBaseUrl(): string {
    return this.config.get('publicBaseUrl', { infer: true });
  }

  /**
   * Validates a destination URL and returns its canonical form.
   *
   * Private/loopback destinations are permitted outside production so the app
   * can be exercised against `localhost` during development.
   *
   * @param url Raw URL input.
   * @returns The normalised URL.
   * @throws {BadRequestException} When validation fails.
   */
  private validateTargetUrl(url: string): string {
    const allowPrivate = this.config.get('nodeEnv', { infer: true }) !== 'production';
    const result = validateUrl(url, allowPrivate);
    if (!result.valid || !result.normalized) {
      throw new BadRequestException(result.reason ?? 'Please enter a valid URL');
    }
    return result.normalized;
  }

  /**
   * Parses an optional ISO expiry string.
   *
   * @param value ISO-8601 timestamp, or `undefined`.
   * @returns A `Date`, or `undefined` when not supplied.
   * @throws {BadRequestException} When the date is unparseable or in the past.
   */
  private parseExpiry(value?: string | null): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expiresAt must be a valid ISO-8601 date');
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    return date;
  }

  /**
   * Loads a link and asserts the caller owns it.
   *
   * Anonymous links (`ownerId === null`) are owned by nobody and therefore
   * cannot be edited — otherwise any visitor could repoint someone else's link.
   *
   * @param id      Link ID.
   * @param ownerId Authenticated user's ID.
   * @returns The link row.
   * @throws {NotFoundException}  When it does not exist.
   * @throws {ForbiddenException} When the caller is not the owner.
   */
  private async assertOwnership(id: string, ownerId: string): Promise<Link> {
    const link = await this.prisma.link.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.ownerId !== ownerId) {
      throw new ForbiddenException('You do not have permission to modify this link');
    }
    return link;
  }

  /**
   * Builds the Prisma `where` clause for a list query.
   *
   * @param query    Filter options.
   * @param viewerId Requesting user's ID, if any.
   * @returns A Prisma filter.
   */
  /**
   * Finds an existing link for this URL that the caller can safely be given.
   *
   * Matching is scoped by ownership, and the two cases fall out of one filter:
   *
   *  • **Signed in** — matches only that user's own links. Handing over another
   *    user's link would give the caller something they cannot edit, whose owner
   *    can repoint or delete it after they have shared it, and whose analytics
   *    would silently merge with theirs.
   *  • **Anonymous** — matches only unowned links (`ownerId IS NULL`). These are
   *    safe to share: nobody can edit or delete an anonymous link, because
   *    `assertOwnership` rejects every caller when there is no owner.
   *
   * Only a bare request is reused. Asking for a custom slug, a title or an
   * expiry means asking for something the existing link does not have, and
   * silently returning it would drop part of the request.
   *
   * @param dto       The creation payload, checked for customising fields.
   * @param targetUrl The normalised destination.
   * @param ownerId   Authenticated user's ID, or `undefined` when anonymous.
   * @returns The reusable link, or `null` when there is none or the request
   *          does not qualify.
   */
  private async findReusableLink(
    dto: CreateLinkDto,
    targetUrl: string,
    ownerId?: string,
  ): Promise<Link | null> {
    if (dto.slug || dto.title || dto.expiresAt) return null;

    return this.prisma.link.findFirst({
      where: {
        // `?? null` is what makes an anonymous caller match unowned links only,
        // and never a link belonging to a signed-in user.
        ownerId: ownerId ?? null,
        targetUrl,
        // A dead link is not a usable answer. Returning a deactivated or expired
        // link would hand back a short URL that does not redirect — worse than
        // simply creating a fresh one.
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildWhere(query: ListLinksQueryDto, viewerId?: string): Prisma.LinkWhereInput {
    const where: Prisma.LinkWhereInput = {};

    if (query.mineOnly && viewerId) {
      where.ownerId = viewerId;
    }

    if (query.search) {
      // `mode: 'insensitive'` maps to Postgres ILIKE.
      where.OR = [
        { slug: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { targetUrl: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * Builds the Prisma `orderBy` clause.
   *
   * `sortBy` is constrained to a fixed allow-list by the DTO, so this cannot
   * become an injection point for arbitrary column names.
   *
   * @param query Sort options.
   * @returns A Prisma ordering, with `id` as a stable tie-breaker.
   */
  private buildOrderBy(query: ListLinksQueryDto): Prisma.LinkOrderByWithRelationInput[] {
    const field = query.sortBy ?? 'createdAt';
    const direction = query.sortOrder ?? 'desc';
    // The secondary sort keeps pagination deterministic when many rows share a
    // value (e.g. hundreds of links with visitCount = 0).
    return [{ [field]: direction }, { id: 'asc' }];
  }

  /**
   * Detects Prisma's unique-constraint error for the `slug` column.
   *
   * @param error Any caught value.
   * @returns `true` when the error is a slug collision.
   */
  private isSlugCollision(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    );
  }

  /**
   * Maps a row to its API representation using the configured base URL.
   *
   * @param link     Database row.
   * @param viewerId Requesting user's ID, if any.
   * @returns The API-facing link.
   */
  private present(link: Link, viewerId?: string): LinkResponseDto {
    return toLinkDto(link, this.publicBaseUrl, viewerId);
  }
}
