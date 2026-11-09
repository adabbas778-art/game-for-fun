const form = document.getElementById('admin-login-form');
const input = document.getElementById('admin-token');
const status = document.getElementById('gate-status');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const token = input.value.trim();
  input.value = '';
  status.className = 'status';
  status.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذّر تسجيل دخول الأدمن');
    window.location.replace('/admin');
  } catch (error) {
    status.textContent = error.message;
    status.className = 'status error';
  } finally { button.disabled = false; }
});
