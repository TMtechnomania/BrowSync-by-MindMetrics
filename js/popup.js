const app = chrome || browser;

// Helper: Format seconds into readable time
function formatTime(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${secs}s`;
	return `${secs}s`;
}

// Format bytes to MB
function formatMemory(bytes) {
	return (bytes / (1024 * 1024)).toFixed(1);
}

// Theme synchronization is centralized in `js/theme.js` (default dark + broadcasting).
function applyStoredTheme(){
	const theme = localStorage.getItem('theme') || 'dark';
	if (theme === 'dark') document.documentElement.classList.add('dark');
	else document.documentElement.classList.remove('dark');
}
window.addEventListener('storage', (e) => {
	if (e.key === 'theme') applyStoredTheme();
});
// Keep listening for runtime broadcasts if present
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
	chrome.runtime.onMessage.addListener((msg) => {
		if (msg && msg.type === 'themeChanged') applyStoredTheme();
	});
}

// Generate a simple SVG favicon fallback (gradient orange->crimson + initial)
function generateFallbackFavicon(domain, size = 128) {
		const initial = (domain && domain[0]) ? domain[0].toUpperCase() : 'B';
		const fontSize = Math.floor(size * 0.45);
		const svg = `
				<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
					<defs>
						<linearGradient id='g' x1='0' x2='1'>
							<stop offset='0' stop-color='#FF6B35'/>
							<stop offset='1' stop-color='#DC2626'/>
						</linearGradient>
					</defs>
					<rect width='100%' height='100%' rx='18' fill='url(#g)' />
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
			if (!isLikelyRemoteDomain(domain)) { renderMaterialGlyphDataUrl(size, 'public').then(src => { imgEl.src = src; }).catch(() => { imgEl.src = generateGlobeSvg(domain, size); }); return; }
			// Helper to detect tiny placeholder favicons (like Google's 16x16 globe) and replace them
			function replaceIfPlaceholder() {
				try {
					const w = imgEl.naturalWidth || 0;
					const h = imgEl.naturalHeight || 0;
					const src = (imgEl.src || '').toLowerCase();
					if ((w && h && (w <= 16 && h <= 16)) || src.includes('t3.gstatic.com/faviconv2')) {
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
							imgEl.onerror = () => { imgEl.onerror = null; renderMaterialGlyphDataUrl(size, 'public').then(src => { imgEl.src = src; }).catch(() => { imgEl.src = generateGlobeSvg(domain, size); }); };
						} catch (e) {
							imgEl.src = generateAlertSvg(domain, size);
						}
					};
		} catch (err) {
			imgEl.onerror = null;
			imgEl.src = generateAlertSvg(domain, size);
		}
}

document.addEventListener("DOMContentLoaded", async () => {
	const logo = document.querySelector("#logo");
	const domain = document.querySelector("#domain");
	const totalVisits = document.querySelector("#totalVisits");
	const totalTime = document.querySelector("#totalTime");
	const activityRatio = document.querySelector("#activityRatio");
	const openTabs = document.querySelector("#openTabs");
	const memoryUsage = document.querySelector("#memoryUsage");

	// Get active tab domain
	const getDomain = async () => {
		const tabs = await app.tabs.query({ active: true, currentWindow: true });
		if (!tabs[0]) return null;
		const url = new URL(tabs[0].url);
		return url.hostname;
	};

	const currentDomain = await getDomain();

	// Update system stats (real-time)
	async function updateSystemStats() {
		try {
			// Get open tabs count
			const allTabs = await app.tabs.query({});
			openTabs.textContent = allTabs.length;

			// Get memory info
			if (chrome.system && chrome.system.memory) {
				const memInfo = await chrome.system.memory.getInfo();
				const usedMemory = memInfo.capacity - memInfo.availableCapacity;
				memoryUsage.textContent = `${formatMemory(usedMemory)} MB`;
			} else {
				memoryUsage.textContent = 'N/A';
			}
		} catch (error) {
			console.log('System stats unavailable:', error);
			memoryUsage.textContent = 'N/A';
		}
	}

	// Initial system stats update
	updateSystemStats();
	// Update every 2 seconds
	setInterval(updateSystemStats, 2000);

	if (!currentDomain || !currentDomain.includes(".")) {
		domain.textContent = "Browser Page";
		totalVisits.textContent = "N/A";
		totalTime.textContent = "N/A";
		activityRatio.textContent = "N/A";
		logo.src = "/icons/128.png";
		return;
	}

	// Get domain data
	const data = await app.storage.local.get("domainDB");
	const domainDB = data.domainDB || {};

	setFaviconWithFallback(logo, currentDomain, 128);
	domain.textContent = currentDomain;

	// Update domain stats
	function updateDomainStats(sessionData = null) {
		if (domainDB[currentDomain]) {
			const domainData = domainDB[currentDomain];
			totalVisits.textContent = domainData.urlVisited?.length || 0;

			let totalLifeTime = domainData.totalLife || 0;
			let activeLifeTime = domainData.activeLife || 0;

			if (sessionData) {
				totalLifeTime += sessionData.sessionDuration;
				activeLifeTime += sessionData.activeSession;
			}

			totalTime.textContent = formatTime(totalLifeTime);
			const ratio = totalLifeTime > 0 ? Math.floor((activeLifeTime / totalLifeTime) * 100) : 0;
			activityRatio.textContent = `${ratio}%`;
		} else {
			totalVisits.textContent = "0";
			if (sessionData) {
				totalTime.textContent = formatTime(sessionData.sessionDuration);
				const ratio = sessionData.sessionDuration > 0 
					? Math.floor((sessionData.activeSession / sessionData.sessionDuration) * 100) 
					: 0;
				activityRatio.textContent = `${ratio}%`;
			} else {
				totalTime.textContent = "0m";
				activityRatio.textContent = "0%";
			}
		}
	}

	// Initial update
	updateDomainStats();

	// Update with current session data every second
	setInterval(async () => {
		try {
			const tabs = await app.tabs.query({ active: true, currentWindow: true });
			if (tabs[0]) {
						app.tabs.sendMessage(tabs[0].id, { type: "getSessionData" }, (response) => {
								if (response && response.sessionData) {
									updateDomainStats(response.sessionData);
								}
							});
			}
		} catch (error) {
			console.log('Error updating session data:', error);
		}
	}, 1000);
});
