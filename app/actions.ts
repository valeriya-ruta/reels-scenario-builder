'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';
import { Project, Scene, Transition, SnapshotData, Location } from '@/lib/domain';
import {
  type IdeaScanReelStringMap,
  parseIdeaScanReelStringMap,
} from '@/lib/ideaScanTypes';
import { DEFAULT_SCENE_VALUES } from '@/lib/sceneDefaults';
import { headers } from 'next/headers';
import { resolveReferenceMediaUrl } from '@/lib/ai/referenceMedia';
import { transcribeMediaFromUrl, type TranscriptSegment } from '@/lib/ai/sttProvider';
import { splitTranscriptIntoScenes } from '@/lib/ai/sceneSegmentation';
import { transformRantToScript } from '@/lib/ai/rantToScript';
import { templatizeTranscriptToScenes } from '@/lib/ai/transcriptToTemplate';
import { aiLimit, transcribeLimit } from '@/lib/ratelimit';

type ImportMode = 'replace' | 'append';
type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

interface ReferencePreview {
  transcript: string;
  language: string | null;
  scenes: Array<{
    text: string;
    startSec: number;
    endSec: number;
  }>;
}

export type GenerateReferenceResult =
  | {
      ok: true;
      data: ReferencePreview;
    }
  | {
      ok: false;
      error: string;
    };

export type GenerateReelFromRantResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

async function assertProjectOwner(projectId: string, userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  return Boolean(data);
}

export async function updateProjectName(
  projectId: string,
  name: string
): Promise<ActionResult<{ name: string }>> {
  const user = await requireAuth();
  if (!user) {
    return { ok: false, error: 'Необхідно увійти в акаунт.' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: 'Назва не може бути порожньою.' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('projects')
    .update({ name: trimmed })
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) {
    return { ok: false, error: 'Не вдалося оновити назву сценарію.' };
  }

  return { ok: true, data: { name: trimmed } };
}

export async function deleteProject(projectId: string) {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', user.id);
}

export async function updateCrewMode(projectId: string, crewMode: 'solo' | 'with_crew') {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase
    .from('projects')
    .update({ crew_mode: crewMode })
    .eq('id', projectId)
    .eq('user_id', user.id);
}

export async function createScene(projectId: string, orderIndex: number) {
  const user = await requireAuth();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();
  const { data: scene, error } = await supabase
    .from('scenes')
    .insert({
      project_id: projectId,
      order_index: orderIndex,
      ...DEFAULT_SCENE_VALUES,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating scene:', error);
    return null;
  }

  return scene as Scene;
}

export async function generateReferenceFromVideoLink(
  projectId: string,
  reelUrl: string
): Promise<GenerateReferenceResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return { ok: false, error: 'Необхідно увійти в акаунт.' };
    }

    if (!reelUrl.trim()) {
      return { ok: false, error: 'Встав посилання на публічний Instagram Reel або відео TikTok.' };
    }

    const isOwner = await assertProjectOwner(projectId, user.id);
    if (!isOwner) {
      return { ok: false, error: 'Проєкт не знайдено або доступ заборонений.' };
    }

    const tr = await transcribeLimit.limit(user.id);
    if (!tr.success) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    const { mediaUrl } = await resolveReferenceMediaUrl(reelUrl);
    const transcriptResult = await transcribeMediaFromUrl(mediaUrl);

    const ai = await aiLimit.limit(user.id);
    if (!ai.success) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    const sceneDrafts = await splitTranscriptIntoScenes(
      transcriptResult.transcript,
      transcriptResult.segments
    );

    return {
      ok: true,
      data: {
        transcript: transcriptResult.transcript,
        language: transcriptResult.language,
        scenes: sceneDrafts,
      },
    };
  } catch (error) {
    const fallback =
      'Не вдалося обробити посилання. Перевір, що Reel публічний і спробуй ще раз через хвилину.';
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : fallback;
    return { ok: false, error: message };
  }
}

