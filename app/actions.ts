'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';
import { Project, Scene, Transition, SnapshotData } from '@/lib/domain';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export async function updateProjectName(projectId: string, name: string) {
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  await supabase
    .from('projects')
    .update({ name })
    .eq('id', projectId)
    .eq('user_id', user.id);
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
      framing: 'above_waist',
      pose: 'standing',
      arm_state: 'normal',
      facing: 'toward_camera',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating scene:', error);
    return null;
  }

  return scene as Scene;
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

export async function createSnapshot(projectId: string): Promise<{ actor: string; editor: string } | null> {
  const user = await requireAuth();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();

  // Fetch project, scenes, and transitions
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (!project) return null;

  const { data: scenes } = await supabase
    .from('scenes')
    .select('*')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });

  const { data: transitions } = await supabase
    .from('transitions')
    .select('*')
    .eq('project_id', projectId);

  const snapshotData: SnapshotData = {
    project: project as Project,
    scenes: (scenes as Scene[]) || [],
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
    return null;
  }

  // Construct URLs based on an explicit base URL or the current request origin
  // - In production (e.g. Vercel), set NEXT_PUBLIC_APP_URL to your deployed URL
  // - Otherwise we fall back to the origin header, and finally to relative paths
  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = (await headers()).get('origin')?.trim();
  const baseUrl =
    (envBaseUrl && envBaseUrl.replace(/\/$/, '')) ||
    (origin && origin.replace(/\/$/, '')) ||
    '';
  return {
    actor: `${baseUrl}/share/${actorToken}/actor`,
    editor: `${baseUrl}/share/${editorToken}/editor`,
  };
}
