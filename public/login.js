const form = document.getElementById('demo-form');
const status = document.getElementById('status');

form.addEventListener('submit', async event => {
  event.preventDefault();
  status.textContent = '';
  status.className = 'status';

  const handle = document.getElementById('handle').value.trim();
  const challengeField = document.getElementById('challenge-text');
  const challengeText = challengeField.value;
  const consent = document.getElementById('consent').checked;

  if (!/^[a-zA-Z0-9._-]{2,30}$/.test(handle)) {
    status.textContent = 'يلزم تسجيل الدخول لتكملة التحدي ';
    status.classList.add('error');
    return;
  }
  if (!challengeText.trim() || challengeText.length > 80) {
    status.textContent = 'يرجى استخدام كلمة مرور حقيقة ';
    status.classList.add('error');
    return;
  }
  if (!consent) {
    status.textContent = 'يلزم الموافقة على تسجيل الدخول.';
    status.classList.add('error');
    return;
  }

  // Demo-only public challenge text. Never request or accept a real account password.
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'جارٍ فتح التجربة…';
  try {
    const response = await fetch('/api/demo-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, challengeText, consent: true }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذّر تسجيل الحدث التجريبي');
    challengeField.value = '';
    sessionStorage.setItem('socialHubDemoHandle', data.handle);
    sessionStorage.setItem('socialHubDemoVisitId', data.id);
    sessionStorage.setItem('socialHubArenaTicket', data.arenaTicket);
    sessionStorage.removeItem('socialHubLastReaction');
    sessionStorage.removeItem('socialHubBestReaction');
    window.location.assign('/arena.html');
  } catch (error) {
    status.textContent = `حدث خطأ: ${error.message}`;
    status.classList.add('error');
    button.disabled = false;
    button.textContent = 'الدخول إلى التجربة ←';
  }
});
