'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Project, Scene, Framing, ArmState, CameraMotion, ShotSize, TransitionAction } from '@/lib/domain';
import { formatLabel } from '@/lib/domain';
import { updateScene } from '@/app/actions';

interface SceneCardProps {
  scene: Scene;
  project: Project;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<Scene>) => void;
  onDelete: () => void;
}

export default function SceneCard({
  scene,
  project,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
}: SceneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(scene.name || '');

  const defaultName = `Сцена ${scene.order_index + 1}`;

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = nameValue.trim();
    onUpdate({ name: trimmed || null });
    updateScene(scene.id, { name: trimmed || null });
  };

  const firstLine = scene.lines?.split('\n')[0] || 'Немає діалогу';
  const truncatedLine =
    firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[data-drag-handle]')
    ) {
      return;
    }
    onToggleExpand();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-300 ease-in-out cursor-pointer hover:shadow-md"
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div
            {...attributes}
            {...listeners}
            data-drag-handle
            className="cursor-grab text-zinc-500 hover:text-zinc-600"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') {
                      setNameValue(scene.name || '');
                      setIsEditingName(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={defaultName}
                  className="text-sm font-medium text-zinc-600 bg-transparent border-b border-zinc-400 outline-none w-32 placeholder-zinc-400"
                />
              ) : (
                <span
                  className="text-sm font-medium text-zinc-600 cursor-text hover:text-zinc-900 hover:underline decoration-dashed underline-offset-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                  }}
                  title="Натисніть, щоб перейменувати"
                >
                  {scene.name || defaultName}
                </span>
              )}
              <span className="text-zinc-400">•</span>
              <span className="text-sm text-zinc-500">
                {formatLabel(scene.framing)}
              </span>
            </div>
            {!isExpanded && (
              <p className="mt-1 text-sm text-zinc-700">{truncatedLine}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="text-zinc-500 hover:text-zinc-700 transition-transform duration-300"
          >
            <svg
              className="h-5 w-5"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-600 mr-1">Видалити?</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded px-2 py-0.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Так
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
                className="rounded px-2 py-0.5 text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
              >
                Ні
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              className="text-zinc-400 hover:text-red-500 transition-colors"
              title="Видалити сцену"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Текст</label>
          <textarea
            value={scene.lines || ''}
            onChange={(e) => {
              onUpdate({ lines: e.target.value });
              updateScene(scene.id, { lines: e.target.value });
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            rows={3}
            placeholder="Діалог або голос за кадром..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ChipSelector
            label="Кадрування"
            value={scene.framing}
            options={[
              'extreme_close_up',
              'close_up',
              'above_waist',
              'full_body',
              'overhead',
              'low_angle',
            ]}
            onChange={(value) => {
              onUpdate({ framing: value as Framing });
              updateScene(scene.id, { framing: value as Framing });
            }}
          />

          <ChipSelector
            label="Положення рук"
            value={scene.arm_state}
            options={[
              'normal',
              'holding_object',
              'pointing',
            ]}
            onChange={(value) => {
              onUpdate({ arm_state: value as ArmState });
              updateScene(scene.id, { arm_state: value as ArmState });
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ChipSelector
            label="Рух камери"
            value={scene.camera_motion || 'static'}
            options={[
              'static',
              'push_in',
              'pull_out',
              'pan_left',
              'pan_right',
              'tilt_up',
              'tilt_down',
              'handheld',
            ]}
            onChange={(value) => {
              onUpdate({ camera_motion: value as CameraMotion });
              updateScene(scene.id, { camera_motion: value as CameraMotion });
            }}
          />

          <ChipSelector
            label="Розмір кадру"
            value={scene.shot_size || 'medium'}
            options={['wide', 'medium', 'close_up', 'extreme_close_up']}
            onChange={(value) => {
              onUpdate({ shot_size: value as ShotSize });
              updateScene(scene.id, { shot_size: value as ShotSize });
            }}
          />
        </div>

        <div>
          <ChipSelector
            label="Дія для переходу"
            value={scene.scene_transition_action || 'no_action'}
            options={['no_action', 'turn_matchcut', 'through_object']}
            onChange={(value) => {
              onUpdate({ scene_transition_action: value as TransitionAction });
              updateScene(scene.id, { scene_transition_action: value as TransitionAction });
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Примітка для актора
          </label>
          <textarea
            value={scene.actor_note || ''}
            onChange={(e) => {
              onUpdate({ actor_note: e.target.value });
              updateScene(scene.id, { actor_note: e.target.value });
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            rows={2}
            placeholder="Примітка для актора..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Примітка для редактора
          </label>
          <textarea
            value={scene.editor_note || ''}
            onChange={(e) => {
              onUpdate({ editor_note: e.target.value });
              updateScene(scene.id, { editor_note: e.target.value });
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            rows={2}
            placeholder="Примітка для редактора..."
          />
        </div>

        </div>
      </div>
    </div>
  );
}

function ChipSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-zinc-600">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(option);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              value === option
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
            }`}
          >
            {formatLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
