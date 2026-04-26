import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE = 'https://newsapi.org/v2/everything';
const MAX_ARTICLES_PER_ATHLETE = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Row shape written to the `daily_news` Supabase table. */
interface DailyNewsRow {
  athlete_id: string;
  title: string;
  summary: string;
  url: string;
  published_date: string | null;
}

/** Article shape returned by the NewsAPI v2 `/everything` endpoint. */
interface NewsApiArticle {
  title: string | null;
  description: string | null;
  url: string | null;
  publishedAt: string | null;
}

/** NewsAPI v2 response envelope. */
interface NewsApiResponse {
  status: 'ok' | 'error';
  totalResults?: number;
  articles?: NewsApiArticle[];
  message?: string; // present on error status
}

/** A tracked athlete with their display name. */
interface TrackedAthlete {
  athlete_id: string;
  name: string;
}

// ─── Real NewsAPI fetcher ─────────────────────────────────────────────────────

/**
 * fetchNewsForAthlete
 *
 * Calls the NewsAPI v2 `/everything` endpoint for the given athlete name.
 * Returns up to MAX_ARTICLES_PER_ATHLETE rows ready to insert into `daily_news`.
 *
 * Throws if the HTTP request itself fails (network error, DNS, etc.).
 * Returns an empty array and logs a warning on API-level errors (rate limit,
 * invalid key, zero results) so a single athlete failure never crashes the job.
 *
 * @param athleteId - The Supabase UUID of the athlete (stored on each row).
 * @param athleteName - The athlete's display name used as the search query.
 */
async function fetchNewsForAthlete(
  athleteId: string,
  athleteName: string,
): Promise<DailyNewsRow[]> {
  const url = new URL(NEWS_API_BASE);
  url.searchParams.set('q', athleteName);
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('language', 'en');
  url.searchParams.set('pageSize', String(MAX_ARTICLES_PER_ATHLETE));
  url.searchParams.set('apiKey', NEWS_API_KEY!);

  const res = await fetch(url.toString(), {
    // Disable Next.js fetch caching — we always want fresh results
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`NewsAPI HTTP ${res.status} for athlete "${athleteName}"`);
  }

  const data: NewsApiResponse = await res.json();

  if (data.status !== 'ok') {
    // API-level error (e.g. rateLimited, apiKeyInvalid)
    console.warn(
      `[fetch-news] NewsAPI returned status="${data.status}" for "${athleteName}": ${data.message ?? 'no message'}`,
    );
    return [];
  }

  const articles = data.articles ?? [];

  return articles
    .filter(
      // Drop articles with missing required fields — NewsAPI occasionally
      // returns [Removed] placeholder articles with null titles/urls.
      (a): a is NewsApiArticle & { title: string; url: string } =>
        Boolean(a.title) && Boolean(a.url) && a.title !== '[Removed]',
    )
    .slice(0, MAX_ARTICLES_PER_ATHLETE)
    .map((a) => ({
      athlete_id: athleteId,
      title: a.title,
      summary: a.description ?? '',
      url: a.url,
      published_date: a.publishedAt ?? null,
    }));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── 1. Authorization guard ──────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[fetch-news] Unauthorized — invalid or missing CRON_SECRET.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!NEWS_API_KEY) {
    console.error('[fetch-news] NEWS_API_KEY is not set — cannot fetch news.');
    return NextResponse.json({ error: 'NEWS_API_KEY not configured' }, { status: 500 });
  }

  // ── 2. Supabase admin client ────────────────────────────────────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  try {
    // ── 3. Fetch tracked athletes joined with their names ─────────────────────
    // Join user_athletes → athletes to get the string name for the NewsAPI query.
    // We select distinct athlete_id + name pairs in-app after dedup.
    const { data: rows, error: fetchError } = await supabase
      .from('user_athletes')
      .select('athlete_id, athletes(name)');

    if (fetchError) {
      throw new Error(`Failed to fetch tracked athletes: ${fetchError.message}`);
    }

    // Deduplicate by athlete_id and extract the joined name
    const seen = new Set<string>();
    const trackedAthletes: TrackedAthlete[] = [];

    for (const row of rows ?? []) {
      if (seen.has(row.athlete_id)) continue;
      seen.add(row.athlete_id);

      // Supabase returns the joined row as an object or null
      const athleteRecord = Array.isArray(row.athletes)
        ? row.athletes[0]
        : row.athletes;

      if (!athleteRecord?.name) {
        console.warn(
          `[fetch-news] Skipping athlete_id ${row.athlete_id} — no name found in athletes table.`,
        );
        continue;
      }

      trackedAthletes.push({ athlete_id: row.athlete_id, name: athleteRecord.name });
    }

    if (trackedAthletes.length === 0) {
      console.log('[fetch-news] No tracked athletes with names — nothing to do.');
      return NextResponse.json({ ok: true, inserted: 0, deleted: 0, athletes: 0 });
    }

    console.log(`[fetch-news] Processing ${trackedAthletes.length} athlete(s).`);

    // ── 4. Fetch news per athlete — per-athlete isolation ─────────────────────
    // A rate-limit or API error for one athlete is logged and skipped; the rest
    // of the athletes continue to be processed normally.
    const allArticles: DailyNewsRow[] = [];

    for (const { athlete_id, name } of trackedAthletes) {
      try {
        const articles = await fetchNewsForAthlete(athlete_id, name);
        console.log(`[fetch-news] "${name}" → ${articles.length} article(s) fetched.`);
        allArticles.push(...articles);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[fetch-news] Skipping "${name}" (athlete_id: ${athlete_id}) — ${msg}`,
        );
        // Continue to next athlete — do not re-throw
      }
    }

    // ── 5. Bulk-insert articles into daily_news ───────────────────────────────
    let insertedCount = 0;

    if (allArticles.length > 0) {
      const { error: insertError } = await supabase
        .from('daily_news')
        .insert(allArticles);

      if (insertError) {
        throw new Error(`Failed to insert articles: ${insertError.message}`);
      }

      insertedCount = allArticles.length;
      console.log(`[fetch-news] Inserted ${insertedCount} article(s).`);
    } else {
      console.log('[fetch-news] No articles to insert.');
    }

    // ── 6. Prune articles older than 48 hours ─────────────────────────────────
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { error: deleteError, count: deletedCount } = await supabase
      .from('daily_news')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);

    if (deleteError) {
      // Non-fatal — log and continue so the 200 still fires
      console.error(`[fetch-news] Pruning failed (non-fatal): ${deleteError.message}`);
    } else {
      console.log(`[fetch-news] Pruned ${deletedCount ?? 0} article(s) older than 48h.`);
    }

    // ── 7. Success response ───────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      athletes: trackedAthletes.length,
      inserted: insertedCount,
      deleted: deletedCount ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[fetch-news] Fatal error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
