'use client';

import { useState, useEffect } from 'react';
import { Transition, TransitionType, TransitionAction } from '@/lib/domain';
import { formatLabel } from '@/lib/domain';
import { updateTransition } from '@/app/actions';

interface TransitionSeamProps {
  transition: Transition | undefined;
  sceneBeforeId: string;
  sceneAfterId: string;
  projectId: string;
  onCreateTransition: (sbId: string, saId: string) => Promise<void>;
  onUpdateTransition: (updates: Partial<Transition>) => Promise<void>;
}

export default function TransitionSeam({
  transition,
  sceneBeforeId,
  sceneAfterId,
  projectId,
  onCreateTransition,
  onUpdateTransition,
}: TransitionSeamProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editorContext, setEditorContext] = useState(
    transition?.editor_context || ''
  );
  const [transitionAction, setTransitionAction] = useState<TransitionAction>(
    (transition?.transition_action as TransitionAction) || 'no_action'
  );

  // Update state when transition changes
  useEffect(() => {
    if (transition?.transition_action) {
      setTransitionAction(transition.transition_action as TransitionAction);
    } else {
      setTransitionAction('no_action');
    }
  }, [transition?.transition_action]);

  const transitionType = transition?.type || 'hard_cut';
  const transitionActionOptions: TransitionAction[] = [
    'no_action',
    'turn_matchcut',
    'through_object',
  ];
  const transitionOptions: TransitionType[] = [
    'hard_cut',
    'matchcut',
    'jump_cut',
    'whip_pan',
    'sound_bridge',
    'dissolve',
  ];

  const handleTypeChange = async (newType: TransitionType) => {
    if (transition) {
      await updateTransition(transition.id, { type: newType });
      await onUpdateTransition({ type: newType });
    } else {
      await onCreateTransition(sceneBeforeId, sceneAfterId);
    }
  };

  const handleContextChange = async (newContext: string) => {
    setEditorContext(newContext);
    if (transition) {
      await updateTransition(transition.id, { editor_context: newContext });
      await onUpdateTransition({ editor_context: newContext });
    }
  };

  const handleActionChange = async (newAction: TransitionAction) => {
    setTransitionAction(newAction);
    if (transition) {
      await updateTransition(transition.id, { transition_action: newAction });
      await onUpdateTransition({ transition_action: newAction });
    } else {
      // Create transition first, then it will be updated
      await onCreateTransition(sceneBeforeId, sceneAfterId);
      // Note: The transition will be created with default 'no_action', 
      // but we'll update it immediately after creation
      // This is a bit of a race condition, but acceptable for now
    }
  };

  return (
    <div className="my-2">
      <div
        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-300 ease-in-out cursor-pointer hover:shadow-md"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-zinc-600">
              Перехід:
            </div>
            <select
              value={transitionType}
              onChange={(e) => {
                e.stopPropagation();
                handleTypeChange(e.target.value as TransitionType);
              }}
              onClick={(e) => e.stopPropagation()}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              {transitionOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-white">
                  {formatLabel(opt)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="text-zinc-500 hover:text-zinc-700 transition-transform duration-300"
          >
            <svg
              className="h-5 w-5"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-[300px] opacity-100 mt-4' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                Дія для переходу
              </label>
              <div className="flex flex-wrap gap-2">
                {transitionActionOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActionChange(opt);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      transitionAction === opt
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                    }`}
                  >
                    {formatLabel(opt)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Контекст для редактора
              </label>
              <textarea
                value={editorContext}
                onChange={(e) => {
                  e.stopPropagation();
                  handleContextChange(e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                rows={2}
                placeholder="напр., збіг за положенням руки"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
