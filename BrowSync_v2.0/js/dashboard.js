const app = chrome || browser;
const DB_NAME = "BrowSyncDB";
const DB_VERSION = 1;
const SESSION_STORE = "session_logs";
// ----------------------------------------
// IndexedDB Helper Functions
// ----------------------------------------
let dbPromise = null;
function openDB() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = (event) => {
			console.error("BrowSync IndexedDB error:", event.target.error);
			dbPromise = null; // Reset promise on error
			reject("IndexedDB error: " + event.target.error);
		};
		request.onsuccess = (event) => {
			// console.log("BrowSync IndexedDB opened successfully."); // Optional: for debugging
			resolve(event.target.result);
		};
		request.onupgradeneeded = (event) => {
			console.log("BrowSync IndexedDB upgrade needed.");
			const db = event.target.result;
			if (!db.objectStoreNames.contains(SESSION_STORE)) {
				const store = db.createObjectStore(SESSION_STORE, {
					autoIncrement: true,
				});
				store.createIndex("domain", "domain", {
					unique: false,
				});
				store.createIndex("sessionEnd", "sessionEnd", {
					unique: false,
				});
				store.createIndex("title", "title", {
					unique: false,
				}); // Index for searching
				console.log(
					"BrowSync IndexedDB object store created:",
					SESSION_STORE,
				);
			}
		};
	});
	return dbPromise;
}
// Helper to perform IndexedDB read operations safely
async function performDBRead(storeName, mode, operation) {
	try {
		const db = await openDB();
		const tx = db.transaction(storeName, mode);
		const store = tx.objectStore(storeName);
		const result = await operation(store);
		// Using await implicitly handles transaction completion/abortion for reads
		return result;
	} catch (error) {
		console.error(
			`IndexedDB read operation failed on ${storeName}:`,
			error,
		);
		throw error;
	}
}
// ----------------------------------------
// Formatters & Helpers
// ----------------------------------------
//
function formatTime(seconds) {
	if (isNaN(seconds) || seconds <= 0) return "0s";
	seconds = Math.round(seconds);
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	if (hrs > 0) return `${hrs}h ${mins}m`;
	if (mins > 0) return `${mins}m ${secs}s`;
	return `${secs}s`;
}
function formatTimestamp(unixTimestamp) {
	if (!unixTimestamp) return "—";
	const date = new Date(unixTimestamp * 1000);
	return date.toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}
