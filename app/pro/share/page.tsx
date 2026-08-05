import { redirect } from 'next/navigation';
import { getOperatorContext } from '@/lib/pro/operator';
import { getProScope } from '@/lib/pro/scope';
import { getProProject } from '@/lib/pro/projects';
import { getShareLinkForProject } from '@/lib/pro/share';
import ProShareManager from '@/components/pro/ProShareManager';

export const dynamic = 'force-dynamic';

/**
 * Operator surface to create/copy/regenerate the client review link for the
 * currently-pinned blogger, and to see the approvals coming back.
 */
export default async function ProSharePage() {
  const { user, isOperator } = await getOperatorContext();
  if (!user) redirect('/');
  if (!isOperator) redirect('/dashboard');

  const scope = await getProScope();
  if (scope.kind !== 'project') {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center md:px-8">
        <h1 className="text-xl font-semibold text-zinc-900">Обери блогера</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Клієнтський лінк створюється для конкретного блогера. Виберіть блогера у верхньому
          перемикачі, а потім поверніться сюди.
        </p>
      </div>
    );
  }

  const [project, link] = await Promise.all([
    getProProject(scope.projectId),
    getShareLinkForProject(scope.projectId),
  ]);

  return (
    <ProShareManager
      projectId={scope.projectId}
      projectName={project?.name ?? 'Блогер'}
      projectColor={project?.color ?? '#6366f1'}
      initialToken={link?.token ?? null}
      ideas={link?.ideas ?? []}
      decisions={link?.decisions ?? {}}
    />
  );
}
