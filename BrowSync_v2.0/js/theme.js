/*
 * theme.js
 *
 * This script runs in the <head> to prevent Flash of Unstyled Content (FOUC).
 * It reads the 'theme' from localStorage and applies the 'dark' class
 * to the <html> element before the page is rendered.
 */
(function() {
	try {
		const theme = localStorage.getItem('theme') || 'dark';
		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	} catch (e) {
		console.error('BrowSync: Failed to apply theme from localStorage', e);
	}
})();