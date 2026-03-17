'use client';

import { useState, useEffect } from 'react';
import { Project, Scene, Transition } from '@/lib/domain';
import ProjectHeader from './ProjectHeader';
import SceneList from './SceneList';

interface ProjectBuilderProps {
  project: Project;
  initialScenes: Scene[];
  initialTransitions: Transition[];
}

export default function ProjectBuilder({
  project: initialProject,
  initialScenes,
  initialTransitions,
}: ProjectBuilderProps) {
  const [project, setProject] = useState(initialProject);
  const [scenes, setScenes] = useState(initialScenes);
  const [transitions, setTransitions] = useState(initialTransitions);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ProjectHeader
          project={project}
          onProjectUpdate={setProject}
          onScenesUpdate={setScenes}
        />
        <SceneList
          project={project}
          scenes={scenes}
          transitions={transitions}
          onScenesUpdate={setScenes}
          onTransitionsUpdate={setTransitions}
        />
      </div>
    </div>
  );
}
