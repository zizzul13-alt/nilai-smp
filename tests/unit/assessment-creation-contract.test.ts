import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicClass } from '../../src/domain/academic';
import { createAssessment } from '../../src/services/academic/assessmentCore';
import fs from 'node:fs';

const ui = fs.readFileSync('src/components/AssessmentManager.tsx', 'utf8');
const app = fs.readFileSync('src/app/App.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202609040004_assessment_core.sql', 'utf8');

describe('R3.3 assessment usability closure', () => {
  it('creates Assessment from stable class/period context under the current workspace', async () => {
    const inserted: Record<string, unknown>[] = [];
    const created = {
      id: 'assessment-1', workspace_id: 'w', class_id: 'c', academic_period_id: 'p',
      activity_id: null, scoring_profile_id: null, title: 'Kuis Bab 2', description: null,
      instructions: null, status: 'active', created_at: '', updated_at: '',
    };
    const client = ({
      from: (table: string) => {
        expect(table).toBe('assessments');
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return {
              select: () => ({
                single: async () => ({ data: created, error: null }),
              }),
            };
          },
        };
      },
    }) as unknown as SupabaseClient;
    const academicClass = {
      id: 'c', workspace_id: 'w', academic_period_id: 'p', identity_key: '8a', display_name: 'VIII A', status: 'active',
    } as AcademicClass;

    const result = await createAssessment(client, 'w', { academicClass, title: '  Kuis Bab 2  ' });

    expect(result.id).toBe('assessment-1');
    expect(inserted).toEqual([expect.objectContaining({
      workspace_id: 'w', class_id: 'c', academic_period_id: 'p', title: 'Kuis Bab 2', status: 'active',
    })]);
  });

  it('fails before write when class belongs to another workspace or title is blank', async () => {
    let writes = 0;
    const client = ({ from: () => { writes += 1; return {}; } }) as unknown as SupabaseClient;
    const foreignClass = {
      id: 'c', workspace_id: 'foreign', academic_period_id: 'p', identity_key: '8a', display_name: 'VIII A', status: 'active',
    } as AcademicClass;

    await expect(createAssessment(client, 'w', { academicClass: foreignClass, title: 'Kuis' })).rejects.toThrow('workspace aktif');
    await expect(createAssessment(client, 'w', { academicClass: { ...foreignClass, workspace_id: 'w' }, title: '   ' })).rejects.toThrow('Judul Assessment wajib');
    expect(writes).toBe(0);
  });

  it('exposes Assessment creation before correction/bulk workflows without adding new schema semantics', () => {
    expect(ui).toContain('Buat Assessment');
    expect(ui).toContain('loadAssessmentCreationContext');
    expect(ui).toContain('createAssessment(client, workspaceId');
    expect(app).toContain("'assessments' | 'rapid' | 'bulk'");
    expect(app).toContain('<AssessmentManager');
    expect(migration).toContain('create table public.assessments');
    expect(migration).toContain('assessment_owner_all');
  });
});
