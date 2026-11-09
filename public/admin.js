const status = document.getElementById('admin-status');
const body = document.getElementById('visits-body');
const exportButton = document.getElementById('export');
const clearButton = document.getElementById('clear');
const refreshButton = document.getElementById('refresh');
let visits = [];
let csrf = '';
let loading = false;

function notice(message, error = false) {
  status.textContent = message;
  status.className = `status ${error ? 'error' : 'success'}`;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('ar-JO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function render() {
  document.getElementById('total').textContent = visits.length.toLocaleString('ar-JO');
  document.getElementById('finished-count').textContent = visits.filter(v => v.reaction).length.toLocaleString('ar-JO');
  document.getElementById('latest').textContent = visits[0] ? formatDate(visits[0].createdAt) : 'لا يوجد';
  exportButton.disabled = !visits.length;
  clearButton.disabled = !visits.length;
  body.replaceChildren();
  if (!visits.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 5; cell.className = 'empty-cell'; cell.textContent = 'ما في عمليات تسجيل تجريبية لحد الآن';
    return;
  }
  for (const record of visits) {
    const row = body.insertRow();
    row.insertCell().textContent = record.handle;
    const codeCell = row.insertCell();
    codeCell.textContent = record.challengeText ?? record.demoCode ?? '—';
    codeCell.className = 'demo-code-cell';
    row.insertCell().textContent = record.reaction ? `${record.reaction.bestMs} ms (${record.reaction.attempts} محاولة)` : 'لم يلعب بعد';
    row.insertCell().textContent = formatDate(record.createdAt);
    row.insertCell().textContent = record.id.slice(0, 12);
  }
}
async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 401) { window.location.replace('/admin-login.html'); throw Error('انتهت جلسة الأدمن'); }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'فشل الاتصال بالخادم');
  return data;
}
async function refresh(showStatus = true) {
  if (loading) return;
  loading = true;
  refreshButton.disabled = true;
  try {
    const result = await api('/api/admin/visits');
    visits = result.visits;
    render();
    if (showStatus) notice(`تم التحديث · ${new Date().toLocaleTimeString('ar-JO')}`);
  } catch (error) { notice(error.message, true); }
  finally { loading = false; refreshButton.disabled = false; }
}
refreshButton.addEventListener('click', () => refresh());
exportButton.addEventListener('click', () => {
  // Prevent spreadsheet formula injection if an arbitrary test phrase begins with =,+,-,@.
  const escapeCSV = value => {
    let str = String(value ?? '');
    if (/^[\s\uFEFF]*[=+\-@]/u.test(str)) str = "'" + str;
    return `"${str.replaceAll('"', '""')}"`;
  };
  const lines = [['handle','test_phrase_not_a_password','reaction_best_ms','reaction_last_ms','reaction_attempts','timestamp','event_id'], ...visits.map(v => [v.handle, v.challengeText ?? v.demoCode ?? '', v.reaction?.bestMs ?? '', v.reaction?.lastMs ?? '', v.reaction?.attempts ?? '', v.createdAt, v.id])];
  const content = '\uFEFF' + lines.map(row => row.map(escapeCSV).join(',')).join('\r\n');
  const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = objectUrl; link.download = 'social-hub-demo-records.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});
clearButton.addEventListener('click', async () => {
  if (!confirm('حذف كل سجلات التسجيل التجريبي؟')) return;
  clearButton.disabled = true;
  try {
    await api('/api/admin/visits', { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } });
    visits = []; render(); notice('تم حذف جميع سجلات التجارب.');
  } catch (error) { notice(error.message, true); clearButton.disabled = false; }
});
document.getElementById('logout-admin').addEventListener('click', async () => {
  try { await fetch('/api/admin/logout', { method: 'POST' }); }
  finally { window.location.replace('/admin-login.html'); }
});
(async () => {
  try {
    const result = await api('/api/admin/me');
    csrf = result.csrf;
    await refresh();
    setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, 5000);
  } catch (error) { notice(error.message, true); }
})();
