import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assessment, Attempt, Result, ScoringProfile } from '../../domain/academic';

export type AssessmentCoreContext = {
  scoringProfiles: ScoringProfile[];
  assessments: Assessment[];
  results: Result[];
  attempts: Attempt[];
};

/** Read boundary only. workspaceId is a query key; PostgreSQL RLS is authorization. */
export async function loadOwnedAssessmentCore(client: SupabaseClient, workspaceId: string): Promise<AssessmentCoreContext> {
  const tables = ['scoring_profiles','assessments','assessment_results','assessment_attempts'] as const;
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    const { data, error } = await client.from(table).select('*').eq('workspace_id', workspaceId);
    if (error) throw new Error(`Assessment core load failed for ${table}: ${error.message}`);
    rows[table] = data ?? [];
  }
  return {
    scoringProfiles: rows.scoring_profiles as ScoringProfile[],
    assessments: rows.assessments as Assessment[],
    results: rows.assessment_results as Result[],
    attempts: rows.assessment_attempts as Attempt[],
  };
}

export type RecordAssessmentJudgementInput = {
  assessmentId: string;
  enrollmentId: string;
  state: Result['state'];
  score?: number | null;
  attemptKind?: Attempt['attempt_kind'] | null;
  rawScore?: number | null;
  evidence?: Record<string, unknown>;
};

/** Atomic server-canonical Result + optional Attempt write. This is not Safe Work-enabled. */
export async function recordAssessmentJudgement(client: SupabaseClient, input: RecordAssessmentJudgementInput) {
  const { data, error } = await client.rpc('record_assessment_judgement', {
    p_assessment_id: input.assessmentId,
    p_enrollment_id: input.enrollmentId,
    p_state: input.state,
    p_score: input.score ?? null,
    p_attempt_kind: input.attemptKind ?? null,
    p_raw_score: input.rawScore ?? null,
    p_evidence: input.evidence ?? {},
  });
  if (error) throw new Error(`Assessment judgement failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Assessment judgement returned no result.');
  return row as { result_id:string; attempt_id:string|null; state:Result['state']; score:number|null };
}
