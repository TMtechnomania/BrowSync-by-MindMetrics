// Theme initialization for BrowSync — moved out of HTML to satisfy CSP (no inline scripts)
// Behavior: prefer saved theme; default to 'dark' and persist the default. Toggle persists choice.
(function () {
  function initTheme() {
    const root = document.documentElement;
    const themeToggle = document.getElementById('themeToggle');

    const saved = localStorage.getItem('theme');
    const initial = saved ? saved : 'dark';

    // Persist default so pages/popups are consistent until user toggles
    if (!saved) localStorage.setItem('theme', initial);

    if (initial === 'dark') root.classList.add('dark'); else root.classList.remove('dark');

    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const isDarkNow = root.classList.toggle('dark');
        const newTheme = isDarkNow ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        // Broadcast to other extension pages (may fail in non-extension contexts)
        try { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) chrome.runtime.sendMessage({ type: 'themeChanged', theme: newTheme }); } catch (e) {}
      });
    }

    // Apply updates when other pages broadcast theme changes
    function applyStoredTheme() {
      const t = localStorage.getItem('theme') || 'dark';
      if (t === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'themeChanged') applyStoredTheme();
      });
    }

    // Sync across tabs/windows
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') applyStoredTheme();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
})();
