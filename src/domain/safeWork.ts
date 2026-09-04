import type { AttemptKind, ResultState } from './academic';

export type SafeWorkStatus = 'PENDING_SAFE' | 'FAILED' | 'CONFLICT';
export type UiWorkState = 'TRANSIENT' | SafeWorkStatus | 'SAVED';

export type StudentRenamePayload = { display_name: string };
export type AssessmentJudgementPayload = {
  assessment_id:string;
  enrollment_id:string;
  state:ResultState;
  score:number|null;
  attempt_kind:AttemptKind|null;
  raw_score:number|null;
  evidence:Record<string,unknown>;
};

export type AssessmentConflictSnapshot = {
  canonical_state:ResultState|null;
  canonical_score:number|null;
  canonical_revision:number;
};

export type PendingOperation = {
  op_id:string;
  auth_user_id:string;
  workspace_id:string;
  entity_type:'student'|'assessment_result';
  entity_id:string;
  causal_key:string;
  operation_kind:'student.rename'|'assessment.judgement';
  payload:StudentRenamePayload|AssessmentJudgementPayload;
  created_at:string;
  attempt_count:number;
  last_attempt_at:string|null;
  status:SafeWorkStatus;
  expected_revision:number;
  last_error_code:string|null;
  conflict_snapshot?:AssessmentConflictSnapshot|null;
};

export type SyncResult =
  | { kind:'saved'; revision:number; replayed:boolean }
  | { kind:'conflict'; revision:number; canonical?:{state:ResultState|null;score:number|null} }
  | { kind:'retryable'; code:string }
  | { kind:'failed'; code:string };