export async function importReferenceScenes(
  projectId: string,
  sceneTexts: string[],
  mode: ImportMode
): Promise<Scene[]> {
  const user = await requireAuth();
  if (!user) {
    throw new Error('Необхідно увійти в акаунт.');
  }

  if (mode !== 'append' && mode !== 'replace') {
    throw new Error('Некоректний режим імпорту.');
  }

  const sanitizedTexts = sceneTexts.map((text) => text.trim()).filter(Boolean);
  if (sanitizedTexts.length === 0) {
    throw new Error('Немає сцен для імпорту.');
  }

  const supabase = await createServerSupabaseClient();
  const isOwner = await assertProjectOwner(projectId, user.id);
  if (!isOwner) {
    throw new Error('Проєкт не знайдено або доступ заборонений.');
  }

  if (mode === 'replace') {
    const { error: deleteError } = await supabase
      .from('scenes')
      .delete()
      .eq('project_id', projectId);
    if (deleteError) {
      throw new Error(`Не вдалося очистити сцени: ${deleteError.message}`);
    }
  }

  const { data: existingScenes, error: existingError } = await supabase
    .from('scenes')
    .select('order_index')
    .eq('project_id', projectId)
    .order('order_index', { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(`Не вдалося отримати сцени: ${existingError.message}`);
  }

  const baseIndex = existingScenes?.[0]?.order_index ?? -1;
  const payload = sanitizedTexts.map((lines, index) => ({
    project_id: projectId,
    order_index: baseIndex + index + 1,
    lines,
    ...DEFAULT_SCENE_VALUES,
  }));

  const { error: insertError } = await supabase.from('scenes').insert(payload);
  if (insertError) {
    throw new Error(`Не вдалося імпортувати сцени: ${insertError.message}`);
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('scenes')
    .select('*')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });

  if (refreshError) {
    throw new Error(`Не вдалося оновити список сцен: ${refreshError.message}`);
  }

  return (refreshed ?? []) as Scene[];
}

export async function updateScene(sceneId: string, updates: Partial<Scene>) {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase
    .from('scenes')
    .update(updates)
    .eq('id', sceneId);
}

export async function deleteScene(sceneId: string) {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase.from('scenes').delete().eq('id', sceneId);
}

export async function reorderScenes(projectId: string, sceneIds: string[]) {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  
  // Update order_index for each scene
  const updates = sceneIds.map((id, index) =>
    supabase
      .from('scenes')
      .update({ order_index: index })
      .eq('id', id)
      .eq('project_id', projectId)
  );

  await Promise.all(updates);
}

export async function updateTransition(
  transitionId: string,
  updates: Partial<Transition>
) {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase
    .from('transitions')
    .update(updates)
    .eq('id', transitionId);
}

export async function createTransition(
  projectId: string,
  sceneBeforeId: string,
  sceneAfterId: string
) {
  const user = await requireAuth();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();
  const { data: transition, error } = await supabase
    .from('transitions')
    .insert({
      project_id: projectId,
      scene_before_id: sceneBeforeId,
      scene_after_id: sceneAfterId,
      type: 'hard_cut',
      transition_action: 'no_action',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating transition:', error);
    return null;
  }

  return transition as Transition;
}

export async function createLocation(name: string): Promise<Location | null> {
  const user = await requireAuth();
  if (!user) return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('locations')
    .insert({ user_id: user.id, name: trimmed })
    .select()
    .single();

  if (error) {
    console.error('Error creating location:', error);
    return null;
  }

  return data as Location;
}

export async function updateLocation(id: string, name: string): Promise<Location | null> {
  const user = await requireAuth();
  if (!user) return null;

  const trimmed = name.trim();
  if (!trimmed) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('locations')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating location:', error);
    return null;
  }

  return data as Location;
}

export async function deleteLocation(id: string): Promise<void> {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase.from('locations').delete().eq('id', id).eq('user_id', user.id);
}

