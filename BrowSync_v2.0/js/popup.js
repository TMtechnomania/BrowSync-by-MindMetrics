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
	if (!bytes || bytes === 0) return "0 MB";
	return (bytes / (1024 * 1024)).toFixed(1);
}
// Favicon generation logic (unchanged)
function generateFallbackFavicon(domain, size = 128) {
	const initial = domain && domain[0] ? domain[0].toUpperCase() : "B";
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
	return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function setFaviconWithFallback(imgEl, domain, size = 128) {
	function isLikelyRemoteDomain(d) {
		if (!d) return false;
		if (/^(127|10|192|0)\.|^localhost$/i.test(d)) return false;
		if (!d.includes(".")) return false;
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
		return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
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
		return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
	}
	async function renderMaterialGlyphDataUrl(size = 64, glyph = "warning") {
		if (!document.querySelector("link[data-material-icons]")) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href =
				"https://fonts.googleapis.com/css2?family=Material+Icons";
			link.setAttribute("data-material-icons", "true");
			document.head.appendChild(link);
		}
		try {
			await document.fonts.load(
				`${Math.floor(size * 0.8)}px "Material Icons"`,
			);
		} catch (e) {}
		try {
			const canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			const r = Math.max(4, Math.floor(size * 0.08));
			const bg = ctx.createLinearGradient(0, 0, size, size);
			bg.addColorStop(0, "rgba(255,107,53,0.12)");
			bg.addColorStop(1, "rgba(220,38,38,0.08)");
			roundedRect(ctx, 0, 0, size, size, r);
			ctx.fillStyle = bg;
			ctx.fill();
			const fontSize = Math.floor(size * 0.78);
			ctx.font = `${fontSize}px "Material Icons"`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#DC2626";
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
		if (!domain) {
			imgEl.src = "/icons/128.png";
			return;
		}
		if (!isLikelyRemoteDomain(domain)) {
			renderMaterialGlyphDataUrl(size, "public")
				.then((src) => {
					imgEl.src = src;
				})
				.catch(() => {
					imgEl.src = generateGlobeSvg(domain, size);
				});
			return;
		}
		function replaceIfPlaceholder() {
			try {
				const w = imgEl.naturalWidth || 0;
				const h = imgEl.naturalHeight || 0;
				const src = (imgEl.src || "").toLowerCase();
				if (
					(w && h && w <= 16 && h <= 16) ||
					src.includes("t3.gstatic.com/faviconv2")
				) {
					imgEl.src = generateGlobeSvg(domain, size);
					renderMaterialGlyphDataUrl(size, "public")
						.then((s) => {
							imgEl.src = s;
						})
						.catch(() => {});
					return true;
				}
			} catch (e) {}
			return false;
		}
		imgEl.src = `https://logo.clearbit.com/${domain}?size=${size}`;
		imgEl.onload = () => {
			if (!replaceIfPlaceholder()) imgEl.onload = null;
		};
		imgEl.onerror = () => {
			try {
				imgEl.onerror = null;
				imgEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
				imgEl.onload = () => {
					if (!replaceIfPlaceholder()) imgEl.onload = null;
				};
				imgEl.onerror = () => {
					imgEl.onerror = null;
					renderMaterialGlyphDataUrl(size, "public")
						.then((src) => {
							imgEl.src = src;
						})
						.catch(() => {
							imgEl.src = generateGlobeSvg(domain, size);
						});
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
document.addEventListener("DOMContentLoaded", async () => {
	// Get UI elements
	const logo = document.querySelector("#logo");
	const domainEl = document.querySelector("#domain");
	const openTabsEl = document.querySelector("#openTabs");
	const memoryUsageEl = document.querySelector("#memoryUsage");
	// NEW: Get Live Stat Elements
	const currentSessionTimeEl = document.querySelector("#currentSessionTime");
	const currentActivityRatioEl = document.querySelector(
		"#currentActivityRatio",
	);
	// Get Historical Stat Elements
	const totalVisitsEl = document.querySelector("#totalVisits");
	const totalTimeEl = document.querySelector("#totalTime");
	// Get active tab domain
	const getDomain = async () => {
		try {
			const tabs = await app.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (!tabs[0] || !tabs[0].url) return null;
			const url = new URL(tabs[0].url);
			if (!url.hostname || !url.hostname.includes(".")) return null;
			return url.hostname;
		} catch (e) {
			return null;
		}
	};
	const currentDomain = await getDomain();
	// Update system stats (real-time)
	async function updateSystemStats() {
		try {
			// Get open tabs count
			const allTabs = await app.tabs.query({});
			openTabsEl.textContent = allTabs.length;
			// Get memory info
			if (chrome.system && chrome.system.memory) {
				const memInfo = await new Promise((resolve) => {
					chrome.system.memory.getInfo(resolve);
				});
				const usedMemory = memInfo.capacity - memInfo.availableCapacity;
				memoryUsageEl.textContent = `${formatMemory(usedMemory)} MB`;
			} else {
				memoryUsageEl.textContent = "N/A";
			}
		} catch (error) {
			console.log("System stats unavailable:", error);
			openTabsEl.textContent = "N/A";
			memoryUsageEl.textContent = "N/A";
		}
	}
	// Initial system stats update & interval
	updateSystemStats();
	setInterval(updateSystemStats, 2000);
	if (!currentDomain) {
		domainEl.textContent = "Browser Page";
		totalVisitsEl.textContent = "N/A";
		totalTimeEl.textContent = "N/A";
		currentSessionTimeEl.textContent = "N/A";
		currentActivityRatioEl.textContent = "N/A";
		logo.src = "/icons/128.png";
		return;
	}
	// Get domain aggregate data (Tier 1)
	const data = await app.storage.local.get("domain_aggregates");
	const aggregates = data.domain_aggregates || {};
	const domainHistory = aggregates[currentDomain] || {
		totalLife: 0,
		activeLife: 0,
		visitCount: 0,
	};
	setFaviconWithFallback(logo, currentDomain, 128);
	domainEl.textContent = currentDomain;
	// This function now *only* updates the stats.
	// Historical data is set once, live data is updated.
	function updateDomainStats(liveSessionData = null) {
		// 1. Set HISTORICAL data (Tier 1) - This doesn't change
		totalVisitsEl.textContent = domainHistory.visitCount;
		totalTimeEl.textContent = formatTime(
			Math.round(domainHistory.totalLife),
		);
		// 2. Set LIVE data
		if (liveSessionData && liveSessionData.sessionDuration > 0) {
			// Update Current Session Time
			currentSessionTimeEl.textContent = formatTime(
				Math.round(liveSessionData.sessionDuration),
			);
			// Update Live Activity Ratio
			const liveRatio = Math.floor(
				(liveSessionData.activeSession /
					liveSessionData.sessionDuration) *
					100,
			);
			currentActivityRatioEl.textContent = `${liveRatio}%`;
		} else {
			// No live data, show defaults
			currentSessionTimeEl.textContent = "0s";
			currentActivityRatioEl.textContent = "0%";
		}
	}
	// Initial update using only historical data
	// (Live data will be "0s" and "0%")
	updateDomainStats(null);
	// Update with current session data every second
	setInterval(async () => {
		try {
			const tabs = await app.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tabs[0] && tabs[0].id) {
				const response = await app.tabs.sendMessage(tabs[0].id, {
					type: "getSessionData",
				});
				if (response && response.sessionData) {
					// Pass the live data to our update function
					updateDomainStats(response.sessionData);
				}
			}
		} catch (error) {
			// Tab is not accessible (e.g., chrome://)
			// Reset live data to 0
			updateDomainStats(null);
		}
	}, 1000);
});
