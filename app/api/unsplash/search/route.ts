import { optionalServerEnv } from '@/lib/env';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PER_PAGE = 9;

export async function GET(req: Request) {
  const key = optionalServerEnv('UNSPLASH_ACCESS_KEY');
  if (!key) {
    return NextResponse.json({
      configured: false,
      results: [],
      total_pages: 0,
    });
  }

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') ?? '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  if (!query) {
    return NextResponse.json({
      configured: true,
      results: [],
      total_pages: 0,
    });
  }

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('page', String(page));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${key}` },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error('[unsplash]', res.status, t);
    return NextResponse.json({ error: 'Unsplash request failed' }, { status: 502 });
  }

  const data = (await res.json()) as {
    results?: Array<{ id: string; urls?: { regular?: string; thumb?: string } }>;
    total_pages?: number;
  };

  const results =
    data.results?.map((r) => ({
      id: r.id,
      regular: r.urls?.regular ?? '',
      thumb: r.urls?.thumb ?? r.urls?.regular ?? '',
    })) ?? [];

  return NextResponse.json({
    configured: true,
    results,
    total_pages: data.total_pages ?? 1,
  });
}
