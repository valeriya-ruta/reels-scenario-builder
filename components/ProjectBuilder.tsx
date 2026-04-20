'use client';

import { useEffect, useState } from 'react';
import { Location, Project, Scene } from '@/lib/domain';
import { markProjectScenarioSeen } from '@/app/actions';
import { readPendingReelProjectIdFromStorage, useRantResults } from '@/components/RantResultsContext';
import ProjectHeader from './ProjectHeader';
import SceneList from './SceneList';
import CopyReferencePanel from './CopyReferencePanel';

interface ProjectBuilderProps {
  project: Project;
  initialScenes: Scene[];
  initialLocations: Location[];
  backHref?: string;
  backLabel?: string;
}

export default function ProjectBuilder({
  project: initialProject,
  initialScenes,
  initialLocations,
  backHref,
  backLabel,
}: ProjectBuilderProps) {
  const { state, clearResult } = useRantResults();
  const [project, setProject] = useState(initialProject);
  const [scenes, setScenes] = useState(initialScenes);
  const [locations, setLocations] = useState(initialLocations);
  const [focusSceneId, setFocusSceneId] = useState<string | null>(null);

  useEffect(() => {
    const pending =
      state.reelsProjectId ?? readPendingReelProjectIdFromStorage();
    if (!pending || pending !== initialProject.id) return;
    clearResult('reels');
  }, [initialProject.id, state.reelsProjectId, clearResult]);

  useEffect(() => {
    if (!initialProject.scenario_unseen) return;
    void markProjectScenarioSeen(initialProject.id);
    setProject((p) => ({ ...p, scenario_unseen: false }));
  }, [initialProject.id, initialProject.scenario_unseen]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ProjectHeader
          project={project}
          onProjectUpdate={setProject}
          backHref={backHref}
          backLabel={backLabel}
        />
        {project.project_type === 'reels' && project.reference_url ? (
          <div className="mb-6 rounded-lg border border-zinc-200/90 bg-zinc-50/90 px-4 py-3 text-[13px] leading-snug text-zinc-600">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span aria-hidden className="text-zinc-500">
                📎
              </span>
              <span className="text-zinc-500">Референс:</span>
              <a
                href={project.reference_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[color:var(--accent)] underline-offset-2 hover:underline"
              >
                відкрити в Instagram →
              </a>
            </div>
            {project.reference_note?.trim() ? (
              <p className="mt-2 text-[13px] text-zinc-600">{project.reference_note.trim()}</p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-10">
          <div className="lg:col-span-7">
            <SceneList
              project={project}
              scenes={scenes}
              onScenesUpdate={setScenes}
              locations={locations}
              onLocationsChange={setLocations}
              focusSceneId={focusSceneId}
              onFocusHandled={() => setFocusSceneId(null)}
            />
          </div>
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-6">
              <CopyReferencePanel
                project={project}
                existingScenes={scenes}
                onScenesUpdate={setScenes}
                onSceneAdded={setFocusSceneId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
