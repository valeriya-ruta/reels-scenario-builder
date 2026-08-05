import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getOperatorContext } from '@/lib/pro/operator';
import { listProProjects } from '@/lib/pro/projects';
import type { ProProject } from '@/lib/pro/types';
import type { ContentStatus, ContentType } from '@/lib/content/statusSystem';

export type DashboardPiece = {
  id: string;
  projectId: string;
  type: ContentType;
  refTable: 'carousel_projects' | 'projects' | 'storytelling_projects' | 'ideas';
  status: ContentStatus;
  title: string;
  scheduledDate: string | null;
  updatedAt: string;
};

export type DashboardData = {
  projects: ProProject[];
  pieces: DashboardPiece[];
};

type Row = {
  id: string;
  project_id: string | null;
  content_type: ContentType;
  ref_table: DashboardPiece['refTable'];
  status: ContentStatus;
  title: string | null;
  scheduled_date: string | null;
  updated_at: string;
};

/**
 * Everything the aggregated dashboard needs: every blogger, plus every content
 * piece that belongs to a blogger (project_id NOT NULL), tagged with its project.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return { projects: [], pieces: [] };

  const supabase = await createServerSupabaseClient();
  const [projects, piecesRes] = await Promise.all([
    listProProjects(),
    supabase
      .from('pro_content_pieces')
      .select('id,project_id,content_type,ref_table,status,title,scheduled_date,updated_at')
      .not('project_id', 'is', null)
      .order('updated_at', { ascending: false })
      .returns<Row[]>(),
  ]);

  const pieces: DashboardPiece[] = (piecesRes.data ?? [])
    .filter((r) => r.project_id)
    .map((r) => ({
      id: r.id,
      projectId: r.project_id as string,
      type: r.content_type,
      refTable: r.ref_table,
      status: r.status,
      title: (r.title ?? '').trim() || 'Без назви',
      scheduledDate: r.scheduled_date,
      updatedAt: r.updated_at,
    }));

  return { projects, pieces };
}
