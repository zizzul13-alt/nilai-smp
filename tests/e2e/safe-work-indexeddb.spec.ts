import { expect, test } from '@playwright/test';

test('Dexie durable enqueue survives reload before server confirmation', async ({ page }) => {
  await page.goto('/');
  const queued = await page.evaluate(async () => {
    const mod = await import('/src/services/safeWork/localQueue.ts');
    const db = new mod.SafeWorkDb('r32-dexie-restart-proof');
    await db.delete();
    const op = await mod.enqueueStudentRename(db, { authUserId: 'A', workspaceId: 'WA', studentId: 'S1', displayName: 'Budi Baru', expectedRevision: 1, opId: '70000000-0000-0000-0000-000000000001' });
    db.close(); return op.status;
  });
  expect(queued).toBe('PENDING_SAFE');
  await page.reload();
  const recovered = await page.evaluate(async () => {
    const mod = await import('/src/services/safeWork/localQueue.ts');
    const db = new mod.SafeWorkDb('r32-dexie-restart-proof');
    const rows = await mod.pendingForNamespace(db, 'A', 'WA'); db.close(); return rows;
  });
  expect(recovered).toHaveLength(1);
  expect(recovered[0]).toMatchObject({ auth_user_id: 'A', workspace_id: 'WA', status: 'PENDING_SAFE' });
});

test('Dexie persistence failure never returns Pending Safe', async ({ page }) => {
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    const mod = await import('/src/services/safeWork/localQueue.ts');
    const db = new mod.SafeWorkDb('r32-dexie-failure-proof');
    db.close({ disableAutoOpen: true });
    try {
      await mod.enqueueStudentRename(db, { authUserId: 'A', workspaceId: 'WA', studentId: 'S1', displayName: 'Unsafe', expectedRevision: 1 });
      return 'PENDING_SAFE';
    } catch { return 'FAILED'; }
  });
  expect(outcome).toBe('FAILED');
});

test('namespace query never exposes another account queue', async ({ page }) => {
  await page.goto('/');
  const counts = await page.evaluate(async () => {
    const mod = await import('/src/services/safeWork/localQueue.ts');
    const db = new mod.SafeWorkDb('r32-dexie-namespace-proof'); await db.delete();
    await mod.enqueueStudentRename(db, { authUserId: 'A', workspaceId: 'WA', studentId: 'S1', displayName: 'A edit', expectedRevision: 1 });
    const a = await mod.pendingForNamespace(db, 'A', 'WA'); const b = await mod.pendingForNamespace(db, 'B', 'WB'); db.close();
    return [a.length, b.length];
  });
  expect(counts).toEqual([1, 0]);
});
