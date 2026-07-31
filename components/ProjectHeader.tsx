'use client';

import { useState } from 'react';
import { Project } from '@/lib/domain';
import { updateProjectName, createSnapshot } from '@/app/actions';
import ShareModal from './ShareModal';
import EditorTopBar from '@/components/ui/EditorTopBar';
import ScheduleChip from './content/ScheduleChip';
import StatusPill from './content/StatusPill';
import SourceDumpChip from '@/components/braindump/SourceDumpChip';

/**
 * Share is switched OFF for now (§4). Ruta works solo — no teams — so the
 * actor/editor snapshot links have no audience, and the button was sitting in
 * the top-right corner that §1 clears. Everything behind it (createSnapshot,
 * ShareModal, the /share routes) is untouched, so turning it back on is this
 * one flag.
 */
const SHARE_ENABLED = false;

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
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinks, setShareLinks] = useState<{ actor: string; editor: string } | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** Inline rename from the shared top bar; optimistic, reverts on failure. */
  const handleRename = async (next: string) => {
    setErrorMessage(null);
    const previous = project.name;
    onProjectUpdate({ ...project, name: next });
    const result = await updateProjectName(project.id, next);
    if (!result.ok) {
      onProjectUpdate({ ...project, name: previous });
      setErrorMessage(result.error);
      return;
    }
    onProjectUpdate({ ...project, name: result.data.name });
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
      <EditorTopBar
        backHref={backHref}
        backLabel={backLabel}
        title={project.name}
        kind="reel"
        onRename={handleRename}
        meta={
          <>
            <StatusPill refTable="projects" id={project.id} type="reel" initialStatus={project.status ?? 'idea'} />
            <ScheduleChip refTable="projects" id={project.id} initialDate={project.scheduled_date ?? null} />
            <SourceDumpChip contentId={project.id} />
          </>
        }
      />
      {errorMessage && <p className="-mt-2 mb-3 text-sm text-red-600">{errorMessage}</p>}

      {/* Share is HIDDEN (§4): no teams, personal use only, and it occupied the
          top-right corner §1 reserves for nothing. The whole snapshot flow below
          is kept intact so re-enabling is a one-line change, not a rebuild. */}
      {SHARE_ENABLED ? (
        <button type="button" onClick={handleShare} disabled={isSharing} className="app-btn-primary mb-4">
          {isSharing ? 'Створюю…' : 'Поділитися'}
        </button>
      ) : null}

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