export async function createSnapshot(
  projectId: string
): Promise<ActionResult<{ actor: string; editor: string }>> {
  const user = await requireAuth();
  if (!user) {
    return { ok: false, error: 'Необхідно увійти в акаунт.' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch project, scenes, and transitions
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
    return { ok: false, error: 'Не вдалося знайти сценарій для шерингу.' };
  }

  const { data: scenes, error: scenesError } = await supabase
    .from('scenes')
    .select('*')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });

  if (scenesError) {
    return { ok: false, error: 'Не вдалося зібрати сцени для шерингу.' };
  }

  const { data: transitions, error: transitionsError } = await supabase
    .from('transitions')
    .select('*')
    .eq('project_id', projectId);

  if (transitionsError) {
    return { ok: false, error: 'Не вдалося зібрати переходи для шерингу.' };
  }

  const sceneRows = (scenes as Scene[]) || [];
  const locationIds = [
    ...new Set(
      sceneRows
        .map((s) => s.location_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const nameById = new Map<string, string>();
  if (locationIds.length > 0) {
    const { data: locs } = await supabase
      .from('locations')
      .select('id,name')
      .in('id', locationIds)
      .eq('user_id', user.id);

    locs?.forEach((l) => nameById.set(l.id, l.name));
  }

  const scenesForSnapshot: Scene[] = sceneRows.map((s) => ({
    ...s,
    location_name: s.location_id ? nameById.get(s.location_id) ?? null : null,
  }));

  const snapshotData: SnapshotData = {
    project: project as Project,
    scenes: scenesForSnapshot,
    transitions: (transitions as Transition[]) || [],
  };

  const actorToken = nanoid();
  const editorToken = nanoid();

  const { error } = await supabase.from('snapshots').insert({
    project_id: projectId,
    snapshot_data: snapshotData,
    actor_token: actorToken,
    editor_token: editorToken,
  });

  if (error) {
    console.error('Error creating snapshot:', error);
    return { ok: false, error: 'Не вдалося створити посилання для шерингу.' };
  }

  // Prefer explicit env, then forwarded/origin headers for deploy proxies.
  // If we cannot determine an absolute base URL, fail clearly.
  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin')?.trim();
  const forwardedHost = requestHeaders.get('x-forwarded-host')?.trim();
  const forwardedProto = requestHeaders.get('x-forwarded-proto')?.trim();
  const host = requestHeaders.get('host')?.trim();

  const baseUrl =
    (envBaseUrl && envBaseUrl.replace(/\/$/, '')) ||
    (origin && origin.replace(/\/$/, '')) ||
    (forwardedHost
      ? `${(forwardedProto || 'https').replace(/:$/, '')}://${forwardedHost}`.replace(
          /\/$/,
          ''
        )
      : '') ||
    (host
      ? `${(forwardedProto || 'http').replace(/:$/, '')}://${host}`.replace(
          /\/$/,
          ''
        )
      : '');

  if (!baseUrl) {
    return {
      ok: false,
      error:
        'Не вдалося визначити адресу застосунку для посилання. Додай NEXT_PUBLIC_APP_URL.',
    };
  }

  return {
    ok: true,
    data: {
      actor: `${baseUrl}/share/${actorToken}/actor`,
      editor: `${baseUrl}/share/${editorToken}/editor`,
    },
  };
}

export async function generateReelFromRant(
  rant: string
): Promise<GenerateReelFromRantResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return { ok: false, error: 'Необхідно увійти в акаунт.' };
    }

    const trimmed = rant.trim();
    if (!trimmed) {
      return { ok: false, error: 'Текст ренту порожній.' };
    }

    const { success } = await aiLimit.limit(user.id);
    if (!success) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    const { title, scenes } = await transformRantToScript(trimmed);

    const supabase = await createServerSupabaseClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: title,
        crew_mode: 'with_crew',
        user_id: user.id,
      })
      .select()
      .single();

    if (projectError || !project) {
      return {
        ok: false,
        error: projectError?.message ?? 'Не вдалося створити проєкт.',
      };
    }

    const scenePayload = scenes.map((s, idx) => ({
      project_id: project.id,
      order_index: idx,
      lines: s.text,
      ...DEFAULT_SCENE_VALUES,
      name: s.name ?? null,
      editor_note: s.editor_note ?? null,
    }));

    const { error: insertError } = await supabase
      .from('scenes')
      .insert(scenePayload);

    if (insertError) {
      return {
        ok: false,
        error: `Проєкт створено, але не вдалося додати сцени: ${insertError.message}`,
      };
    }

    return { ok: true, projectId: project.id };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Не вдалося згенерувати рілс. Спробуй ще раз.';
    return { ok: false, error: message };
  }
}

export type SaveCompetitorReelToScenarioResult =
  | {
      ok: true;
      projectId: string;
      user_note: IdeaScanReelStringMap;
      reference_url: IdeaScanReelStringMap;
    }
  | { ok: false; error: string };

const MAX_COMPETITOR_REEL_NOTE = 500;

/**
 * Transcribes the reel video, generalizes the transcript into a reusable template (placeholders in [brackets]),
 * creates a new reels project with scenes, bookmarks the reel on the scan, and marks the project as unseen for the list badge.
 */
