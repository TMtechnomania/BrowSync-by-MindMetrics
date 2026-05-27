const app = chrome || browser;

// Helper functions
function formatTime(seconds) {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return hrs > 0 ? `${hrs}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function decodeTimestamp(unixTimestamp) {
	const date = new Date(unixTimestamp * 1000);
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = date.getFullYear();
	return `${hours}:${minutes} ${day}/${month}/${year}`;
}

// Generate a SVG data-url fallback favicon (gradient orange -> crimson with initial)
function generateFallbackFavicon(domain, size = 128) {
		const initial = (domain && domain[0]) ? domain[0].toUpperCase() : 'B';
		const fontSize = Math.floor(size * 0.5);
		const svg = `
				<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
					<defs>
						<linearGradient id='g' x1='0' x2='1'>
							<stop offset='0' stop-color='#FF6B35'/>
							<stop offset='1' stop-color='#DC2626'/>
						</linearGradient>
					</defs>
					<rect width='100%' height='100%' rx='20' fill='url(#g)' />
					<text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Inter, system-ui, sans-serif' font-size='${fontSize}' fill='#FFFFFF' font-weight='700'>${initial}</text>
				</svg>`;
		return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function setFaviconWithFallback(imgEl, domain, size = 128) {
		function isLikelyRemoteDomain(d) {
			if (!d) return false;
			if (/^(127|10|192|0)\.|^localhost$/i.test(d)) return false;
			if (!d.includes('.')) return false;
			if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(d)) return false;
			return true;
		}

				function generateAlertSvg(domain, size = 64) {
						const svg = `
						<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'>
							<defs>
								<linearGradient id='bg' x1='0' x2='1'>
									<stop offset='0' stop-color='rgba(255,107,53,0.12)' />
									<stop offset='1' stop-color='rgba(220,38,38,0.08)' />
								</linearGradient>
							</defs>
							<rect width='100%' height='100%' rx='6' fill='url(#bg)' />
							<path d='M12 3 L3 19 L21 19 Z' fill='#E85A2A' />
							<path d='M12 8 v5' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' />
							<circle cx='12' cy='17.2' r='0.9' fill='white' />
						</svg>`;
						return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
				}

					function generateGlobeSvg(domain, size = 64) {
						const svg = `
						<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'>
						  <defs>
						    <linearGradient id='bg' x1='0' x2='1'>
						      <stop offset='0' stop-color='rgba(255,107,53,0.12)' />
						      <stop offset='1' stop-color='rgba(220,38,38,0.08)' />
						    </linearGradient>
						  </defs>
						  <rect width='100%' height='100%' rx='6' fill='url(#bg)' />
						  <circle cx='12' cy='12' r='7' fill='#DC2626' />
						  <path d='M12 5a7 7 0 010 14' stroke='rgba(255,255,255,0.9)' stroke-width='0.9' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
						  <path d='M9 6c1 1.6 1 10.6 0 12' stroke='rgba(255,255,255,0.85)' stroke-width='0.9' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
						  <path d='M15 6c-1 1.6-1 10.6 0 12' stroke='rgba(255,255,255,0.85)' stroke-width='0.9' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
						  <path d='M6 12h12' stroke='rgba(255,255,255,0.9)' stroke-width='0.9' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
						</svg>`;
						return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
					}

	// Attempt to render the Material Icons 'warning' glyph into a canvas and return a data URL.
	// Falls back to generateAlertSvg if the font isn't available or rendering fails.
	async function renderMaterialGlyphDataUrl(size = 64, glyph = 'warning') {
			if (!document.querySelector('link[data-material-icons]')) {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = 'https://fonts.googleapis.com/css2?family=Material+Icons';
				link.setAttribute('data-material-icons', 'true');
				document.head.appendChild(link);
			}

			try {
				await document.fonts.load(`${Math.floor(size * 0.8)}px "Material Icons"`);
			} catch (e) {}

			try {
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');

				const r = Math.max(4, Math.floor(size * 0.08));
				// background gradient matching alert tile
				const bg = ctx.createLinearGradient(0, 0, size, size);
				bg.addColorStop(0, 'rgba(255,107,53,0.12)');
				bg.addColorStop(1, 'rgba(220,38,38,0.08)');
				roundedRect(ctx, 0, 0, size, size, r);
				ctx.fillStyle = bg;
				ctx.fill();

				const fontSize = Math.floor(size * 0.78);
				ctx.font = `${fontSize}px "Material Icons"`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = '#DC2626';
				ctx.fillText(glyph, size / 2, size / 2 + Math.floor(size * 0.02));

				return canvas.toDataURL();
			} catch (err) {
				return generateAlertSvg(domain, size);
			}
		}

		function roundedRect(ctx, x, y, width, height, radius) {
			ctx.beginPath();
			ctx.moveTo(x + radius, y);
			ctx.arcTo(x + width, y, x + width, y + height, radius);
			ctx.arcTo(x + width, y + height, x, y + height, radius);
			ctx.arcTo(x, y + height, x, y, radius);
			ctx.arcTo(x, y, x + width, y, radius);
			ctx.closePath();
		}

		try {
			if (!domain) { imgEl.src = '/icons/128.png'; return; }
			// For local/invalid hosts avoid external fetches; render globe ('public') glyph or fallback to globe SVG
			if (!isLikelyRemoteDomain(domain)) { renderMaterialGlyphDataUrl(size, 'public').then(src => { imgEl.src = src; }).catch(() => { imgEl.src = generateGlobeSvg(domain, size); }); return; }
			// Helper to detect tiny placeholder favicons (like Google's 16x16 globe) and replace them
			function replaceIfPlaceholder() {
				try {
					const w = imgEl.naturalWidth || 0;
					const h = imgEl.naturalHeight || 0;
					const src = (imgEl.src || '').toLowerCase();
					if ((w && h && (w <= 16 && h <= 16)) || src.includes('t3.gstatic.com/faviconv2')) {
						// Use globe-styled SVG for placeholders, then attempt to render the Material 'public' glyph
						imgEl.src = generateGlobeSvg(domain, size);
						renderMaterialGlyphDataUrl(size, 'public').then(s => { imgEl.src = s; }).catch(() => {});
						return true;
					}
				} catch (e) {}
				return false;
			}

			imgEl.src = `https://logo.clearbit.com/${domain}?size=${size}`;
			imgEl.onload = () => { if (!replaceIfPlaceholder()) imgEl.onload = null; };
			imgEl.onerror = () => {
				try {
					imgEl.onerror = null;
					imgEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
					imgEl.onload = () => { if (!replaceIfPlaceholder()) imgEl.onload = null; };
					imgEl.onerror = () => {
						imgEl.onerror = null;
						// For logo load errors, prefer the globe (Material 'public') glyph then fallback to globe SVG
						renderMaterialGlyphDataUrl(size, 'public').then(src => { imgEl.src = src; }).catch(() => { imgEl.src = generateGlobeSvg(domain, size); });
					};
				} catch (e) {
					imgEl.src = generateAlertSvg(domain, size);
				}
			};
		} catch (err) {
			imgEl.onerror = null;
			imgEl.src = generateAlertSvg(domain, size);
		}
}

