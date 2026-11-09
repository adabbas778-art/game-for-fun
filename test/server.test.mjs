import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test('safe demo submission, admin separation, session auth, CSRF, logout', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sh-v5-'));
  const storagePath = path.join(dir, 'visits.json');
  const adminToken = 'strong-demo-admin-token-for-tests';
  const { server } = createApp({ storagePath, adminToken });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const submit = body => fetch(`${base}/api/demo-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let response = await fetch(base);
    assert.equal(response.status, 200);
    const homepage = await response.text();
    assert.doesNotMatch(homepage, /href="\/admin\.html"/);
    response = await fetch(`${base}/arena.html`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Reaction Rush/);
    response = await fetch(`${base}/admin`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin-login.html');
    response = await fetch(`${base}/admin.html`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    response = await fetch(`${base}/api/admin/visits`);
    assert.equal(response.status, 401);

    response = await submit({ handle: 'tester.one', challengeText: '  مرحبا ⭐ demo + 123!  ', consent: true });
    assert.equal(response.status, 201);
    const publicResponse = await response.json();
    assert.equal(publicResponse.handle, 'tester.one');
    assert.match(publicResponse.arenaTicket, /^[a-f0-9]{64}$/);
    const gamePayload = { id: publicResponse.id, ticket: publicResponse.arenaTicket, reactionMs: 238 };
    response = await fetch(`${base}/api/reaction/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gamePayload) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { saved: true, bestMs: 238, attempts: 1 });
    response = await fetch(`${base}/api/reaction/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...gamePayload, reactionMs: 307 }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { saved: true, bestMs: 238, attempts: 2 });
    response = await fetch(`${base}/api/reaction/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...gamePayload, ticket: 'a'.repeat(64) }) });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/api/reaction/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...gamePayload, password: 'secret' }) });
    assert.equal(response.status, 400);
    assert.equal(Object.hasOwn(publicResponse, 'challengeText'), false);
    response = await submit({ handle: 'tester.one', challengeText: 'harmless demo', consent: true, password: 'DO-NOT-COLLECT' });
    assert.equal(response.status, 400);
    response = await submit({ handle: '<script>', challengeText: 'hello', consent: true });
    assert.equal(response.status, 400);
    response = await submit({ handle: 'tester.two', challengeText: 'hello', consent: false });
    assert.equal(response.status, 400);
    response = await submit({ handle: 'tester.two', challengeText: ' '.repeat(10), consent: true });
    assert.equal(response.status, 400);
    response = await submit({ handle: 'tester.two', challengeText: 'a'.repeat(81), consent: true });
    assert.equal(response.status, 400);
    const saved = readFileSync(storagePath, 'utf8');
    assert.equal(saved.includes('DO-NOT-COLLECT'), false);
    assert.equal(saved.includes('  مرحبا ⭐ demo + 123!  '), true);

    response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'wrong' }) });
    assert.equal(response.status, 401);
    response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: adminToken }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);

    response = await fetch(`${base}/admin`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /سجل تجارب التسجيل/);
    response = await fetch(`${base}/api/admin/me`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const { csrf } = await response.json();
    assert.ok(csrf);

    response = await fetch(`${base}/api/admin/visits`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const records = (await response.json()).visits;
    assert.equal(records.length, 1);
    assert.equal(records[0].challengeText, '  مرحبا ⭐ demo + 123!  ');
    assert.deepEqual(records[0].reaction.bestMs, 238);
    assert.equal(records[0].reaction.attempts, 2);
    assert.equal(Object.hasOwn(records[0], 'arenaTicketHash'), false);
    response = await fetch(`${base}/api/admin/visits`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/api/admin/visits`, { method: 'DELETE', headers: { Cookie: cookie, 'X-CSRF-Token': csrf } });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/api/admin/visits`, { headers: { Cookie: cookie } });
    assert.equal((await response.json()).visits.length, 0);

    response = await fetch(`${base}/api/admin/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/api/admin/visits`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 401);
    response = await fetch(`${base}/admin`, { redirect: 'manual', headers: { Cookie: cookie } });
    assert.equal(response.status, 302);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
