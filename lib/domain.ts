export type CrewMode = 'solo' | 'with_crew';

export type Framing =
  | 'extreme_close_up'
  | 'close_up'
  | 'above_waist'
  | 'full_body'
  | 'overhead'
  | 'low_angle';

export type Pose = 'standing' | 'sitting' | 'crouching' | 'leaning';

export type ArmState =
  | 'arms_at_sides'
  | 'one_arm_raised'
  | 'holding_object'
  | 'pointing';

export type Facing = 'toward_camera' | 'away' | 'profile' | 'three_quarter';

export type CameraMotion =
  | 'static'
  | 'push_in'
  | 'pull_out'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'handheld';

export type ShotSize = 'wide' | 'medium' | 'close_up' | 'extreme_close_up';

export type TransitionType =
  | 'hard_cut'
  | 'matchcut'
  | 'jump_cut'
  | 'whip_pan'
  | 'sound_bridge'
  | 'dissolve';

export type TransitionAction =
  | 'no_action'
  | 'turn_matchcut'
  | 'through_object';

export type ProjectType = 'reels' | 'storytelling';

export interface Project {
  id: string;
  name: string;
  crew_mode: CrewMode;
  project_type: ProjectType;
  created_at: string;
  updated_at: string;
  user_id: string;
  /** True until the user opens this project from «Мої проєкти» (competitor import). */
  scenario_unseen?: boolean;
}

export interface Location {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  order_index: number;
  name: string | null;
  lines: string | null;
  framing: Framing;
  pose: Pose;
  arm_state: ArmState;
  facing: Facing;
  camera_motion: CameraMotion | null;
  shot_size: ShotSize | null;
  /** Omitted in older snapshot JSON until migration backfill. */
  location_id?: string | null;
  /** Set when serializing snapshots so share links stay self-contained. */
  location_name?: string | null;
  scene_transition_action?: TransitionAction | null;
  actor_note: string | null;
  editor_note: string | null;
  is_checked: boolean;
  created_at: string;
}

export interface Transition {
  id: string;
  project_id: string;
  scene_before_id: string;
  scene_after_id: string;
  type: TransitionType;
  transition_action: TransitionAction | null;
  editor_context: string | null;
}

export interface SnapshotRow {
  id: string;
  project_id: string;
  created_at: string;
  snapshot_data: SnapshotData;
  actor_token: string;
  editor_token: string;
}

export interface SnapshotData {
  project: Project;
  scenes: Scene[];
  transitions: Transition[];
}

const translations: Record<string, string> = {
  // Crew modes
  'solo': 'Самостійна зйомка',
  'with_crew': 'З командою',
  
  // Framing
  'extreme_close_up': 'Детальний',
  'close_up': 'Крупний план',
  'above_waist': 'До пояса',
  'full_body': 'Повний кадр',
  'overhead': 'Зверху',
  'low_angle': 'Знизу',
  
  // Pose
  'standing': 'Стоячи',
  'sitting': 'Сидячи',
  'crouching': 'Навпочіпки',
  'leaning': 'Прислонившись',
  
  // Arm State (matches DB arm_state_enum)
  'arms_at_sides': 'Руки по швах',
  'one_arm_raised': 'Одна рука піднята',
  'holding_object': 'Тримає предмет',
  'pointing': 'Вказує',
  // Legacy snapshot values
  'normal': 'Звичайне',
  
  // Facing
  'toward_camera': 'До камери',
  'away': 'Від камери',
  'profile': 'Профіль',
  'three_quarter': 'Три чверті',
  
  // Camera Motion
  'static': 'Статичний',
  'push_in': 'Наближення',
  'pull_out': 'Віддалення',
  'pan_left': 'Пан вліво',
  'pan_right': 'Пан вправо',
  'tilt_up': 'Наклон вгору',
  'tilt_down': 'Наклон вниз',
  'handheld': 'З руки',
  
  // Shot Size
  'wide': 'Широкий',
  'medium': 'Середній',
  
  // Transition Types
  'hard_cut': 'Різкий перехід',
  'matchcut': 'Збігаючий перехід',
  'jump_cut': 'Стрибковий перехід',
  'whip_pan': 'Швидкий пан',
  'sound_bridge': 'Звуковий міст',
  'dissolve': 'Напівпрозорий перехід',
  
  // Transition Actions
  'no_action': 'Без дії',
  'turn_matchcut': 'Поворот matchcut',
  'through_object': 'Через предмет',
};

export function formatLabel(value: string): string {
  return translations[value] || value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function summarizeFramingFacing(scene: Scene): string {
  return `${formatLabel(scene.framing)} · ${formatLabel(scene.facing)}`;
}

export function summarizeFramingPose(scene: Scene): string {
  return `${formatLabel(scene.framing)} · ${formatLabel(scene.pose)}`;
}

// ── Storytelling types ──

export type VisualType =
  | 'Кольоровий фон'
  | 'Говоряща голова'
  | 'Відео в тему'
  | 'Гарне фото';

export type EngagementType =
  | 'Стікер'
  | 'Тягнулка'
  | 'Опитування'
  | 'Заклик в дірект';

export const VISUAL_OPTIONS: VisualType[] = [
  'Кольоровий фон',
  'Говоряща голова',
  'Відео в тему',
  'Гарне фото',
];

export const ENGAGEMENT_OPTIONS: EngagementType[] = [
  'Стікер',
  'Тягнулка',
  'Опитування',
  'Заклик в дірект',
];

export interface StorytellingProject {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface StorytellingColumn {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  created_at: string;
}

export interface StorytellingStory {
  id: string;
  column_id: string;
  order_index: number;
  text: string;
  visual: VisualType | null;
  engagement: EngagementType | null;
  created_at: string;
}