export async function saveCompetitorReelToScenario(
  scanId: string,
  reel: { shortCode: string; videoUrl: string; url: string; userNote?: string }
): Promise<SaveCompetitorReelToScenarioResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return { ok: false, error: 'Необхідно увійти в акаунт.' };
    }

    const shortCode = reel.shortCode.trim();
    const videoUrl = reel.videoUrl.trim();
    if (!shortCode || !videoUrl) {
      return { ok: false, error: 'Немає відео для транскрипції.' };
    }

    const refUrlRaw = reel.url.trim();
    const refNoteRaw = (reel.userNote ?? '').trim().slice(0, MAX_COMPETITOR_REEL_NOTE);

    const supabase = await createServerSupabaseClient();

    const { data: scanRow, error: scanErr } = await supabase
      .from('idea_scans')
      .select('id, saved_reel_ids, user_note, reference_url')
      .eq('id', scanId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (scanErr) {
      const msg = scanErr.message ?? '';
      if (msg.includes('user_note') || msg.includes('reference_url')) {
        return {
          ok: false,
          error:
            'Потрібна міграція БД (колонки user_note / reference_url на idea_scans). Запусти migration_idea_scans_reel_notes_and_projects_reference.sql у Supabase.',
        };
      }
      return { ok: false, error: `Не вдалося отримати скан: ${msg}` };
    }

    if (!scanRow) {
      return { ok: false, error: 'Скан не знайдено.' };
    }

    const saved = (scanRow.saved_reel_ids as string[] | null) ?? [];
    if (saved.includes(shortCode)) {
      return { ok: false, error: 'Цей рілс уже збережено.' };
    }

    const trLimit = await transcribeLimit.limit(user.id);
    if (!trLimit.success) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    let transcript = '';
    let segments: TranscriptSegment[] = [];

    try {
      const transcriptResult = await transcribeMediaFromUrl(videoUrl);
      transcript = transcriptResult.transcript;
      segments = transcriptResult.segments;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const canBrief = refNoteRaw.length > 0 || refUrlRaw.length > 0;
      if (canBrief && msg.includes('empty')) {
        transcript = '';
        segments = [];
      } else {
        throw e;
      }
    }

    const tplContext = {
      referenceUrl: refUrlRaw || null,
      referenceNote: refNoteRaw || null,
    };

    let title = 'Рілс з конкурента';
    let scenes: Array<{ text: string }> = [];

    const aiLimitResult = await aiLimit.limit(user.id);
    if (!aiLimitResult.success) {
      return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
    }

    try {
      const templated = await templatizeTranscriptToScenes(transcript, tplContext);
      title = templated.title;
      scenes = templated.scenes;
    } catch (templateError) {
      if (!transcript.trim()) {
        throw templateError;
      }
      console.warn('Template generation failed, using deterministic scene split.', templateError);
      const fallbackDrafts = await splitTranscriptIntoScenes(transcript, segments);
      scenes = fallbackDrafts.map((draft) => ({ text: draft.text.trim() })).filter((s) => s.text);
      if (scenes.length === 0) {
        throw templateError;
      }
    }

    const projectInsert: Record<string, unknown> = {
      name: title,
      crew_mode: 'with_crew',
      user_id: user.id,
      project_type: 'reels',
      scenario_unseen: true,
      reference_url: refUrlRaw || null,
      reference_note: refNoteRaw || null,
    };

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectInsert)
      .select()
      .single();

    if (projectError || !project) {
      const msg = projectError?.message ?? '';
      if (msg.includes('scenario_unseen') || msg.includes('project_type')) {
        return {
          ok: false,
          error:
            'Потрібна міграція БД (колонки scenario_unseen / project_type). Запусти migration_projects_scenario_unseen.sql у Supabase.',
        };
      }
      if (msg.includes('reference_')) {
        return {
          ok: false,
          error:
            'Потрібна міграція БД (колонки reference_url / reference_note на projects). Запусти migration_idea_scans_reel_notes_and_projects_reference.sql у Supabase.',
        };
      }
      return {
        ok: false,
        error: projectError?.message ?? 'Не вдалося створити проєкт.',
      };
    }

    const scenePayload = scenes.map((s, idx) => ({
      project_id: project.id,
      order_index: idx,
      lines: s.text,
      ...DEFAULT_SCENE_VALUES,
    }));

    const { error: insertError } = await supabase.from('scenes').insert(scenePayload);

    if (insertError) {
      await supabase.from('projects').delete().eq('id', project.id);
      return {
        ok: false,
        error: `Не вдалося додати сцени: ${insertError.message}`,
      };
    }

    const existingNotes = parseIdeaScanReelStringMap(scanRow.user_note);
    const existingUrls = parseIdeaScanReelStringMap(scanRow.reference_url);
    existingNotes[shortCode] = refNoteRaw;
    existingUrls[shortCode] = refUrlRaw;

    const nextSaved = [...saved, shortCode];
    const { error: updateErr } = await supabase
      .from('idea_scans')
      .update({
        saved_reel_ids: nextSaved,
        user_note: existingNotes,
        reference_url: existingUrls,
      })
      .eq('id', scanId)
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('idea_scans saved reels + notes update', updateErr);
    }

    return {
      ok: true,
      projectId: project.id as string,
      user_note: existingNotes,
      reference_url: existingUrls,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Не вдалося зберегти рілс. Спробуй ще раз.';
    return { ok: false, error: message };
  }
}

export async function markProjectScenarioSeen(projectId: string): Promise<void> {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase
    .from('projects')
    .update({ scenario_unseen: false })
    .eq('id', projectId)
    .eq('user_id', user.id);
}
