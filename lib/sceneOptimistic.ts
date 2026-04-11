import { nanoid } from 'nanoid';
import type { Scene } from '@/lib/domain';

export const OPTIMISTIC_SCENE_PREFIX = 'optimistic-';

export function isOptimisticSceneId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_SCENE_PREFIX);
}

/** Keeps in-memory edits made while the row was optimistic; server row may be empty until persisted. */
export function mergeServerSceneWithLocalDraft(server: Scene, local: Scene): Partial<Scene> {
  return {
    lines: local.lines ?? server.lines,
    name: local.name ?? server.name,
    actor_note: local.actor_note ?? server.actor_note,
    editor_note: local.editor_note ?? server.editor_note,
    location_id: local.location_id ?? server.location_id,
    framing: local.framing ?? server.framing,
    pose: local.pose ?? server.pose,
    arm_state: local.arm_state ?? server.arm_state,
    facing: local.facing ?? server.facing,
    camera_motion: local.camera_motion ?? server.camera_motion,
    shot_size: local.shot_size ?? server.shot_size,
    scene_transition_action: local.scene_transition_action ?? server.scene_transition_action,
    is_checked: local.is_checked ?? server.is_checked,
  };
}

/** Client-only placeholder shown immediately while createScene runs on the server. */
export function buildOptimisticScene(projectId: string, orderIndex: number): Scene {
  const now = new Date().toISOString();
  return {
    id: `${OPTIMISTIC_SCENE_PREFIX}${nanoid()}`,
    project_id: projectId,
    order_index: orderIndex,
    name: null,
    lines: null,
    framing: 'above_waist',
    pose: 'standing',
    arm_state: 'arms_at_sides',
    facing: 'toward_camera',
    camera_motion: null,
    shot_size: null,
    location_id: null,
    scene_transition_action: null,
    actor_note: null,
    editor_note: null,
    is_checked: false,
    created_at: now,
  };
}
