import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsArticle {
  athlete_id: string;
  title: string;
  summary: string;
  url: string;
}

// ─── Mock external news fetcher ───────────────────────────────────────────────

/**
 * fetchNewsFromExternalAPI
 *
 * Placeholder for a real news API integration (e.g. NewsAPI, SERP API, or a
 * dedicated sports data provider). Replace the return value with actual API
 * calls once credentials are available.
 *
 * @param athleteId - The Supabase UUID of the athlete to fetch news for.
 * @returns An array of mock news articles attributed to the athlete.
 */
async function fetchNewsFromExternalAPI(athleteId: string): Promise<NewsArticle[]> {
  // Simulate network latency in the mock
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  return [
    {
      athlete_id: athleteId,
      title: `[Mock] Athlete ${athleteId.slice(0, 8)} sets a new personal record`,
      summary:
        'In a stunning performance today, the athlete broke their personal best across ' +
        'three key metrics during the morning training session.',
      url: `https://example.com/news/${athleteId}/record`,
    },
    {
      athlete_id: athleteId,
      title: `[Mock] ${athleteId.slice(0, 8)}'s weekly performance report`,
      summary:
        "This week's analytics show steady improvement in strength and endurance " +
        'benchmarks compared to the previous 7-day rolling average.',
      url: `https://example.com/news/${athleteId}/weekly`,
    },
  ];
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── 1. Authorization guard ──────────────────────────────────────────────────
  // Vercel sends the secret in the Authorization header as "Bearer <secret>"
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[fetch-news] Unauthorized request — invalid or missing CRON_SECRET.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Supabase admin client ────────────────────────────────────────────────
  // Use the service-role key to bypass RLS — this is a trusted server-side job.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        // Disable session persistence — not needed for server-side jobs
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  try {
    // ── 3. Fetch distinct athlete IDs tracked by at least one user ────────────
    const { data: athleteRows, error: fetchError } = await supabase
      .from('user_athletes')
      .select('athlete_id');

    if (fetchError) throw new Error(`Failed to fetch athlete IDs: ${fetchError.message}`);

    // Deduplicate in-memory (cheaper than a DB GROUP BY for small sets)
    const uniqueAthleteIds = [
      ...new Set((athleteRows ?? []).map((row) => row.athlete_id as string)),
    ];

    if (uniqueAthleteIds.length === 0) {
      console.log('[fetch-news] No athletes found in user_athletes — nothing to do.');
      return NextResponse.json({ ok: true, inserted: 0, deleted: 0 });
    }

    console.log(`[fetch-news] Processing ${uniqueAthleteIds.length} unique athlete(s).`);

    // ── 4. Fetch news + collect articles for all athletes ─────────────────────
    const allArticles: NewsArticle[] = [];

    for (const athleteId of uniqueAthleteIds) {
      const articles = await fetchNewsFromExternalAPI(athleteId);
      allArticles.push(...articles);
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
      inserted: insertedCount,
      deleted: deletedCount ?? 0,
      athletes: uniqueAthleteIds.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[fetch-news] Fatal error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
