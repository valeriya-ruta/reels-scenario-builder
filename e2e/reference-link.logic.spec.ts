import { test, expect } from '@playwright/test';
import { isPlayable, resolveReference } from '@/lib/reels/referenceLink';

/**
 * «Референс» as a blue word means opening a tab and losing the plan. A reel
 * reference is nearly always a video meant to be watched NEXT to the shot list,
 * so these are the rules that decide what can play in place.
 */
test.describe('a reference, shown rather than linked', () => {
  test('an Instagram reel plays', () => {
    const ref = resolveReference('https://www.instagram.com/reel/DbEHvL0N66t/');
    expect(ref?.kind).toBe('instagram');
    expect(ref?.embedUrl).toBe('https://www.instagram.com/reel/DbEHvL0N66t/embed');
  });

  test('a plain Instagram post is the same shortcode space', () => {
    expect(resolveReference('https://instagram.com/p/CV2tI1hAp32/?igshid=x')?.embedUrl).toBe(
      'https://www.instagram.com/reel/CV2tI1hAp32/embed',
    );
  });

  test('TikTok and YouTube play too, in all the shapes people paste', () => {
    expect(resolveReference('https://www.tiktok.com/@someone/video/7412345678901234567')?.kind).toBe(
      'tiktok',
    );
    expect(resolveReference('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
    expect(resolveReference('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42')?.embedUrl).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
    expect(resolveReference('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.embedUrl).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  test('a pasted picture is shown as a picture', () => {
    const ref = resolveReference('https://x.supabase.co/storage/v1/object/public/reel-refs/a/b/c.png');
    expect(ref?.kind).toBe('image');
  });

  test('a bare mp4 is played by the browser itself', () => {
    expect(resolveReference('https://cdn.example.com/clip.mp4')?.kind).toBe('video');
  });

  test('anything else stays an ordinary link', () => {
    const ref = resolveReference('https://example.com/some/page');
    expect(ref?.kind).toBe('link');
    expect(isPlayable(ref)).toBe(false);
  });

  test('a non-http "reference" is refused rather than rendered', () => {
    // A javascript: or data: URL must never reach an href or an iframe.
    expect(resolveReference('javascript:alert(1)')).toBeNull();
    expect(resolveReference('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(resolveReference('   ')).toBeNull();
    expect(resolveReference(null)).toBeNull();
  });
});
