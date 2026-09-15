// public/js/theme.js
// Gestionnaire de thème clair / sombre avec persistance localStorage et support prefers-color-scheme

(function() {
  function getPreferredTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = theme === 'dark' ? 'dark' : 'light';
    
    // Met à jour le bouton de bascule
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      const isDark = theme === 'dark';
      toggleBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      toggleBtn.setAttribute('title', isDark ? 'Passer au thème clair' : 'Passer au thème sombre');
      toggleBtn.setAttribute('aria-label', isDark ? 'Passer au thème clair' : 'Passer au thème sombre');
      
      const sunIcon = toggleBtn.querySelector('.sun-icon');
      const moonIcon = toggleBtn.querySelector('.moon-icon');
      const textSpan = toggleBtn.querySelector('.theme-label');
      
      if (sunIcon && moonIcon) {
        sunIcon.style.display = isDark ? 'inline-block' : 'none';
        moonIcon.style.display = isDark ? 'none' : 'inline-block';
      }
      if (textSpan) {
        textSpan.textContent = isDark ? 'Clair' : 'Sombre';
      }
    }
  }

  // Appliquer immédiatement
  applyTheme(getPreferredTheme());

  // Brancher les événements au chargement du DOM
  window.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme());

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const activeTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
        const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);

        if (typeof window.onThemeChange === 'function') {
          window.onThemeChange(newTheme);
        }
      });
    }

    // Réagir aux changements système si non fixé explicitement par l'utilisateur
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
        if (typeof window.onThemeChange === 'function') {
          window.onThemeChange(e.matches ? 'dark' : 'light');
        }
      }
    });
  });
})();
