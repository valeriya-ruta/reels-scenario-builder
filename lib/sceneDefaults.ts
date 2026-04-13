import type { Scene } from '@/lib/domain';

export const DEFAULT_SCENE_VALUES = {
  framing: 'above_waist',
  pose: 'standing',
  arm_state: 'arms_at_sides',
  facing: 'toward_camera',
  camera_motion: null,
  shot_size: null,
  actor_note: null,
  editor_note: null,
  is_checked: false,
} satisfies Partial<Scene>;
