import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity, Checkpoint, Lesson, LessonVersion, Material, Meeting } from '../../domain/academic';

export type TeachingCoreContext = {
  materials: Material[];
  lessons: Lesson[];
  lessonVersions: LessonVersion[];
  meetings: Meeting[];
  checkpoints: Checkpoint[];
  activities: Activity[];
};

/**
 * Minimal diagnostic/read boundary for the canonical Teaching Core.
 * workspaceId is a query key only; PostgreSQL RLS remains authorization.
 */
export async function loadOwnedTeachingCore(client: SupabaseClient, workspaceId: string): Promise<TeachingCoreContext> {
  const tables = ['materials','lessons','lesson_versions','meetings','checkpoints','activities'] as const;
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    const { data, error } = await client.from(table).select('*').eq('workspace_id', workspaceId);
    if (error) throw new Error(`Teaching core load failed for ${table}: ${error.message}`);
    rows[table] = data ?? [];
  }
  return {
    materials: rows.materials as Material[], lessons: rows.lessons as Lesson[],
    lessonVersions: rows.lesson_versions as LessonVersion[], meetings: rows.meetings as Meeting[],
    checkpoints: rows.checkpoints as Checkpoint[], activities: rows.activities as Activity[],
  };
}
