const handle = sessionStorage.getItem('socialHubDemoHandle');
if (!handle) {
  window.location.replace('/');
} else {
  document.getElementById('greeting').textContent = handle;
  document.getElementById('profile-handle').textContent = `@${handle}`;
  // Public profile URL generator only; no account verification or OAuth implied.
  document.getElementById('snap-link').href = `https://www.snapchat.com/add/${encodeURIComponent(handle)}`;
}
const lastScore = sessionStorage.getItem('socialHubLastReaction');
const scorePreview = document.getElementById('last-score');
if (lastScore && scorePreview) scorePreview.textContent = `${lastScore} ms`;
document.getElementById('logout').addEventListener('click', () => {
  sessionStorage.removeItem('socialHubDemoHandle');
  sessionStorage.removeItem('socialHubDemoVisitId');
  sessionStorage.removeItem('socialHubArenaTicket');
  sessionStorage.removeItem('socialHubLastReaction');
  sessionStorage.removeItem('socialHubBestReaction');
  window.location.assign('/');
});
