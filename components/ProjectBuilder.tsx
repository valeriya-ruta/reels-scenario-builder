'use client';

import { useState } from 'react';
import { Location, Project, Scene } from '@/lib/domain';
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
  const [project, setProject] = useState(initialProject);
  const [scenes, setScenes] = useState(initialScenes);
  const [locations, setLocations] = useState(initialLocations);
  const [focusSceneId, setFocusSceneId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ProjectHeader
          project={project}
          onProjectUpdate={setProject}
          backHref={backHref}
          backLabel={backLabel}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
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
          <div className="lg:col-span-2">
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
