import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ONE object = ONE status = ONE source of truth (Prompt 9).
 *
 * The bug was structural, not visual: four components each kept a private
 * `statusById` override map, so the same piece rendered «Опубліковано» in one
 * section and «Скрипт» in another on the SAME screen — Home alone mounts the
 * content rows three times over overlapping data.
 *
 * A rendering test can't stop that from coming back (it only proves the two
 * sections agreed on the data they were handed). What stops it is the rule
 * itself, so this spec asserts the rule against the source: no surface derives
 * or caches its own status, and every status write goes through the one store.
 */

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Every file under components/ and app/, so a NEW surface is covered too. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(path.relative(ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(ROOT, 'components'));
  walk(path.join(ROOT, 'app'));
  return out;
}

test.describe('status: one source of truth', () => {
  test('no surface keeps its own status cache', () => {
    const offenders = sourceFiles().filter((f) => /statusById/.test(read(f)));
    expect(
      offenders,
      `These files cache status locally, which is exactly how one object ends up with two statuses on one screen. Read it from lib/content/contentStatusStore instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('the status write path is the store, not the raw action', () => {
    const callers = sourceFiles().filter(
      (f) => f !== 'app/content-actions.ts' && /\bsetContentStatus\b/.test(read(f)),
    );
    expect(
      callers,
      `Only lib/content/contentStatusStore may call setContentStatus — it owns the optimistic update, the rollback, the «got a link?» prompt and the revalidation:\n${callers.join('\n')}`,
    ).toEqual([]);
  });

  test('the store is the single writer, and it revalidates', () => {
    const store = read('lib/content/contentStatusStore.ts');
    expect(store).toContain('setContentStatus');
    // Optimistic locally…
    expect(store).toContain('setOverride');
    // …and the server is asked to re-render every surface afterwards.
    expect(store).toContain('router.refresh()');
    // An override is dropped once the server agrees, so a later server-side
    // change is never masked by a stale local value.
    expect(store).toContain('function settle');
  });

  test('the status write invalidates every cached surface, not just the caller', () => {
    const actions = read('app/content-actions.ts');
    expect(actions).toContain("revalidatePath('/', 'layout')");
    // The status write in particular must call it — without this, navigating
    // away and back re-served the pre-change status from the RSC cache.
    const statusFn = actions.slice(actions.indexOf('export async function setContentStatus'));
    expect(statusFn.slice(0, statusFn.indexOf('\n}'))).toContain('revalidateContentSurfaces()');
  });
});

test.describe('bottom nav occlusion', () => {
  test('the nav band is defined once and reserved by the scroll container', () => {
    const css = read('app/globals.css');
    expect(css).toContain('--nav-height:');
    expect(css).toContain('--nav-clear: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))');
    // The ONE scroll container reserves it, so a new screen inherits the fix.
    expect(css).toMatch(/\.app-main-scroll\s*\{\s*padding-bottom:\s*var\(--nav-clear\)/);
    // Fixed action bars sit ON the band, never under it.
    expect(css).toMatch(/\.app-action-bar\s*\{[^}]*bottom:\s*var\(--nav-clear\)/);
  });

  test('no screen pins a bottom bar under the nav with a hardcoded offset', () => {
    const immersive = read('lib/immersiveEditorRoute.ts');
    // Editors that legitimately pin at bottom:0 are the ones that HIDE the nav.
    expect(immersive).toContain('isImmersiveEditorRoute');

    // The previously-trapped «Додати ще одне» button on Нагороди — the screen
    // keeps the nav, so its bar must use the shared clearance class.
    const rewards = read('components/rewards/RewardsView.tsx');
    expect(rewards).toContain('app-action-bar');
    expect(rewards).not.toContain('fixed inset-x-0 bottom-0');
  });
});
