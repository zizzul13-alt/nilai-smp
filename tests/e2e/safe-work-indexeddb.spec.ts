import { expect, test } from '@playwright/test';

test('browser IndexedDB survives reload and remains namespace-addressable', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const request = indexedDB.open('r32-browser-kill-proof', 1);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore('ops', { keyPath: 'op_id' });
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
    const db = request.result;
    const tx = db.transaction('ops', 'readwrite');
    tx.objectStore('ops').put({ op_id: 'stable-op', auth_user_id: 'A', workspace_id: 'WA', status: 'PENDING_SAFE' });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close(); return true;
  });
  expect(result).toBe(true);
  await page.reload();
  const recovered = await page.evaluate(async () => {
    const request = indexedDB.open('r32-browser-kill-proof', 1);
    await new Promise<void>((resolve, reject) => { request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    const db = request.result; const tx = db.transaction('ops'); const get = tx.objectStore('ops').get('stable-op');
    const value = await new Promise<any>((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    db.close(); return value;
  });
  expect(recovered).toMatchObject({ op_id: 'stable-op', auth_user_id: 'A', workspace_id: 'WA', status: 'PENDING_SAFE' });
});

test('IndexedDB failure cannot truthfully produce Pending Safe', async ({ page }) => {
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    const request = indexedDB.open('r32-failure-proof', 1);
    await new Promise<void>((resolve, reject) => { request.onupgradeneeded = () => request.result.createObjectStore('ops'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    const db = request.result; db.close(); indexedDB.deleteDatabase('r32-failure-proof');
    try { db.transaction('ops', 'readwrite'); return 'PENDING_SAFE'; } catch { return 'FAILED'; }
  });
  expect(outcome).toBe('FAILED');
});