// Theme synchronization is handled by `js/theme.js` (default dark + broadcasting).
// Keep a small helper to apply any stored theme updates (used by storage/runtime listeners elsewhere).
function applyStoredTheme(){
	const theme = localStorage.getItem('theme') || 'dark';
	if (theme === 'dark') document.documentElement.classList.add('dark');
	else document.documentElement.classList.remove('dark');
}
window.addEventListener('storage', (e) => {
	if (e.key === 'theme') applyStoredTheme();
});

document.addEventListener("DOMContentLoaded", async function () {
	// Theme is initialized and toggle handled by /js/theme.js (centralized)
	const themeToggle = document.getElementById("themeToggle");
	const domainLogo = document.getElementById("domainLogo");
	const domainName = document.getElementById("domainName");
	const totalTimeSpent = document.getElementById("totalTimeSpent");
	const totalSessions = document.getElementById("totalSessions");
	const activeTime = document.getElementById("activeTime");
	const passiveTime = document.getElementById("passiveTime");
	const activityRatio = document.getElementById("activityRatio");
	const totalDistractions = document.getElementById("totalDistractions");
	const totalInteractions = document.getElementById("totalInteractions");
	const sessionTableBody = document.getElementById("sessionTableBody");
	const blacklist = document.getElementById("blacklist");
	const usageReminder = document.getElementById("usageReminder");

	// Get domain from URL
	const url = new URL(window.location.href);
	const domain = url.searchParams.get("domain");

	if (!domain) {
		window.location.href = "/dashboard.html";
		return;
	}

	// Get domain data
	const { domainDB = {} } = await app.storage.local.get(["domainDB"]);
	const domainData = domainDB[domain] || {};

	// Set domain info with robust fallbacks
	setFaviconWithFallback(domainLogo, domain, 128);
	domainName.textContent = domain;

	// Display stats
	totalTimeSpent.textContent = formatTime(domainData.totalLife || 0);
	totalSessions.textContent = domainData.urlVisited?.length || 0;
	activeTime.textContent = formatTime(domainData.activeLife || 0);
	passiveTime.textContent = formatTime((domainData.totalLife || 0) - (domainData.activeLife || 0));
	
	const ratio = domainData.totalLife > 0 
		? Math.round((domainData.activeLife / domainData.totalLife) * 100) 
		: 0;
	activityRatio.textContent = `${ratio}%`;
	
	totalDistractions.textContent = domainData.distractions || 0;
	totalInteractions.textContent = domainData.clicks || 0;

	// Render session history
	if (domainData.urlVisited && domainData.urlVisited.length > 0) {
	// Filter out sessions that are null/invalid or have 0 duration
	const validSessions = domainData.urlVisited.filter(s => s && typeof s.sessionDuration === 'number' && s.sessionDuration > 0);
		
		if (validSessions.length !== domainData.urlVisited.length) {
			// Update the database to remove invalid sessions
			domainData.urlVisited = validSessions;
			await app.storage.local.set({ domainDB });
		}

		sessionTableBody.innerHTML = validSessions.map((session, index) => {
			// Defensive defaults for session properties
			const duration = typeof session.sessionDuration === 'number' ? session.sessionDuration : 0;
			const active = typeof session.activeSession === 'number' ? session.activeSession : 0;
			const sessionRatio = duration > 0 ? Math.round((active / duration) * 100) : 0;
				const titleSafe = session && session.title ? session.title : 'Untitled';
				const urlSafe = session && session.url ? String(session.url) : '';
			const startSafe = session && session.sessionStart ? session.sessionStart : null;
            
			return `
					<tr class="hover:bg-gray-100 dark:hover:bg-grey-light transition-all">
						<td class="px-6 py-4 text-sm text-grey-dark dark:text-off-white">${index + 1}</td>
						<td class="px-6 py-4">
							<div class="max-w-xs truncate text-grey-dark dark:text-off-white" title="${session.title || 'Untitled'}">
								${session.title || 'Untitled'}
							</div>
						</td>
						<td class="px-6 py-4">
								<a href="${urlSafe}" target="_blank" class="text-orange-punch hover:text-orange-dark hover:underline max-w-xs truncate block" title="${urlSafe}">
									${urlSafe.substring(0, 50)}${urlSafe.length > 50 ? '...' : ''}
							</a>
						</td>
						<td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">${startSafe ? decodeTimestamp(startSafe) : '—'}</td>
						<td class="px-6 py-4 text-grey-dark dark:text-off-white">${formatTime(duration)}</td>
						<td class="px-6 py-4">
							${(() => {
								// Use semantic focus-badge classes so dark mode styles apply consistently
								let modifier = 'focus-badge--poor';
								if (sessionRatio >= 75) modifier = 'focus-badge--high';
								else if (sessionRatio >= 50) modifier = 'focus-badge--medium';
								else if (sessionRatio >= 25) modifier = 'focus-badge--low';
								return `<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold focus-badge ${modifier}">${sessionRatio}%</span>`;
							})()}
						</td>
						<td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
							<div class="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 21H5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${session.clicks || 0} clicks</span></div>
							<div class="flex items-center gap-2 mt-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a5 5 0 00-5 5v4l-2 2h14l-2-2V7a5 5 0 00-5-5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${session.distractions || 0} distractions</span></div>
						</td>
					</tr>
			`;
		}).join('');
	} else {
		sessionTableBody.innerHTML = `
			<tr>
				<td colspan="7" class="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
					No session history available for this domain
				</td>
			</tr>
		`;
	}

	// Load settings
	const settings = await app.storage.local.get([domain]);
	if (settings[domain]) {
		blacklist.value = settings[domain].blacklist || "no";
		usageReminder.value = settings[domain].usageReminder || "never";
	}

	// Update settings
	blacklist.addEventListener("change", async function () {
		const currentSettings = await app.storage.local.get([domain]);
		await app.storage.local.set({
			[domain]: {
				...(currentSettings[domain] || {}),
				blacklist: this.value,
			},
		});
		if (this.value === "yes") {
			alert(`${domain} has been blacklisted. You will be redirected when you visit this site.`);
		}
	});

	usageReminder.addEventListener("change", async function () {
		const currentSettings = await app.storage.local.get([domain]);
		await app.storage.local.set({
			[domain]: {
				...(currentSettings[domain] || {}),
				usageReminder: this.value,
			},
		});
	});

	// Handle blacklist redirect
	const blacklisted = url.searchParams.get("blacklisted");
	if (blacklisted === "true") {
		alert(`This domain: ${domain} is blacklisted`);
		const newUrl = new URL(window.location.href);
		newUrl.searchParams.delete("blacklisted");
		window.history.replaceState({}, '', newUrl);
	}

	// Handle domain deletion
	const shouldDelete = url.searchParams.get("delete");
	if (shouldDelete === "true") {
		if (confirm(`Are you sure you want to delete all data for ${domain}?`)) {
			delete domainDB[domain];
			await app.storage.local.set({ domainDB });
			window.location.href = "/dashboard.html";
		} else {
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.delete("delete");
			window.history.replaceState({}, '', newUrl);
		}
	}
});
