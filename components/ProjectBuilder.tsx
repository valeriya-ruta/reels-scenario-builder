'use client';

import { useState } from 'react';
import { Location, Project, Scene } from '@/lib/domain';
import ProjectHeader from './ProjectHeader';
import SceneList from './SceneList';

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

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ProjectHeader
          project={project}
          onProjectUpdate={setProject}
          onScenesUpdate={setScenes}
          backHref={backHref}
          backLabel={backLabel}
        />
        <SceneList
          project={project}
          scenes={scenes}
          onScenesUpdate={setScenes}
          locations={locations}
          onLocationsChange={setLocations}
        />
      </div>
    </div>
  );
}
