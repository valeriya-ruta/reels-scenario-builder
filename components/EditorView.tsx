'use client';

import { SnapshotData, formatLabel } from '@/lib/domain';

interface EditorViewProps {
  snapshotData: SnapshotData;
}

export default function EditorView({ snapshotData }: EditorViewProps) {
  // Build transition map with full transition objects
  const transitionMap = new Map<string, typeof snapshotData.transitions[0]>();
  snapshotData.transitions.forEach((t) => {
    transitionMap.set(`${t.scene_before_id}-${t.scene_after_id}`, t);
  });

  return (
    <div className="space-y-6">
      {snapshotData.scenes.map((scene, index) => {
        const nextScene = snapshotData.scenes[index + 1];
        const transition = nextScene
          ? transitionMap.get(`${scene.id}-${nextScene.id}`)
          : null;

        return (
          <div key={scene.id} className="space-y-4">
            {/* Scene Card - Minimal */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-600">
                  Сцена {scene.order_index + 1}
                </span>
                {scene.camera_motion && (
                  <>
                    <span className="text-zinc-400">•</span>
                    <span className="text-xs text-zinc-500">
                      {formatLabel(scene.camera_motion)}
                    </span>
                  </>
                )}
                {scene.shot_size && (
                  <>
                    <span className="text-zinc-400">•</span>
                    <span className="text-xs text-zinc-500">
                      {formatLabel(scene.shot_size)}
                    </span>
                  </>
                )}
              </div>
              <p className="mb-2 text-sm text-zinc-700">
                {scene.lines || 'Немає діалогу'}
              </p>
              {scene.editor_note && (
                <div className="rounded bg-zinc-50 p-2 border border-zinc-200">
                  <p className="text-xs font-medium text-zinc-600">Примітка для редактора</p>
                  <p className="mt-1 text-sm text-zinc-700">{scene.editor_note}</p>
                </div>
              )}
            </div>

            {/* Transition Seam - Prominent */}
            {transition && (
              <div className="rounded-lg border-2 border-zinc-300 bg-zinc-50 p-4 shadow-sm">
                <div className="text-center">
                  <p className="text-lg font-semibold text-zinc-900">
                    {formatLabel(transition.type)}
                  </p>
                  {transition.editor_context && (
                    <p className="mt-2 text-sm text-zinc-600">
                      {transition.editor_context}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
