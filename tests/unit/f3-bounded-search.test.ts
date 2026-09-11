import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';

const assessments=readFileSync('src/components/AssessmentManager.tsx','utf8');
const artifacts=readFileSync('src/components/Artifacts.tsx','utf8');
const rapid=readFileSync('src/components/RapidCorrection.tsx','utf8');

describe('F3 bounded search/filter contracts',()=>{
  it('filters assessments locally by title/class while rendering canonical assessment identity',()=>{
    expect(assessments).toContain("filterClassId==='ALL'||row.class_id===filterClassId");
    expect(assessments).toContain("row.title.toLocaleLowerCase('id-ID').includes(q)");
    expect(assessments).toContain('data-assessment-id={row.id}');
    expect(assessments).not.toContain('createAssessment(client,workspaceId,{academicClass:filter');
  });

  it('filters artifacts by title/type but keeps selected and mutation identity as artifact id',()=>{
    expect(artifacts).toContain("artifactTypeFilter==='ALL'||item.artifact_type===artifactTypeFilter");
    expect(artifacts).toContain("item.title.toLocaleLowerCase('id-ID').includes(q)");
    expect(artifacts).toContain('value={item.id} key={item.id}');
    expect(artifacts).toContain('artifactId:selected.id');
    expect(artifacts).not.toContain('artifactId:artifactQuery');
  });

  it('retains existing correction-local student search instead of inventing a global omnibox',()=>{
    expect(rapid).toContain('searchCorrectionStudents(ctx,query)');
    expect(rapid).toContain('Cari pemilik kertas');
    expect(rapid).toContain('selectEnrollment(enrollment.id)');
  });

  it('does not introduce generic global-search or fuzzy mutation plumbing',()=>{
    const combined=`${assessments}\n${artifacts}`.toLowerCase();
    expect(combined).not.toContain('global search');
    expect(combined).not.toContain('omnibox');
    expect(combined).not.toContain('levenshtein');
    expect(combined).not.toContain('fuzzy');
  });
});
