import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';

const assessments=readFileSync('src/components/AssessmentManager.tsx','utf8');
const rapid=readFileSync('src/components/RapidCorrection.tsx','utf8');

describe('F3 bounded search/filter contracts',()=>{
  it('filters assessments locally by title/class while retaining canonical assessment identity',()=>{
    expect(assessments).toContain("filterClassId==='ALL'||row.class_id===filterClassId");
    expect(assessments).toContain("row.title.toLocaleLowerCase('id-ID').includes(q)");
    expect(assessments).toContain('data-assessment-id={row.id}');
    expect(assessments).not.toContain('createAssessment(client,workspaceId,{academicClass:filter');
  });

  it('retains existing correction-local student search whose target remains enrollment id',()=>{
    expect(rapid).toContain('searchCorrectionStudents(ctx,query)');
    expect(rapid).toContain('Cari pemilik kertas');
    expect(rapid).toContain('selectEnrollment(enrollment.id)');
  });

  it('does not introduce generic global-search or fuzzy mutation plumbing',()=>{
    const lower=assessments.toLowerCase();
    expect(lower).not.toContain('global search');
    expect(lower).not.toContain('omnibox');
    expect(lower).not.toContain('levenshtein');
    expect(lower).not.toContain('fuzzy');
  });
});
