import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';

export default async function ReportIndexPage() {
  const db = createServerClient();
  const { data } = await db
    .from('sites')
    .select('site_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data?.site_id) {
    redirect(`/report/${data.site_id}`);
  } else {
    redirect('/sites');
  }
}
