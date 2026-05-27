const app = chrome || browser;
const DB_NAME = "BrowSyncDB";
const DB_VERSION = 1;
const SESSION_STORE = "session_logs";
// ----------------------------------------
// IndexedDB Helper Functions (Copied from dashboard.js)
// ----------------------------------------
let dbPromise = null;
function openDB() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		/* ... same openDB logic ... */
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = (event) => {
			console.error("Website.js IndexedDB error:", event.target.error);
			dbPromise = null;
			reject("IndexedDB error");
		};
		request.onsuccess = (event) => {
			resolve(event.target.result);
		};
		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains(SESSION_STORE)) {
				// Read-only pages should not create the store, but handle the case where it might not exist yet
				console.warn(
					"Website.js: Session store not found during upgrade - this might happen on first load.",
				);
				// Optionally, could try to create it here as well, but background.js should handle it.
			}
		};
	});
	return dbPromise;
}
// ** Replace entire function **
// Helper to perform IndexedDB read operations safely
async function performDBRead(storeName, mode, operation) {
	try {
		const db = await openDB(); // Ensure DB connection is ready
		const tx = db.transaction(storeName, mode);
		const store = tx.objectStore(storeName);
		// ** FIX: Await the actual result of the operation on the store/index **
		// The 'operation' function should return the IDBRequest
		const request = await operation(store); // e.g., operation returns store.index('domain').getAll(range)
		//
		// Return a new promise that resolves/rejects based on the IDBRequest
		const result = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		// ** END FIX **
		//
		// Optional: Wait for transaction to complete (good practice, though often implicitly handled)
		// await tx.complete; // Dexie-like syntax, might not be needed depending on native promise handling
		//
		return result; // Return the actual data (e.g., the array from getAll)
		//
	} catch (error) {
		console.error(`IndexedDB operation failed on ${storeName}:`, error);
		throw error; // Re-throw
	}
}
// ----------------------------------------
// Formatters & Helpers (Copied from dashboard.js)
// ----------------------------------------
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
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}
function formatUrlForDisplay(url, maxLength = 50) {
	if (!url) return "N/A";
	try {
		const parsedUrl = new URL(url);
		// Remove protocol and www. for display, show path
		let displayUrl =
			parsedUrl.hostname.replace(/^www\./, "") +
			parsedUrl.pathname +
			parsedUrl.search;
		// Truncate if too long
		if (displayUrl.length > maxLength) {
			return displayUrl.substring(0, maxLength - 1) + "…";
		}
		return displayUrl;
	} catch (e) {
		// Fallback for invalid URLs
		return url.length > maxLength
			? url.substring(0, maxLength - 1) + "…"
			: url;
	}
}
// Favicon Logic (Copied from dashboard.js)
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
// Category Labels (Copied from dashboard.js)
const CATEGORY_LABELS = {
	productivity: "Productivity",
	entertainment: "Entertainment",
	other: "Other",
	unknown: "Unassigned",
};
// ----------------------------------------
// Main Logic
// ----------------------------------------
document.addEventListener("DOMContentLoaded", async function () {
	// --- Get UI Elements ---
	const elements = {
		domainLogo: document.getElementById("domainLogo"),
		domainName: document.getElementById("domainName"),
		totalTimeSpent: document.getElementById("totalTimeSpent"),
		totalVisits: document.getElementById("totalVisits"),
		activeTime: document.getElementById("activeTime"),
		activityRatio: document.getElementById("activityRatio"),
		totalClicks: document.getElementById("totalClicks"),
		totalTabSwitches: document.getElementById("totalTabSwitches"),
		lastVisit: document.getElementById("lastVisit"),
		sessionTableBody: document.getElementById("sessionTableBody"),
		blacklist: document.getElementById("blacklist"),
		usageReminder: document.getElementById("usageReminder"),
		categoryOverride: document.getElementById("categoryOverride"),
		themeToggle: document.getElementById("themeToggle"),
	};
	// --- Get Domain from URL ---
	const urlParams = new URLSearchParams(window.location.search);
	const domain = urlParams.get("domain");
	if (!domain) {
		elements.domainName.textContent = "Error: Domain not specified.";
		document.querySelector(".main-content").innerHTML =
			'<p class="error-message card-subtitle">No domain provided in the URL. Please go back to the dashboard and click on a domain.</p>';
		return;
	}
	elements.domainName.textContent = domain;
	setFaviconWithFallback(elements.domainLogo, domain, 64);
	try {
		// --- Load Aggregate Data (Tier 1) ---
		const storageData = await app.storage.local.get(["domain_aggregates"]);
		const aggregates = storageData.domain_aggregates || {};
		const domainData = aggregates[domain] || {};
		// --- Display Aggregate Stats ---
		elements.totalTimeSpent.textContent = formatTime(
			domainData.totalLife || 0,
		);
		elements.totalVisits.textContent = domainData.visitCount || 0;
		elements.activeTime.textContent = formatTime(
			domainData.activeLife || 0,
		);
		const ratio =
			domainData.totalLife > 0
				? Math.round(
						(domainData.activeLife / domainData.totalLife) * 100,
				  )
				: 0;
		elements.activityRatio.textContent = `${ratio}%`;
		elements.totalClicks.textContent = domainData.clicks || 0;
		elements.totalTabSwitches.textContent = domainData.tabSwitches || 0;
		elements.lastVisit.textContent = formatTimestamp(domainData.lastVisit);
		// --- Load Settings ---
		const settingsData = await app.storage.local.get([domain]);
		const domainSettings = settingsData[domain] || {};
		elements.blacklist.value = domainSettings.blacklist || "no";
		elements.usageReminder.value = domainSettings.usageReminder || "never";
		elements.categoryOverride.value = domainData.userCategory || "auto";
		// --- Load Session History (Tier 2 - IndexedDB) ---
		elements.sessionTableBody.innerHTML = `<tr><td colspan="9" class="table-empty-state card-subtitle">Loading recent sessions...</td></tr>`;
		const recentSessionsResult = await performDBRead(
			SESSION_STORE,
			"readonly",
			async (store) => {
				const index = store.index("domain");
				const range = IDBKeyRange.only(domain);
				// This returns the IDBRequest
				return index.getAll(range);
			},
		);
		// --- Process and Render Session History ---
		// ** CORRECTED LOGIC BLOCK **
		if (Array.isArray(recentSessionsResult)) {
			// Sort by sessionEnd timestamp descending
			recentSessionsResult.sort(
				(a, b) => (b.sessionEnd || 0) - (a.sessionEnd || 0),
			);
			const limitedSessions = recentSessionsResult.slice(0, 100); // Limit to latest 100
			//
			if (limitedSessions.length > 0) {
				// Render using the limited and sorted array
				elements.sessionTableBody.innerHTML = limitedSessions
					.map((session, index) => {
						const duration = session.sessionDuration || 0;
						const active = session.activeSession || 0;
						const sessionRatio =
							duration > 0
								? Math.round((active / duration) * 100)
								: 0;
						const safeTitle = session.title
							? session.title
									.replace(/</g, "&lt;")
									.replace(/>/g, "&gt;")
							: "Untitled";
						const safeUrl = session.url
							? session.url
									.replace(/</g, "&lt;")
									.replace(/>/g, "&gt;")
							: "#";
						return `
                        <tr>
                            <td>${index + 1}</td>
                            <td title="${safeTitle}">${
							safeTitle.length > 60
								? safeTitle.substring(0, 57) + "..."
								: safeTitle
						}</td>
                            <td><a href="${safeUrl}" target="_blank" title="${safeUrl}">${formatUrlForDisplay(
							session.url,
						)}</a></td>
                            <td>${formatTimestamp(session.sessionStart)}</td>
                            <td>${formatTime(duration)}</td>
                            <td>${formatTime(active)}</td>
                            <td>${sessionRatio}%</td>
                            <td>${session.clicks || 0}</td>
                            <td>${session.tabSwitches || 0}</td>
                        </tr>
                    `;
					})
					.join("");
			} else {
				elements.sessionTableBody.innerHTML = `<tr><td colspan="9" class="table-empty-state card-subtitle">No recent session history found for this domain (last 30 days).</td></tr>`;
			}
		} else {
			// Handle the case where IndexedDB didn't return an array
			console.warn(
				"IndexedDB query did not return an array for domain:",
				domain,
				recentSessionsResult,
			);
			elements.sessionTableBody.innerHTML = `<tr><td colspan="9" class="table-empty-state card-subtitle">Error loading session history.</td></tr>`;
		}
		// ** END CORRECTED LOGIC BLOCK - Redundant block removed **
		//
	} catch (error) {
		console.error("Failed to load domain details:", error);
		elements.domainName.textContent = `Error loading: ${domain}`;
		// More specific error display
		const errorMsg = error instanceof Error ? error.message : String(error);
		document.querySelector(
			".main-content",
		).innerHTML = `<p class="error-message card-subtitle">Could not load data for this domain. Error: ${errorMsg}</p>`;
	}
	// ----------------------------------------
	// Event Listeners for Settings (Remain the same)
	// ----------------------------------------
	async function saveDomainSetting(key, value) {
		/* ... */
	}
	async function saveAggregateSetting(key, value) {
		/* ... */
	}
	elements.blacklist.addEventListener("change", function () {
		/* ... */
	});
	elements.usageReminder.addEventListener("change", function () {
		/* ... */
	});
	elements.categoryOverride.addEventListener("change", function () {
		/* ... */
	});
	if (elements.themeToggle) {
		elements.themeToggle.addEventListener("click", () => {
			/* ... */
		});
	}
	// Handle blacklist redirect message (Remains the same)
	const blacklisted = urlParams.get("blacklisted");
	if (blacklisted === "true") {
		/* ... */
	}
});
// ... (Keep helper functions like formatTime, formatTimestamp, etc. outside DOMContentLoaded)
// Make sure generateFallbackFavicon and setFaviconWithFallback are defined globally or passed correctly.
//
// Add necessary CSS for .blacklist-notice if desired
/* Example CSS in website.css:
.blacklist-notice {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
    padding: 10px 15px;
    border-radius: 6px;
    margin-bottom: 15px;
    font-weight: 500;
}
html.dark .blacklist-notice {
     background-color: #4B1F24;
     color: #F8D7DA;
     border-color: #721c24;
}
*/
