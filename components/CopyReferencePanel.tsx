'use client';

import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Project, Scene } from '@/lib/domain';
import {
  generateReferenceFromVideoLink,
  importReferenceScenes,
} from '@/app/actions';
import ImportModeDialog from './ImportModeDialog';

interface CopyReferencePanelProps {
  project: Project;
  /** Current scenes in the editor (used for conditional import dialog). */
  existingScenes: Scene[];
  onScenesUpdate: Dispatch<SetStateAction<Scene[]>>;
  onSceneAdded?: (sceneId: string) => void;
}

interface ReferenceResult {
  transcript: string;
  language: string | null;
  scenes: Array<{
    text: string;
    startSec: number;
    endSec: number;
  }>;
}

type ReferenceErrorKind = 'input' | 'content_unavailable' | 'system';

const COPYREF_SYSTEM_ERROR_MESSAGE =
  'Йой, щось пішло не так! Рута вже знає про це і біжить виправляти. Спробуй ще раз через хвилинку.';

function formatDetectedLanguage(code: string): string {
  switch (code.toLowerCase()) {
    case 'uk':
      return 'українська';
    case 'en':
      return 'англійська';
    default:
      return code;
  }
}

function formatSceneTimeRange(startSec: number, endSec: number): string {
  const fmt = (s: number) => s.toFixed(1).replace(/\.0$/, '');
  if (startSec === 0 && endSec === 0) return '';
  return `${fmt(startSec)}–${fmt(endSec)} с`;
}

