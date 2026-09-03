export type AcademicLifecycle = 'planned' | 'active' | 'archived';
export type ClassLifecycle = 'active' | 'archived';
export type StudentLifecycle = 'active' | 'archived';
export type EnrollmentLifecycle = 'active' | 'withdrawn' | 'completed' | 'archived';

export interface Workspace {
  id: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AcademicYear {
  id: string;
  workspace_id: string;
  identity_key: string;
  display_name: string;
  sort_order: number;
  status: AcademicLifecycle;
  starts_on: string | null;
  ends_on: string | null;
}

export interface AcademicPeriod {
  id: string;
  workspace_id: string;
  academic_year_id: string;
  identity_key: string;
  display_name: string;
  sort_order: number;
  status: AcademicLifecycle;
  starts_on: string | null;
  ends_on: string | null;
}

export interface AcademicClass {
  id: string;
  workspace_id: string;
  academic_period_id: string;
  identity_key: string;
  display_name: string;
  status: ClassLifecycle;
}

export interface Student {
  id: string;
  workspace_id: string;
  display_name: string;
  nis: string | null;
  nisn: string | null;
  status: StudentLifecycle;
}

export interface Enrollment {
  id: string;
  workspace_id: string;
  student_id: string;
  class_id: string;
  status: EnrollmentLifecycle;
  started_on: string | null;
  ended_on: string | null;
}