function generateFallbackFavicon(domain, size = 64) {
	const initial = domain && domain[0] ? domain[0].toUpperCase() : "X";
	const fontSize = Math.floor(size * 0.45);
	const radius = Math.floor(size * 0.15);
	const svg = `
		<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
			<defs>
				<linearGradient id='g' x1='0' x2='1'>
					<stop offset='0' stop-color='#FF6B35'/>
					<stop offset='1' stop-color='#DC2626'/>
				</linearGradient>
			</defs>
			<rect width='100%' height='100%' rx='${radius}' fill='url(#g)' />
			<text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Inter, system-ui, sans-serif' font-size='${fontSize}' fill='#FFFFFF' font-weight='600'>${initial}</text>
		</svg>`;
	return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function setFaviconWithFallback(imgEl, domain, size = 64) {
	function isLikelyRemoteDomain(d) {
		if (!d) return false;
		if (/^(file|chrome-extension):/i.test(d)) return false;
		if (/^(127|10|192|0)\.|^localhost$|\.local$|\.test$/i.test(d))
			return false;
		if (!d.includes(".")) return false;
		if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(d)) return false;
		return true;
	}
	function generatePlaceholderSvg(s = size) {
		const radius = Math.floor(s * 0.15);
		return (
			"data:image/svg+xml;utf8," +
			encodeURIComponent(`
		<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 24 24'>
		  <rect width='24' height='24' rx='${
				(radius / s) * 24
			}' fill='var(--dark-border)' fill-opacity='0.5' />
		  <path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' fill='var(--dark-text-secondary)'/>
          <circle cx='12' cy='12' r='3' fill='var(--dark-text-secondary)'/>
        </svg>`)
		);
	}
	try {
		imgEl.src = generatePlaceholderSvg(size); // Start with placeholder
		//

		if (!domain || !isLikelyRemoteDomain(domain)) {
			imgEl.src = generateFallbackFavicon(domain, size);
			return;
		}
		// Try Google Favicons first
		imgEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
		imgEl.onerror = () => {
			// Google failed, try Clearbit
			imgEl.onerror = null;
			imgEl.src = `https://logo.clearbit.com/${domain}?size=${size}`;
			imgEl.onerror = () => {
				// Both failed, use gradient fallback
				imgEl.onerror = null;
				imgEl.src = generateFallbackFavicon(domain, size);
			};
		};
	} catch (err) {
		console.error("Favicon loading error for", domain, err);
		imgEl.src = generateFallbackFavicon(domain, size);
	}
}
// ----------------------------------------
// Charting Logic
// ----------------------------------------
const CATEGORY_KEYS = ["productivity", "entertainment", "other", "unknown"];
const CATEGORY_COLORS = {
	productivity: "#FF6B35",
	entertainment: "#DC2626",
	other: "#FF9153",
	unknown: "#6B7280",
};
const CATEGORY_LABELS = {
	productivity: "Productivity",
	entertainment: "Entertainment",
	other: "Other",
	unknown: "Unassigned",
};
function ensureCategoryShape(categories = {}) {
	const shaped = {};
	CATEGORY_KEYS.forEach((key) => {
		shaped[key] = Number(categories?.[key]) || 0;
	});
	return shaped;
}
function normalizeUsageTimeline(rawTimeline = {}) {
	const normalized = { hourly: {}, daily: {} };
	if (rawTimeline && typeof rawTimeline === "object") {
		if (rawTimeline.hourly && typeof rawTimeline.hourly === "object") {
			for (const [key, entry] of Object.entries(rawTimeline.hourly)) {
				const numericKey = Number(key);
				if (!Number.isNaN(numericKey)) {
					normalized.hourly[numericKey] = {
						total: Number(entry?.total) || 0,
						categories: ensureCategoryShape(entry?.categories),
					};
				}
			}
		}
		if (rawTimeline.daily && typeof rawTimeline.daily === "object") {
			for (const [key, entry] of Object.entries(rawTimeline.daily)) {
				const numericKey = Number(key);
				if (!Number.isNaN(numericKey)) {
					normalized.daily[numericKey] = {
						total: Number(entry?.total) || 0,
						categories: ensureCategoryShape(entry?.categories),
					};
				}
			}
		}
	}
	return normalized;
}
function buildHourlyBuckets(hourlyMap = {}, hours = 24) {
	const buckets = [];
	const now = new Date();
	const currentHourStartSeconds = Math.floor(now.getTime() / 3600000) * 3600;
	for (let i = hours - 1; i >= 0; i--) {
		const bucketStart = currentHourStartSeconds - i * 3600;
		const entry = hourlyMap[bucketStart] || {
			total: 0,
			categories: ensureCategoryShape(),
		};
		const labelDate = new Date(bucketStart * 1000);
		const label = labelDate.toLocaleTimeString([], {
			hour: "numeric",
			hour12: true,
		}); // Use AM/PM
		buckets.push({
			label,
			total: entry.total,
			categories: entry.categories,
			timestamp: bucketStart,
		});
	}
	return buckets;
}
// ** Replace entire function **
function buildDailyBuckets(dailyMap = {}, days = 7) {
	const buckets = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0); // Start of today in local time
	const todayTimestampMillis = today.getTime(); // Milliseconds timestamp for start of today

	// Loop backwards from 'days - 1' days ago up to today (i=0)
	for (let i = days - 1; i >= 0; i--) {
		// Calculate the timestamp for the start of the target day
		const targetDayTimestampMillis =
			todayTimestampMillis - i * 24 * 60 * 60 * 1000;
		const dayKey = Math.floor(targetDayTimestampMillis / 1000); // Convert to seconds for the key

		const dayDate = new Date(targetDayTimestampMillis); // Create Date object for labeling
		const label = dayDate.toLocaleDateString([], { weekday: "short" }); // Get the short weekday name

		// Get data for this dayKey, defaulting if not found
		const entry = dailyMap[dayKey] || {
			total: 0,
			categories: ensureCategoryShape(),
		};

		buckets.push({
			label,
			total: entry.total,
			categories: entry.categories,
			timestamp: dayKey, // Store the seconds timestamp
		});
	}
	return buckets;
}
function getPeakBucket(buckets = []) {
	return buckets.reduce(
		(peak, bucket) => (!peak || bucket.total > peak.total ? bucket : peak),
		null,
	);
}
function formatPercentage(part, total) {
	return total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";
}
function categoryLegendMarkup() {
	return CATEGORY_KEYS.map((key) => {
		return `<span class="category-chip"><span class="legend-dot" style="background:${CATEGORY_COLORS[key]};"></span>${CATEGORY_LABELS[key]}</span>`;
	}).join("");
}
// ** UPDATED generateUsageBarChart to use options.max **
// ** Replace entire function **
function generateUsageBarChart(buckets = [], options = {}) {
	const viewWidth = options.width || 560;
	const viewHeight = options.height || 100; // Keep consistent internal height
	const barGap = 4;
	const barRadius = 3;

	// *** FIX: Use provided max OR calculate from buckets ***
	const max = options.max || Math.max(...buckets.map((b) => b.total), 1);
	// *** END FIX ***

	const maxTimeForGradient = options.maxTimeForGradient || 8 * 3600;
	// No Math.floor, so bars fill the space precisely
	const barWidth = Math.max(
		2,
		(viewWidth - barGap * (buckets.length - 1)) /
			Math.max(1, buckets.length),
	);

	const barColor = options.barColor || "var(--accent-orange)";
	const trackColor = "var(--dark-border)"; // Matches CSS var
	const useGradient = options.useGradient || false;
	const ariaLabel = options.ariaLabel || "Usage chart";
	let svgDefs = "";
	if (useGradient) {
		svgDefs = `
            <defs>
                <linearGradient id="timeUsageGradient" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stop-color="#22c55e" />
                    <stop offset="33%" stop-color="#facc15" />
                    <stop offset="66%" stop-color="#f97316" />
                    <stop offset="100%" stop-color="#ef4444" />
                </linearGradient>
            </defs>
        `;
	}

	// Use viewHeight for viewBox, let CSS control rendered size
	let svgContent = `<svg class="usage-chart" width="100%" height="100%" viewBox="0 0 ${viewWidth} ${viewHeight}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ariaLabel}" preserveAspectRatio="none">`;
	svgContent += svgDefs;

	buckets.forEach((bucket, index) => {
		const x = index * (barWidth + barGap);
		const totalSeconds = bucket.total || 0;
		// ** Height calculation MUST use the determined 'max' relative to internal viewHeight **
		let height =
			totalSeconds > 0
				? Math.max(1, (totalSeconds / max) * viewHeight) // Use max here
				: 0;
		height = Math.min(height, viewHeight); // Cap height
		const y = viewHeight - height; // Position from bottom

		const categories = encodeURIComponent(
			JSON.stringify(bucket.categories || {}),
		);
		const label = encodeURIComponent(bucket.label || "");
		const title = encodeURIComponent(
			`${bucket.label || "Time"} • ${formatTime(totalSeconds)}`,
		);

		// Background track - DRAWN TO FULL viewHeight
		svgContent += `<rect x="${x}" y="0" width="${barWidth}" height="${viewHeight}" rx="${barRadius}" fill="${trackColor}" class="chart-bar-track" />`;

		// Foreground data bar
		let fillStyle = barColor;
		if (useGradient) {
			fillStyle = "url(#timeUsageGradient)";
		}

		svgContent += `<rect class="usage-bar ${
			useGradient ? "time-gradient-bar" : ""
		}" data-label="${label}" data-title="${title}" data-total="${totalSeconds}" data-cats="${categories}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="${barRadius}" fill="${fillStyle}" />`;
	});

	svgContent += "</svg>";
	return svgContent;
}
// ** UPDATED attachUsageTooltips (Hover on Track Area) **
// ** Replace entire function **
function attachUsageTooltips(containerSelector) {
	const container = document.querySelector(containerSelector);
	if (!container) {
		console.warn("Tooltip container not found:", containerSelector);
		return;
	}

	let tip = document.getElementById("usage-chart-tooltip");
	if (!tip) {
		tip = document.createElement("div");
		tip.id = "usage-chart-tooltip";
		tip.style.position = "absolute";
		tip.style.display = "none";
		tip.style.zIndex = "9999";
		document.body.appendChild(tip);
	}

	// Helper to find bar, **with index clamping**
	function getBarFromEvent(event) {
		const svg = event.target.closest(".usage-chart");
		if (!svg) return null;

		const rect = svg.getBoundingClientRect();
		const barsNodeList = svg.querySelectorAll(".usage-bar");
		const numBars = barsNodeList.length;
		if (numBars === 0) return null;

		const mouseX = event.clientX - rect.left;
		const svgWidth = rect.width;

		const firstBar = barsNodeList[0];
		const lastBar = barsNodeList[numBars - 1];
		if (!firstBar || !lastBar) return null;

		const firstBarX = parseFloat(firstBar.getAttribute("x") || "0");
		const lastBarX = parseFloat(lastBar.getAttribute("x") || "0");
		const lastBarWidth = parseFloat(lastBar.getAttribute("width") || "0");
		// Ensure totalBarsWidth is at least 1 to avoid division by zero
		const totalBarsWidth = Math.max(1, lastBarX + lastBarWidth - firstBarX);

		// Compare pixels to pixels for an accurate index
		//const svgWidth = rect.width; // Use the pixel width
		let estimatedIndex = Math.floor((mouseX / svgWidth) * numBars);

		// ** Clamp the index to be within valid bounds [0, numBars - 1] **
		const barIndex = Math.max(0, Math.min(estimatedIndex, numBars - 1));

		return barsNodeList[barIndex] || null;
	}

	// Event listeners using the corrected getBarFromEvent
	// Event delegation on the container
	container.addEventListener("mousemove", (event) => {
		const bar = getBarFromEvent(event); // Find the bar under the cursor

		if (bar) {
			// --- Populate Tooltip Content ---
			const label = decodeURIComponent(
				bar.getAttribute("data-label") || "",
			);
			const total = Number(bar.getAttribute("data-total") || 0);
			let parsedCats = {};
			try {
				parsedCats = JSON.parse(
					decodeURIComponent(
						bar.getAttribute("data-cats") || "%7B%7D",
					),
				);
			} catch (_) {}
			parsedCats = ensureCategoryShape(parsedCats);

			// *** FIX: Changed filter threshold from > 0.1 to > 0 ***
			const lines = CATEGORY_KEYS.filter((key) => parsedCats[key] > 0) // Show all non-zero values
				.sort((a, b) => parsedCats[b] - parsedCats[a])
				.map((key) => {
					const value = Math.round(parsedCats[key] || 0);
					// Ensure tiny values still format reasonably (e.g., "1s" instead of "0m 1s")
					const formattedValue =
						value < 60 && value > 0
							? `${value}s`
							: formatTime(value);
					return `<div class="tooltip-line"><span class="legend-dot" style="background:${
						CATEGORY_COLORS[key]
					};"></span><span>${
						CATEGORY_LABELS[key]
					}</span><strong>${formattedValue}</strong><span class="tooltip-share">${formatPercentage(
						value,
						total,
					)}</span></div>`;
				});
			// *** END FIX ***

			const fallbackLine =
				'<div class="tooltip-line muted">No activity tracked</div>'; // Updated fallback text slightly

			tip.innerHTML = `
                <div class="tooltip-heading">${label || "Time Period"}</div>
                <div class="tooltip-total">${formatTime(total)}</div>
                <div class="tooltip-breakdown">${
					lines.length ? lines.join("") : fallbackLine
				}</div>
            `;
			// --- End Content Population ---

			tip.style.display = "block";
			positionTooltip(event.pageX, event.pageY, tip); // Position based on mouse event
		} else {
			// If not hovering over a valid bar area, hide the tooltip
			tip.style.display = "none";
		}
	});

	// ... (rest of attachUsageTooltips function is the same) ...

	container.addEventListener("mouseleave", () => {
		tip.style.display = "none";
	});

	// Positioning helper (remains the same)
	function positionTooltip(mouseX, mouseY, tooltipElement) {
		const offset = 15;
		let topPos = mouseY + offset;
		let leftPos = mouseX + offset;
		const tipRect = tooltipElement.getBoundingClientRect();

		if (topPos + tipRect.height > window.innerHeight + window.scrollY) {
			topPos = mouseY - tipRect.height - offset;
		}
		if (leftPos + tipRect.width > window.innerWidth + window.scrollX) {
			leftPos = mouseX - tipRect.width - offset;
		}
		if (topPos < window.scrollY) {
			topPos = window.scrollY + 5;
		}
		if (leftPos < window.scrollX) {
			leftPos = window.scrollX + 5;
		}

		tooltipElement.style.left = `${Math.round(leftPos)}px`;
		tooltipElement.style.top = `${Math.round(topPos)}px`;
	}
}
// ----------------------------------------
// Main Dashboard Rendering
// ----------------------------------------
//
document.addEventListener("DOMContentLoaded", async () => {
	// Cache UI elements
	const elements = {
		// ... (keep previous elements)
		chart30d: document.getElementById("chart30d"),
		chart30dSubtitle: document.getElementById("chart30dSubtitle"),
		chart30dRange: document.getElementById("chart30dRange"),
		chart30dFooter: document.getElementById("chart30dFooter"),
		// ... (rest of elements)
		dailyScoreValue: document.getElementById("dailyScoreValue"),
		dailyScoreMessage: document.getElementById("dailyScoreMessage"),
		todayTime: document.getElementById("todayTime"),
		todayContextSwitches: document.getElementById("todayContextSwitches"),
		todayDistractionSwitches: document.getElementById(
			"todayDistractionSwitches",
		),
		categoryLegend: document.getElementById("categoryLegend"),
		chart24h: document.getElementById("chart24h"),
		chart24hSubtitle: document.getElementById("chart24hSubtitle"),
		chart24hRange: document.getElementById("chart24hRange"),
		chart24hFooter: document.getElementById("chart24hFooter"),
		chart7d: document.getElementById("chart7d"),
		chart7dSubtitle: document.getElementById("chart7dSubtitle"),
		chart7dRange: document.getElementById("chart7dRange"),
		chart7dFooter: document.getElementById("chart7dFooter"),
		searchInput: document.getElementById("searchInput"),
		searchResults: document.getElementById("searchResults"),
		top5ListTime: document.getElementById("top5ListTime"),
		top5ListVisits: document.getElementById("top5ListVisits"),
		domainFilterInput: document.getElementById("domainFilterInput"),
		sortSelect: document.getElementById("sortSelect"),
		domainTableBody: document.getElementById("domainTableBody"),
		archiveList: document.getElementById("archiveList"),
		refreshBtn: document.getElementById("refreshBtn"),
		themeToggle: document.getElementById("themeToggle"),
	};
	// Global state
	let allDomainAggregates = {};
	let filteredDomainKeys = [];
	let currentSortKey = "totalLife"; // Default sort to Time
	let currentFilterTerm = "";
	/** Renders Priority 1: Today's Snapshot */
	function renderTodaySnapshot(stats = {}, timeline = {}) {
		stats = stats || {};
		timeline = timeline || {};
		if (elements.dailyScoreValue)
			elements.dailyScoreValue.textContent = Math.round(
				stats.dailyScore || 0,
			);
		if (elements.dailyScoreMessage) {
			let msg = "Start browsing to see your score.";
			if (stats.totalVisits > 0) {
				// Only give feedback if data exists
				if (stats.dailyScore > 75) msg = "Excellent focus today! 🎉";
				else if (stats.dailyScore > 25)
					msg = "Good focus, keep it up. 👍";
				else if (stats.dailyScore < -20)
					msg = "Lots of switches. Try to refocus. 🤔";
				else msg = "Balanced activity today.";
			}
			elements.dailyScoreMessage.textContent = msg;
		}
		if (elements.todayContextSwitches)
			elements.todayContextSwitches.textContent =
				stats.contextSwitches || 0;
		if (elements.todayDistractionSwitches)
			elements.todayDistractionSwitches.textContent =
				stats.distractionSwitches || 0;
		let todayTotalSeconds = 0;
		try {
			const dailyMap =
				timeline && typeof timeline.daily === "object"
					? timeline.daily
					: {};
			const todayBuckets = buildDailyBuckets(dailyMap, 1);
			if (Array.isArray(todayBuckets) && todayBuckets.length > 0) {
				todayTotalSeconds = todayBuckets[0]?.total || 0;
			}
		} catch (err) {
			console.error("Error calculating today's time:", err);
		}
		if (elements.todayTime)
			elements.todayTime.textContent = formatTime(todayTotalSeconds);
	}
	/** Renders Priority 2: Recent Activity (Charts & Legend) **(Corrected Scaling)** */
	// ** Replace entire function **
	function renderRecentActivity(timeline = {}) {
		timeline = timeline || {};
		if (elements.categoryLegend)
			elements.categoryLegend.innerHTML = categoryLegendMarkup();

		const hourlyMap =
			timeline.hourly && typeof timeline.hourly === "object"
				? timeline.hourly
				: {};
		const dailyMap =
			timeline.daily && typeof timeline.daily === "object"
				? timeline.daily
				: {};

		// --- 24 Hour Chart ---
		const last24Buckets = buildHourlyBuckets(hourlyMap, 24);
		const peakHour = getPeakBucket(last24Buckets);
		if (elements.chart24h) {
			elements.chart24h.innerHTML = generateUsageBarChart(last24Buckets, {
				barColor: CATEGORY_COLORS.productivity,
				ariaLabel: "Last 24 hours usage",
				// No 'max' needed - scales to its own peak
				// No 'height' needed - controlled by CSS
			});
		}
		if (elements.chart24hSubtitle)
			elements.chart24hSubtitle.textContent = peakHour?.total
				? `Peak around ${peakHour.label}`
				: "No activity yet";
		if (elements.chart24hRange && last24Buckets.length > 0)
			elements.chart24hRange.textContent = `${last24Buckets[0].label} – ${
				last24Buckets[last24Buckets.length - 1].label
			}`;
		if (elements.chart24hFooter)
			elements.chart24hFooter.textContent = peakHour?.total
				? `${formatTime(peakHour.total)} during ${peakHour.label}`
				: "No time recorded";

		// --- 7 Day Chart ---
		const last7Buckets = buildDailyBuckets(dailyMap, 7);
		const peakDay7 = getPeakBucket(last7Buckets);
		if (elements.chart7d) {
			elements.chart7d.innerHTML = generateUsageBarChart(last7Buckets, {
				barColor: CATEGORY_COLORS.entertainment,
				// 'max' is removed to enable auto-scaling
				ariaLabel: "Last 7 days usage",
			});
		}
		if (elements.chart7dSubtitle)
			elements.chart7dSubtitle.textContent = peakDay7?.total
				? `Highest on ${peakDay7.label}`
				: "No activity yet";
		if (elements.chart7dRange && last7Buckets.length > 0)
			elements.chart7dRange.textContent = `${last7Buckets[0].label} – ${
				last7Buckets[last7Buckets.length - 1].label
			}`;
		if (elements.chart7dFooter)
			elements.chart7dFooter.textContent = peakDay7?.total
				? `${formatTime(peakDay7.total)} on ${peakDay7.label}`
				: "No time recorded";

		// --- 30 Day Chart ---
		const last30Buckets = buildDailyBuckets(dailyMap, 30);
		const peakDay30 = getPeakBucket(last30Buckets);
		const totalMonthSeconds = last30Buckets.reduce(
			(sum, b) => sum + (b.total || 0),
			0,
		);
		if (elements.chart30d) {
			elements.chart30d.innerHTML = generateUsageBarChart(last30Buckets, {
				useGradient: false, // Gradient removed as requested
				barColor: CATEGORY_COLORS.other, // Use 'other' color
				// 'max' is removed to enable auto-scaling
				ariaLabel: "Last 30 days usage",
			});
		}
		if (elements.chart30dSubtitle)
			elements.chart30dSubtitle.textContent = peakDay30?.total
				? `Top day ${peakDay30.label}`
				: "No activity yet";
		if (elements.chart30dRange && last30Buckets.length > 0) {
			const firstDate = new Date(last30Buckets[0].timestamp * 1000);
			const lastDate = new Date(
				last30Buckets[last30Buckets.length - 1].timestamp * 1000,
			);
			elements.chart30dRange.textContent = `${firstDate.toLocaleDateString(
				[],
				{ month: "short", day: "numeric" },
			)} – ${lastDate.toLocaleDateString([], {
				month: "short",
				day: "numeric",
			})}`;
		}
		if (elements.chart30dFooter)
			elements.chart30dFooter.textContent =
				totalMonthSeconds > 0
					? `${formatTime(totalMonthSeconds)} tracked this month`
					: "No time recorded";

		// Attach tooltips
		attachUsageTooltips("#recent-activity");
	}
	/** Performs IndexedDB search */
	async function performSearch(query) {
		if (!elements.searchResults) return;
		query = query.trim().toLowerCase();
		if (!query || query.length < 3) {
			elements.searchResults.innerHTML = "";
			return;
		}
		elements.searchResults.innerHTML = `<p class="search-loading card-subtitle">Searching...</p>`;
		try {
			const sessions = await performDBRead(
				SESSION_STORE,
				"readonly",
				async (store) => {
					const index = store.index("title");
					let cursor = await index.openCursor(); // Iterate all
					const results = [];
					const MAX_RESULTS = 50;
					while (cursor && results.length < MAX_RESULTS) {
						if (
							cursor.value.title &&
							cursor.value.title.toLowerCase().includes(query)
						) {
							results.push(cursor.value);
						}
						cursor = await cursor.continue();
					}
					return results.sort((a, b) => b.sessionEnd - a.sessionEnd); // Sort by recency
				},
			);
			renderSearchResults(sessions);
		} catch (error) {
			console.error("Search failed:", error);
			elements.searchResults.innerHTML = `<p class="search-no-results card-subtitle">Error during search.</p>`;
		}
	}
	/** Renders search results */
	function renderSearchResults(sessions = []) {
		if (!elements.searchResults) return;
		if (sessions.length === 0) {
			elements.searchResults.innerHTML = `<p class="search-no-results card-subtitle">No sessions found matching your query.</p>`;
			return;
		}
		elements.searchResults.innerHTML = sessions
			.map((session) => {
				const activeRatio =
					session.sessionDuration > 0
						? Math.round(
								(session.activeSession /
									session.sessionDuration) *
									100,
						  )
						: 0;
				const safeTitle = session.title
					? session.title.replace(/</g, "&lt;").replace(/>/g, "&gt;")
					: "Untitled";
				const safeUrl = session.url
					? session.url.replace(/</g, "&lt;").replace(/>/g, "&gt;")
					: "#";
				return `
			<a class="search-result-item" href="${safeUrl}" target="_blank" title="Open: ${safeUrl}\nStarted: ${formatTimestamp(
					session.sessionStart,
				)}">
				<div class="search-result-info">
					<span class="search-result-title">${safeTitle}</span>
					<span class="search-result-url">${session.domain || "Unknown Domain"}</span>
				</div>
				<div class="search-result-stats">
					<span class="search-result-duration">${formatTime(
						session.sessionDuration,
					)}</span>
					<span class="search-result-activity">${activeRatio}% Act.</span>
				</div>
			</a>`;
			})
			.join("");
	}
	/** Creates HTML for a single item in the "Top Sites" list **(Corrected)** */
	function createTopSiteListItem(domain, data, maxValue, type = "time") {
		const value =
			type === "time" ? data.totalLife || 0 : data.visitCount || 0;
		const percentage = Math.min(
			100,
			Math.max(0, (value / (maxValue || 1)) * 100),
		);
		const item = document.createElement("a");
		item.className = "top-site-item";
		item.href = `/website.html?domain=${encodeURIComponent(domain)}`;
		item.target = "_blank";
		item.title = `View details for ${domain}`;
		// Using innerHTML for structure matching CSS
		item.innerHTML = `
            <div class="top-site-content">
                <img class="top-site-icon" alt="" loading="lazy">
                <div class="top-site-info">
                    <span class="top-site-name">${domain}</span>
                    <span class="top-site-value">${
						type === "time" ? formatTime(value) : `${value} visits`
					}</span>
                </div>
            </div>
            <div class="top-site-progress-track">
                <div class="top-site-progress-bar" style="width: ${percentage}%; min-width: ${
			percentage > 0 ? "4px" : "0"
		};"></div>
            </div>
        `;
		// Set favicon after structure is created
		setFaviconWithFallback(
			item.querySelector(".top-site-icon"),
			domain,
			24,
		);
		return item;
	}
	/** Renders the main domain table */
	function renderDomainTable() {
		if (!elements.domainTableBody) return;
		// 1. Filter
		const searchTerm = currentFilterTerm.toLowerCase();
		filteredDomainKeys = Object.keys(allDomainAggregates).filter((domain) =>
			domain.toLowerCase().includes(searchTerm),
		);
		// 2. Sort
		filteredDomainKeys.sort((a, b) => {
			const dataA = allDomainAggregates[a];
			const dataB = allDomainAggregates[b];
			switch (currentSortKey) {
				case "totalLife":
					return (dataB.totalLife || 0) - (dataA.totalLife || 0);
				case "visitCount":
					return (dataB.visitCount || 0) - (dataA.visitCount || 0);
				case "lastVisit":
					return (dataB.lastVisit || 0) - (dataA.lastVisit || 0);
				case "alphabetical":
				default:
					return a.localeCompare(b);
			}
		});
		// 3. Render
		elements.domainTableBody.innerHTML = ""; // Clear previous
		if (filteredDomainKeys.length === 0) {
			elements.domainTableBody.innerHTML = `<tr><td colspan="9" class="table-empty-state card-subtitle">No domains found${
				searchTerm ? " matching filter" : ""
			}.</td></tr>`;
			return;
		}
		const fragment = document.createDocumentFragment();
		filteredDomainKeys.forEach((domain) => {
			const data = allDomainAggregates[domain] || {};
			const activeRatio =
				data.totalLife > 0
					? Math.round((data.activeLife / data.totalLife) * 100)
					: 0;
			const categoryDisplay =
				data.userCategory || data.category || "unknown";
			const tr = document.createElement("tr");
			tr.title = `Click to view details for ${domain}`;
			// Ensure all data fields are accessed safely with fallbacks
			tr.innerHTML = `
				<td class="domain-cell">
					<img class="domain-icon" alt="" loading="lazy" width="20" height="20">
					<span>${domain}</span>
				</td>
				<td>${CATEGORY_LABELS[categoryDisplay] || categoryDisplay}</td>
				<td>${formatTime(data.totalLife || 0)}</td>
				<td>${formatTime(data.activeLife || 0)}</td>
				<td>${activeRatio}%</td>
				<td>${data.visitCount || 0}</td>
				<td>${data.clicks || 0}</td>
				<td>${data.tabSwitches || 0}</td>
				<td>${formatTimestamp(data.lastVisit)}</td>
			`;
			setFaviconWithFallback(
				tr.querySelector(".domain-icon"),
				domain,
				20,
			);
			tr.onclick = () =>
				window.open(
					`/website.html?domain=${encodeURIComponent(domain)}`,
				);
			fragment.appendChild(tr);
		});
		elements.domainTableBody.appendChild(fragment);
	}
	/** Renders Priority 4: My Habits **(Corrected)** */
	function renderMyHabits(aggregates = {}) {
		allDomainAggregates = aggregates; // Store globally
		const domainKeys = Object.keys(aggregates);
		// Clear placeholders
		elements.top5ListTime.innerHTML = `<p class="empty-list-state card-subtitle">No time data yet.</p>`;
		elements.top5ListVisits.innerHTML = `<p class="empty-list-state card-subtitle">No visit data yet.</p>`;
		if (domainKeys.length > 0) {
			// --- Top 5 by Time ---
			const sortedByTime = [...domainKeys]
				.sort(
					(a, b) =>
						(aggregates[b].totalLife || 0) -
						(aggregates[a].totalLife || 0),
				)
				.slice(0, 5);
			const maxTime = aggregates[sortedByTime[0]]?.totalLife || 1; // Use the actual max time for scaling
			if (sortedByTime.length > 0 && maxTime > 0) {
				elements.top5ListTime.innerHTML = ""; // Clear placeholder
				sortedByTime.forEach((domain) =>
					elements.top5ListTime.appendChild(
						createTopSiteListItem(
							domain,
							aggregates[domain],
							maxTime,
							"time",
						),
					),
				);
			}
			// --- Top 5 by Visits ---
			const sortedByVisits = [...domainKeys]
				.sort(
					(a, b) =>
						(aggregates[b].visitCount || 0) -
						(aggregates[a].visitCount || 0),
				)
				.slice(0, 5);
			const maxVisits = aggregates[sortedByVisits[0]]?.visitCount || 1; // Use actual max visits
			if (sortedByVisits.length > 0 && maxVisits > 0) {
				elements.top5ListVisits.innerHTML = ""; // Clear placeholder
				sortedByVisits.forEach((domain) =>
					elements.top5ListVisits.appendChild(
						createTopSiteListItem(
							domain,
							aggregates[domain],
							maxVisits,
							"visits",
						),
					),
				);
			}
		}
		// --- Render Full Domain Table ---
		renderDomainTable(); // Call after setting allDomainAggregates
	}
	/** Renders Priority 5: Historical Archive */
	function renderArchive(archive = {}) {
		if (!elements.archiveList) return;
		const sortedMonths = Object.keys(archive).sort().reverse();
		if (sortedMonths.length === 0) {
			elements.archiveList.innerHTML = `<p class="card-subtitle">No archived data yet.</p>`;
			return;
		}
		elements.archiveList.innerHTML = sortedMonths
			.map((monthKey) => {
				const data = archive[monthKey];
				const date = new Date(`${monthKey}-02T00:00:00`);
				const monthName = date.toLocaleString("default", {
					month: "long",
					year: "numeric",
				});
				const topDomain = data.top5Domains?.[0]?.domain || "N/A";
				const topTime = data.top5Domains?.[0]?.time
					? formatTime(data.top5Domains[0].time)
					: "";
				return `
			<div class="archive-item">
				<strong class="archive-month">${monthName}</strong>
				<span class="archive-stat" title="Total Time Tracked">Total: ${formatTime(
					data.totalTime,
				)}</span>
				<span class="archive-stat" title="Average Activity Ratio">Activity: ${
					data.avgActivityRatio
				}%</span>
				<span class="archive-stat" title="Most Visited Domain">Top Site: ${topDomain} ${
					topTime ? `(${topTime})` : ""
				}</span>
			</div>`;
			})
			.join("");
	}
	/** Main function to load all data */
	async function loadDashboard() {
		try {
			currentSortKey = elements.sortSelect
				? elements.sortSelect.value
				: "totalLife";
			const [storageData] = await Promise.all([
				app.storage.local.get([
					"global_stats",
					"domain_aggregates",
					"usage_timeline",
					"archive_summary",
				]),
				openDB(),
			]);
			const globalStats = storageData.global_stats || {};
			const domainAggregates = storageData.domain_aggregates || {};
			const usageTimeline = normalizeUsageTimeline(
				storageData.usage_timeline,
			); // Ensure data is clean
			const archiveSummary = storageData.archive_summary || {};
			renderTodaySnapshot(globalStats, usageTimeline);
			renderRecentActivity(usageTimeline); // This now renders all 3 charts
			renderMyHabits(domainAggregates);
			renderArchive(archiveSummary);
		} catch (error) {
			console.error("Failed to load dashboard:", error);
			const container = document.querySelector(".container");
			if (container) {
				container.innerHTML = `<div class="card error-card"><h2>Error Loading Dashboard</h2><p class="card-subtitle">Could not load browsing data. Try refreshing. Check console for details.</p><button id="errorRefreshBtn" class="btn-primary">Refresh</button></div>`;
				document
					.getElementById("errorRefreshBtn")
					?.addEventListener("click", () => window.location.reload());
			}
		}
	}
	// ----------------------------------------
	// Event Listeners Setup
	// ----------------------------------------
	if (elements.refreshBtn)
		elements.refreshBtn.addEventListener("click", () =>
			window.location.reload(),
		);
	if (elements.themeToggle) {
		elements.themeToggle.addEventListener("click", () => {
			const isDark = document.documentElement.classList.toggle("dark");
			localStorage.setItem("theme", isDark ? "dark" : "light");
		});
	}
	let searchTimeout;
	if (elements.searchInput) {
		elements.searchInput.addEventListener("input", (e) => {
			clearTimeout(searchTimeout);
			const query = e.target.value;
			searchTimeout = setTimeout(() => {
				performSearch(query);
			}, 350);
		});
	}
	if (elements.domainFilterInput) {
		elements.domainFilterInput.addEventListener("input", (e) => {
			currentFilterTerm = e.target.value; // Store filter term
			renderDomainTable(); // Re-render table
		});
	}
	if (elements.sortSelect) {
		elements.sortSelect.addEventListener("change", (e) => {
			currentSortKey = e.target.value; // Store sort key
			renderDomainTable(); // Re-render table
		});
	}
	// --- Initial Load ---
	loadDashboard();
});
