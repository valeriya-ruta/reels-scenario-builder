import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getOperatorContext } from '@/lib/pro/operator';

export type BugStatus = 'new' | 'fixed' | 'wontfix';

export type BugReport = {
  id: string;
  comment: string;
  route: string | null;
  edition: string | null;
  bloggerName: string | null;
  element: string | null;
  elementText: string | null;
  viewport: string | null;
  status: BugStatus;
  createdAt: string;
  fixedAt: string | null;
};

type Row = {
  id: string;
  comment: string;
  route: string | null;
  edition: string | null;
  blogger_name: string | null;
  element: string | null;
  element_text: string | null;
  viewport: string | null;
  status: string;
  created_at: string;
  fixed_at: string | null;
};

export async function getBugReports(): Promise<BugReport[]> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pro_bug_reports')
    .select('id,comment,route,edition,blogger_name,element,element_text,viewport,status,created_at,fixed_at')
    .order('created_at', { ascending: false })
    .returns<Row[]>();
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    comment: r.comment,
    route: r.route,
    edition: r.edition,
    bloggerName: r.blogger_name,
    element: r.element,
    elementText: r.element_text,
    viewport: r.viewport,
    status: (['new', 'fixed', 'wontfix'].includes(r.status) ? r.status : 'new') as BugStatus,
    createdAt: r.created_at,
    fixedAt: r.fixed_at,
  }));
}
