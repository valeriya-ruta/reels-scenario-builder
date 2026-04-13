import { renderSlideImagePng } from '@/lib/carousel/renderSlideImage';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Body = {
  title?: string;
  body?: string;
  placement?: 'top' | 'center' | 'bottom';
  background_type?: 'color' | 'image';
  background_color?: string;
  background_image_url?: string | null;
  background_image_base64?: string | null;
  title_color?: string;
  body_color?: string;
  slide_index?: number;
  total_slides?: number;
};

export async function POST(req: Request) {
  let json: Body;
  try {
    json = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const placement = json.placement ?? 'center';
  const background_type = json.background_type ?? 'color';
  const slide_index = Number(json.slide_index);
  const total_slides = Number(json.total_slides);

  if (!['top', 'center', 'bottom'].includes(placement)) {
    return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
  }
  if (!['color', 'image'].includes(background_type)) {
    return NextResponse.json({ error: 'Invalid background_type' }, { status: 400 });
  }
  if (!Number.isFinite(slide_index) || slide_index < 1) {
    return NextResponse.json({ error: 'Invalid slide_index' }, { status: 400 });
  }
  if (!Number.isFinite(total_slides) || total_slides < 1) {
    return NextResponse.json({ error: 'Invalid total_slides' }, { status: 400 });
  }

  try {
    const png = await renderSlideImagePng({
      title: json.title ?? '',
      body: json.body ?? '',
      placement,
      background_type,
      background_color: json.background_color ?? '#1A1A2E',
      background_image_url: json.background_image_url ?? null,
      background_image_base64: json.background_image_base64 ?? null,
      title_color: json.title_color ?? '#FFFFFF',
      body_color: json.body_color ?? '#FFFFFF',
      slide_index,
      total_slides,
    });
    const image_base64 = png.toString('base64');
    return NextResponse.json({ image_base64 });
  } catch (e) {
    console.error('[carousel/generate-slide]', e);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
