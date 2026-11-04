// Boots nothing: point it at a running API (API_URL) seeded with the demo admin.
// Signs in, asks the API for its own route list, then calls every parameterless GET route and reports anything that is not a success.
const base = process.env.API_URL ?? 'http://localhost:4000';
const email = process.env.SMOKE_EMAIL ?? 'admin@ecclesia.local';
const password = process.env.SMOKE_PASSWORD ?? 'Admin#2026!';
// Routes that need query input or have side effects are skipped by design.
const SKIP = [/\/audit-logs\/export$/, /\/logout$/];

const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
if (!login.ok) { console.error('login failed', login.status, await login.text()); process.exit(2); }
const { accessToken, token } = await login.json();
const auth = { Authorization: `Bearer ${accessToken ?? token}` };

const routes = await (await fetch(`${base}/api/v2/admin/api-reference`, { headers: auth })).json();
const targets = routes.filter((r) => r.method === 'GET' && r.params.length === 0 && r.authenticated && !SKIP.some((s) => s.test(r.path)));
const failures = [];
for (const r of targets) {
  const res = await fetch(base + r.path, { headers: auth });
  // 400 means the route needs query input; anything else at or above 400 is a real problem.
  if (res.status >= 400 && res.status !== 400) failures.push(`${res.status} GET ${r.path} ${(await res.text()).slice(0, 160)}`);
}
// ---- write flows: these exercise real queries, which mocked tests cannot
const call = async (method, path, body, headers = auth) => {
  const res = await fetch(base + path, { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
};
const step = async (name, method, path, body, expect = [200, 201]) => {
  const r = await call(method, path, body);
  if (!expect.includes(r.status)) failures.push(`${r.status} ${name}: ${method} ${path} ${JSON.stringify(r.json).slice(0, 200)}`);
  return r.json;
};
const tag = Date.now().toString(36);
const funds = await call('GET', '/api/v2/payments/funds');

const role = await step('create role', 'POST', '/api/v2/admin/roles', { name: `Smoke ${tag}`, permissions: ['asset:view'] });
if (role?.id) {
  await step('role permissions', 'PUT', `/api/v2/admin/roles/${role.id}/permissions`, { permissions: ['asset:view', 'group:view'] });
  await step('delete unused role', 'DELETE', `/api/v2/admin/roles/${role.id}`);
}
await step('set setting', 'PUT', '/api/v2/admin/settings/events.absenceThreshold', { value: 4 });
await step('reset setting', 'DELETE', '/api/v2/admin/settings/events.absenceThreshold');
await step('retention rule', 'PUT', '/api/v2/admin/retention', { entityType: 'AUDIT_LOG', retentionDays: 400 });
await step('retention dry run', 'POST', '/api/v2/admin/retention/run', {});
const from = new Date(Date.now() - 86400_000 * 30).toISOString(), to = new Date().toISOString();
await step('audit list', 'GET', '/api/v2/admin/audit-logs?take=5');
await step('audit export', 'GET', `/api/v2/admin/audit-logs/export?from=${from}&to=${to}`);
await step('users list', 'GET', '/api/v2/admin/users');

const campaign = await step('create campaign', 'POST', '/api/v2/campaigns', { name: `Roof ${tag}`, goalAmount: 500, startDate: from, isPublic: true });
if (campaign?.id) {
  await step('activate campaign', 'POST', `/api/v2/campaigns/${campaign.id}/activate`);
  await step('public campaign', 'GET', `/api/v2/public/campaigns/${campaign.slug}`);
  await step('close campaign', 'POST', `/api/v2/campaigns/${campaign.id}/close`);
}
const group = await step('create group', 'POST', '/api/v2/groups', { name: `Youth ${tag}`, meetingDay: 'FRIDAY', meetingTime: '18:30', capacity: 10 });
if (group?.id) {
  await step('record session', 'POST', `/api/v2/groups/${group.id}/sessions`, { heldOn: from, topic: 'Prayer' });
  await step('group summary', 'GET', `/api/v2/groups/${group.id}/attendance-summary`);
}
const cat = await step('create asset category', 'POST', '/api/v2/assets/categories', { name: `Sound ${tag}` });
if (cat?.id) {
  const asset = await step('create asset', 'POST', '/api/v2/assets', { categoryId: cat.id, tag: `SND-${tag}`, name: 'Mixer', purchaseCost: 120.5 });
  if (asset?.id) {
    await step('record maintenance', 'POST', `/api/v2/assets/${asset.id}/maintenance`, { performedOn: from, description: 'Cleaned faders', nextDueDate: to });
    await step('due maintenance', 'GET', '/api/v2/assets/maintenance/due?days=60');
    await step('retire asset', 'POST', `/api/v2/assets/${asset.id}/retire`);
  }
}
const tpl = await step('create template', 'POST', '/api/v2/documents/templates', { type: 'LETTER', name: `Letter ${tag}`, title: 'Hello from {{churchName}}', body: 'Dated {{date}} ref {{serial}} note {{field.note}}' });
if (tpl?.id) {
  const doc = await step('generate document', 'POST', '/api/v2/documents/generate', { templateId: tpl.id, fields: { note: 'hi' } });
  if (doc?.id) {
    const pdf = await fetch(`${base}/api/v2/documents/${doc.id}/pdf`, { headers: auth });
    if (pdf.status !== 200 || !(await pdf.text()).startsWith('%PDF')) failures.push(`pdf download failed ${pdf.status}`);
    await step('void document', 'POST', `/api/v2/documents/${doc.id}/void`, { reason: 'Smoke test void' });
  }
}
const feed = await step('create calendar feed', 'POST', '/api/v2/calendar/feeds', {});
if (feed?.path) {
  const ics = await fetch(base + feed.path);
  if (ics.status !== 200 || !(await ics.text()).startsWith('BEGIN:VCALENDAR')) failures.push(`calendar feed failed ${ics.status}`);
  await step('revoke feed', 'DELETE', `/api/v2/calendar/feeds/${feed.id}`);
  const after = await fetch(base + feed.path);
  if (after.status !== 404) failures.push(`revoked feed still served: ${after.status}`);
}

// ---- legacy finance: the atomic claim and self-approval rules run real queries here
const fundList = Array.isArray(funds.json) ? funds.json : funds.json?.funds ?? [];
if (fundList[0]?.id) {
  const exp = await call('POST', '/api/v2/churches/demo-church/expenditures', { churchId: 'demo-church', fundId: fundList[0].id, amount: 1, purpose: 'Smoke', category: 'OTHER' });
  console.log('legacy finance: request expenditure ->', exp.status);
  // 409 is a legitimate answer when the demo fund has no balance; anything else but success is a failure.
  if (![201, 200, 409].includes(exp.status)) failures.push(`${exp.status} request expenditure ${JSON.stringify(exp.json).slice(0, 200)}`);
  if (exp.status === 201 || exp.status === 200) {
    const id = exp.json.id ?? exp.json.expenditure?.id;
    const self = await call('POST', `/api/v2/churches/demo-church/expenditures/${id}/approve`, { expenditureId: id, approved: true });
    if (self.status !== 409) failures.push(`self-approval should be 409, got ${self.status}`);
    const rej = await call('POST', `/api/v2/churches/demo-church/expenditures/${id}/approve`, { expenditureId: id, approved: false });
    if (rej.status !== 200) failures.push(`reject own request should be 200, got ${rej.status} ${JSON.stringify(rej.json).slice(0, 160)}`);
    const again = await call('POST', `/api/v2/churches/demo-church/expenditures/${id}/approve`, { expenditureId: id, approved: false });
    if (again.status !== 409) failures.push(`second decision should be 409, got ${again.status}`);
  }
}

console.log(`checked ${targets.length} GET routes, ${failures.length} failed`);
for (const f of failures) console.log('  ' + f);
process.exit(failures.length ? 1 : 0);
