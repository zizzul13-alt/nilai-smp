export type AcademicLifecycle = 'planned' | 'active' | 'archived';
export type ClassLifecycle = 'active' | 'archived';
export type StudentLifecycle = 'active' | 'archived';
export type EnrollmentLifecycle = 'active' | 'withdrawn' | 'completed' | 'archived';
export type TeachingLifecycle = 'active' | 'archived';
export type MeetingLifecycle = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
export type ActivityLifecycle = 'planned' | 'active' | 'completed' | 'archived';

export interface Workspace { id:string; owner_user_id:string; created_at:string; updated_at:string; }
export interface AcademicYear { id:string; workspace_id:string; identity_key:string; display_name:string; sort_order:number; status:AcademicLifecycle; starts_on:string|null; ends_on:string|null; }
export interface AcademicPeriod { id:string; workspace_id:string; academic_year_id:string; identity_key:string; display_name:string; sort_order:number; status:AcademicLifecycle; starts_on:string|null; ends_on:string|null; }
export interface AcademicClass { id:string; workspace_id:string; academic_period_id:string; identity_key:string; display_name:string; status:ClassLifecycle; }
export interface Student { id:string; workspace_id:string; display_name:string; nis:string|null; nisn:string|null; status:StudentLifecycle; }
export interface Enrollment { id:string; workspace_id:string; student_id:string; class_id:string; status:EnrollmentLifecycle; started_on:string|null; ended_on:string|null; }

export interface Material { id:string; workspace_id:string; title:string; status:TeachingLifecycle; }
export interface Lesson { id:string; workspace_id:string; material_id:string; title:string; status:TeachingLifecycle; }
export interface LessonVersion { id:string; workspace_id:string; lesson_id:string; version_number:number; content_text:string; created_at:string; }
export interface Meeting { id:string; workspace_id:string; class_id:string; lesson_id:string|null; lesson_version_id:string|null; occurred_at:string; status:MeetingLifecycle; }
export interface Checkpoint { id:string; workspace_id:string; meeting_id:string; sequence_no:number; stopped_at:string; next_step:string|null; recorded_at:string; }
export interface Activity { id:string; workspace_id:string; class_id:string; title:string; status:ActivityLifecycle; }
export interface ActivityMeeting { id:string; workspace_id:string; class_id:string; activity_id:string; meeting_id:string; created_at:string; }
