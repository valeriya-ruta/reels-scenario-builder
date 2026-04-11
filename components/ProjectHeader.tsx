'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Project } from '@/lib/domain';
import { updateProjectName, createSnapshot } from '@/app/actions';
import ShareModal from './ShareModal';

interface ProjectHeaderProps {
  project: Project;
  onProjectUpdate: (project: Project) => void;
  backHref?: string;
  backLabel?: string;
}

export default function ProjectHeader({
  project,
  onProjectUpdate,
  backHref = '/projects',
  backLabel = 'До всіх сценаріїв',
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
        <div className="mb-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span>{backLabel}</span>
          </Link>
        </div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center">
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
                className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            ) : (
              <h1
                onClick={() => setIsEditingName(true)}
                className="cursor-pointer text-2xl font-semibold text-zinc-900 hover:text-zinc-700 truncate"
                title={project.name}
              >
                {project.name}
              </h1>
            )}
          </div>

          <button
            onClick={handleShare}
            className="cursor-pointer rounded bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-900"
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
