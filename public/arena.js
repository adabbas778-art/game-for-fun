// One reaction-time round: red = wait, green = press. Use performance.now for elapsed time.
const handle = sessionStorage.getItem('socialHubDemoHandle');
if (!handle) window.location.replace('/');
else document.getElementById('arena-handle').textContent = `@${handle}`;

const pad = document.getElementById('reaction-pad');
const start = document.getElementById('start-round');
const stateLabel = document.getElementById('round-state');
const symbol = document.getElementById('reaction-symbol');
const primary = document.getElementById('reaction-primary');
const secondary = document.getElementById('reaction-secondary');
const notice = document.getElementById('reaction-message');
const lastMs = document.getElementById('last-ms');
const bestMs = document.getElementById('best-ms');
const attemptsCount = document.getElementById('attempts-count');
const resultPanel = document.getElementById('arena-result');
const resultTitle = document.getElementById('reaction-title');
const resultReview = document.getElementById('reaction-review');
const saveStatus = document.getElementById('save-status');
let phase = 'idle';
let timer = null;
let started = 0;
let best = null;
let tries = 0;

function setPad(kind, icon, headline, message, status) {
  pad.className = `reaction-pad state-${kind}`;
  symbol.textContent = icon;
  primary.textContent = headline;
  secondary.textContent = message;
  stateLabel.textContent = status;
}
function formatMs(n) { return `${n.toLocaleString('en-US')} ms`; }
function explain(ms) {
  if (ms < 180) return ['⚡ سرعة أسطورية!', 'رد فعلك خارق — هل فيك تحافظ على الرقم؟'];
  if (ms < 260) return ['🚀 صاروخ!', 'نتيجة ممتازة. جرّب تكسر رقمك القياسي!'];
  if (ms < 400) return ['🔥 سريع جدًا!', 'بداية قوية — أعد المحاولة وشوف إذا بتحسّنها.'];
  return ['🎯 تحدّي جديد؟', 'كل محاولة فرصة لتحسين سرعتك!'];
}
function stopWaiting() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
function newRound() {
  stopWaiting();
  phase = 'waiting';
  resultPanel.hidden = true;
  notice.textContent = 'انتظر الإشارة الخضراء… لا تستعجل!';
  setPad('waiting', '⏳', 'استنّى…', 'لا تضغط لسه!', 'انتظار الإشارة');
  pad.disabled = false;
  start.disabled = true;
  timer = setTimeout(() => {
    timer = null;
    // Set phase and high-resolution start as close together as possible.
    started = performance.now();
    phase = 'ready';
    setPad('ready', '⚡', 'اضغط هلأ!', 'اضغط بسرعة!', 'GO!');
    notice.textContent = 'اضغط على المنطقة الخضراء أو اضغط Space / Enter.';
  }, 1600 + Math.round(Math.random() * 2700));
}
function earlyPress() {
  stopWaiting();
  phase = 'early';
  pad.disabled = true;
  start.disabled = false;
  start.textContent = 'جرّب مرة ثانية ←';
  setPad('early', '🚫', 'استعجلت!', 'ضغطت قبل ما تظهر الإشارة الخضراء', 'بداية خاطئة');
  notice.textContent = 'ولا يهمك — أعد المحاولة وانتظر اللون الأخضر.';
}
async function saveResult(ms) {
  const id = sessionStorage.getItem('socialHubDemoVisitId');
  const ticket = sessionStorage.getItem('socialHubArenaTicket');
  if (!id || !ticket) {
    saveStatus.textContent = 'النتيجة محلية فقط. سجّل تجربة جديدة حتى تظهر عند الأدمن.';
    return;
  }
  saveStatus.textContent = 'جارٍ حفظ نتيجتك في لوحة الأدمن…';
  try {
    const res = await fetch('/api/reaction/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ticket, reactionMs: ms }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذّر الحفظ');
    saveStatus.textContent = `✓ وصلت النتيجة للوحة الأدمن · أفضل زمن محفوظ ${formatMs(data.bestMs)}`;
  } catch (_) {
    saveStatus.textContent = 'تعذّر حفظ النتيجة على السيرفر. جرّب جولة جديدة إذا أردت.';
  }
}
function finish() {
  const elapsed = Math.max(1, Math.round(performance.now() - started));
  phase = 'done';
  pad.disabled = true;
  tries += 1;
  best = best === null ? elapsed : Math.min(best, elapsed);
  sessionStorage.setItem('socialHubLastReaction', String(elapsed));
  sessionStorage.setItem('socialHubBestReaction', String(best));
  lastMs.textContent = formatMs(elapsed);
  bestMs.textContent = formatMs(best);
  attemptsCount.textContent = String(tries);
  setPad('done', '🏁', formatMs(elapsed), 'تم تسجيل وقت الاستجابة', 'انتهت الجولة');
  notice.textContent = 'ممتاز! اضغط «جرّب مرة ثانية» حتى تكسر رقمك.';
  start.disabled = false;
  start.textContent = 'جرّب مرة ثانية ←';
  const [title, review] = explain(elapsed);
  resultTitle.textContent = title;
  resultReview.textContent = review;
  saveStatus.textContent = '';
  resultPanel.hidden = false;
  saveResult(elapsed);
}
function activatePad() {
  if (phase === 'waiting') earlyPress();
  else if (phase === 'ready') finish();
}
start.addEventListener('click', newRound);
pad.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault();
  activatePad();
});
pad.addEventListener('keydown', e => {
  if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    activatePad();
  }
});
// Ignore click following pointerdown: otherwise a single touch could fire twice.
pad.addEventListener('click', e => { e.preventDefault(); });
window.addEventListener('pagehide', stopWaiting);
