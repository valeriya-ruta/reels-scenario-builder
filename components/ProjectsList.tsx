import Link from 'next/link';
import { Project } from '@/lib/domain';
import { formatLabel } from '@/lib/domain';

interface ProjectsListProps {
  projects: Project[];
}

export default function ProjectsList({ projects }: ProjectsListProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-600">
        <p>Поки що немає проєктів. Створіть свій перший проєкт, щоб почати.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/project/${project.id}`}
          className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-zinc-900">{project.name}</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Оновлено{' '}
                {new Date(project.updated_at).toLocaleDateString('uk-UA')}
              </p>
            </div>
            <svg
              className="h-5 w-5 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}
