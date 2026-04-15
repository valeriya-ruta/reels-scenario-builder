'use client';

import { useEffect, useState } from 'react';
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
  const [isSharing, setIsSharing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(project.name);
  }, [project.name]);

  const handleNameBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(project.name);
      setIsEditingName(false);
      return;
    }

    if (trimmed === project.name) {
      setName(project.name);
      setIsEditingName(false);
      return;
    }

    setErrorMessage(null);
    const result = await updateProjectName(project.id, trimmed);
    if (result.ok) {
      onProjectUpdate({ ...project, name: result.data.name });
      setName(result.data.name);
    } else {
      setName(project.name);
      setErrorMessage(result.error);
    }
    setIsEditingName(false);
  };

  const handleShare = async () => {
    if (isSharing) return;

    setErrorMessage(null);
    setIsSharing(true);
    try {
      const result = await createSnapshot(project.id);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setShareLinks(result.data);
      setShowShareModal(true);
    } catch {
      setErrorMessage('Не вдалося створити посилання для шерингу.');
    } finally {
      setIsSharing(false);
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
                className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
              />
            ) : (
              <h1
                onClick={() => setIsEditingName(true)}
                className="font-display cursor-pointer truncate text-2xl font-semibold text-zinc-900 hover:text-zinc-700"
                title={project.name}
              >
                {project.name}
              </h1>
            )}
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="btn-primary shrink-0 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition-[background,transform] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSharing ? 'Створюю посилання...' : 'Поділитися'}
          </button>
        </div>
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
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