export default function CopyReferencePanel({
  project,
  existingScenes,
  onScenesUpdate,
  onSceneAdded,
}: CopyReferencePanelProps) {
  const [reelUrl, setReelUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ReferenceErrorKind | null>(null);
  const [result, setResult] = useState<ReferenceResult | null>(null);
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [addingSceneIndex, setAddingSceneIndex] = useState<number | null>(null);

  const canImport = useMemo(
    () => Boolean(result && result.scenes.length > 0),
    [result]
  );

  const handleGenerate = async () => {
    setError(null);
    setErrorKind(null);
    setIsGenerating(true);
    try {
      const response = await generateReferenceFromVideoLink(project.id, reelUrl);
      if (!response.ok) {
        setResult(null);
        setError(response.error);
        setErrorKind(response.errorKind);
        return;
      }
      setResult(response.data);
      setShowFullTranscript(false);
    } catch (err) {
      console.error('Copyref generate failed', err);
      setError(COPYREF_SYSTEM_ERROR_MESSAGE);
      setErrorKind('system');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmImport = async (mode: 'replace' | 'append') => {
    if (!result) return;
    setIsImporting(true);
    setError(null);
    setErrorKind(null);

    try {
      const importedScenes = await importReferenceScenes(
        project.id,
        result.scenes.map((scene) => scene.text),
        mode
      );
      onScenesUpdate(importedScenes);
      setIsModeDialogOpen(false);
    } catch (err) {
      console.error('Copyref import failed', err);
      setError(COPYREF_SYSTEM_ERROR_MESSAGE);
      setErrorKind('system');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportClick = () => {
    if (!result || result.scenes.length === 0) return;
    if (existingScenes.length === 0) {
      void handleConfirmImport('replace');
    } else {
      setIsModeDialogOpen(true);
    }
  };

  const handleAddSingleScene = async (sceneText: string, index: number) => {
    if (!sceneText.trim()) return;
    setAddingSceneIndex(index);
    setError(null);
    setErrorKind(null);
    try {
      const importedScenes = await importReferenceScenes(
        project.id,
        [sceneText],
        'append'
      );
      onScenesUpdate(importedScenes);
      const newestScene = importedScenes[importedScenes.length - 1];
      if (newestScene?.id) {
        onSceneAdded?.(newestScene.id);
      }
    } catch (err) {
      console.error('Copyref add single scene failed', err);
      setError(COPYREF_SYSTEM_ERROR_MESSAGE);
      setErrorKind('system');
    } finally {
      setAddingSceneIndex((current) => (current === index ? null : current));
    }
  };

  return (
    <aside className="min-w-0 rounded-xl border border-[color:var(--border)] bg-white p-5 card-shadow">
      <h2 className="font-display text-base font-semibold text-zinc-900">Скопіюй референс</h2>
      <p className="mt-1 text-sm leading-normal text-zinc-600">
        Встав публічний Instagram Reel або TikTok, отримай транскрипт і заготовку сцен.
      </p>

      <div className="mt-5">
        <label htmlFor="copyref-url" className="mb-1 block text-xs font-medium leading-normal text-zinc-600">
          Посилання на Reel / TikTok
        </label>
        <input
          id="copyref-url"
          type="url"
          value={reelUrl}
          onChange={(e) => setReelUrl(e.target.value)}
          placeholder="Instagram або TikTok URL…"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm leading-normal text-zinc-900 transition-colors focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isGenerating || !reelUrl.trim()}
        className="btn-primary mt-4 w-full rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-[background,transform] hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:brightness-100"
      >
        {isGenerating ? 'Обробляю...' : 'Отримати референс'}
      </button>

      {error && (
        <div
          className={[
            'mt-4 rounded-lg px-3 py-2 text-sm leading-normal',
            errorKind === 'system'
              ? 'border border-zinc-200 bg-zinc-50 text-zinc-700'
              : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
          ].join(' ')}
        >
          {error}
          {errorKind === 'system' ? (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating || !reelUrl.trim()}
              className="mt-2 inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Спробувати ще раз
            </button>
          ) : null}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium leading-normal text-zinc-800">
                Референс по сценах ({result.scenes.length})
              </h3>
              {result.language && (
                <span className="text-xs leading-normal text-zinc-600">
                  Мова: {formatDetectedLanguage(result.language)}
                </span>
              )}
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]/50 p-2">
              {result.scenes.map((scene, index) => {
                const timeLabel = formatSceneTimeRange(scene.startSec, scene.endSec);
                const isAddingThisScene = addingSceneIndex === index;
                return (
                  <button
                    type="button"
                    key={`${index}-${scene.startSec}-${scene.endSec}`}
                    onClick={() => void handleAddSingleScene(scene.text, index)}
                    disabled={isImporting || addingSceneIndex !== null}
                    className="group w-full cursor-pointer rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                    title="Додати цю сцену в кінець списку"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xs text-zinc-600">
                      <span className="font-medium uppercase tracking-wide text-zinc-700">
                        Сцена {index + 1}
                      </span>
                      {timeLabel ? <span>{timeLabel}</span> : null}
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap text-sm leading-normal text-zinc-800">{scene.text}</p>
                      <span
                        className={[
                          'mt-0.5 shrink-0 transition-opacity',
                          isAddingThisScene ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        ].join(' ')}
                        aria-hidden="true"
                      >
                        <img
                          src="/icons/subdirectory_arrow_right.svg"
                          alt=""
                          className="h-4 w-4"
                        />
                      </span>
                    </div>
                    {isAddingThisScene && (
                      <p className="mt-2 text-xs font-medium text-zinc-600">Додаю сцену...</p>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowFullTranscript((v) => !v)}
              className="mt-3 text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              {showFullTranscript ? 'Сховати повний транскрипт' : 'Показати повний транскрипт'}
            </button>
            {showFullTranscript && (
              <div className="mt-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Транскрипт</p>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-normal text-zinc-700">
                  {result.transcript}
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm leading-normal text-zinc-600">
              Знайдено сцен: <span className="font-semibold text-zinc-900">{result.scenes.length}</span>
            </p>
            <button
              type="button"
              disabled={!canImport || isImporting}
              onClick={handleImportClick}
              className="mt-4 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-medium leading-normal text-zinc-900 transition-colors hover:border-[color:var(--accent)]/35 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImporting ? 'Імпортую...' : 'Додати сцени'}
            </button>
          </div>
        </div>
      )}

      <ImportModeDialog
        open={isModeDialogOpen}
        onClose={() => setIsModeDialogOpen(false)}
        onConfirm={handleConfirmImport}
        disabled={isImporting}
      />
    </aside>
  );
}
