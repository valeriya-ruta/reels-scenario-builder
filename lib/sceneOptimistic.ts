import { nanoid } from 'nanoid';
import type { Scene } from '@/lib/domain';

export const OPTIMISTIC_SCENE_PREFIX = 'optimistic-';

export function isOptimisticSceneId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_SCENE_PREFIX);
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
