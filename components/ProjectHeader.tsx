'use client';

import { useState } from 'react';
import { Project, Scene } from '@/lib/domain';
import { updateProjectName, createSnapshot } from '@/app/actions';
import ShareModal from './ShareModal';

interface ProjectHeaderProps {
  project: Project;
  onProjectUpdate: (project: Project) => void;
  onScenesUpdate: (scenes: Scene[]) => void;
}

export default function ProjectHeader({
  project,
  onProjectUpdate,
  onScenesUpdate,
}: ProjectHeaderProps) {
  const [name, setName] = useState(project.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinks, setShareLinks] = useState<{ actor: string; editor: string } | null>(null);

  const handleNameBlur = async () => {
    if (name !== project.name && name.trim()) {
      await updateProjectName(project.id, name);
      onProjectUpdate({ ...project, name });
    } else {
      setName(project.name);
    }
    setIsEditingName(false);
  };

  const handleShare = async () => {
    const links = await createSnapshot(project.id);
    if (links) {
      setShareLinks(links);
      setShowShareModal(true);
    }
  };

  return (
    <>
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-4">
          {isEditingName ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleNameBlur();
                }
                if (e.key === 'Escape') {
                  setName(project.name);
                  setIsEditingName(false);
                }
              }}
              autoFocus
              className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          ) : (
            <h1
              onClick={() => setIsEditingName(true)}
              className="cursor-pointer text-2xl font-semibold text-zinc-900 hover:text-zinc-700"
            >
              {project.name}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleShare}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Поділитися
          </button>
        </div>
      </div>

      {showShareModal && shareLinks && (
        <ShareModal
          actorLink={shareLinks.actor}
          editorLink={shareLinks.editor}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
