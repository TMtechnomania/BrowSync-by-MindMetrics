// service.js (Manifest V3 service worker style)
// BrowSync - updated service worker to rely on content.js for session metrics
// Handles storage (IndexedDB for sessions), domain aggregates (chrome.storage.local), timeline buckets,
// context switch scoring, pruning/archive, and popup/live snapshot interface.

// NOTE: This file assumes content.js sends well-formed session objects with these keys:
// {
//   sessionId, domain (eTLD+1), hostname, url, sessionStart, sessionEnd,
//   sessionDuration, activeSession (active seconds), clicks, tabSwitches,
//   videoPlayed, audioPlayed, largeImagesCount, headingsCount, headingsList (optional),
//   highPriority, blocked, tabId, lastSnapshotAt
// }

const app = chrome || browser;

// ---------- CONFIG ----------
const DB_NAME = "BrowSyncDB";
const DB_VERSION = 1;
const SESSION_STORE = "session_logs"; // IndexedDB store for sessions (Tier 2)

const PRUNING_ALARM_NAME = "dailyPruning";
const PRUNING_DAYS = 30; // keep last 30 days in Tier 2

// ---------- In-memory caches ----------
let usageTimeline = { hourly: {}, daily: {} }; // persisted periodically
let activeTabCache = {}; // { windowId: { domain, category } }
let lastSnapshotCache = {}; // latest live snapshot per tabId or sessionId for popup quick reads

// ---------- Utils ----------
function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}
function log(...args) {
	// Keep logs minimal in SW. Uncomment when debugging heavily.
	// console.log('[service]', ...args);
}

// ---------- IndexedDB Helper (promisified) ----------
let dbPromise = null;
function openDB() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = (ev) => {
			console.error("IndexedDB open error:", ev);
			reject(ev);
		};
		req.onsuccess = (ev) => resolve(ev.target.result);
		req.onupgradeneeded = (ev) => {
			const db = ev.target.result;
			if (!db.objectStoreNames.contains(SESSION_STORE)) {
				const store = db.createObjectStore(SESSION_STORE, {
					keyPath: "sessionId",
				});
				// indexes useful for queries
				store.createIndex("domain", "domain", { unique: false });
				store.createIndex("sessionEnd", "sessionEnd", {
					unique: false,
				});
				store.createIndex("sessionStart", "sessionStart", {
					unique: false,
				});
			}
		};
	});
	return dbPromise;
}

async function addSessionToDB(session) {
	try {
		const db = await openDB();
		const tx = db.transaction(SESSION_STORE, "readwrite");
		const store = tx.objectStore(SESSION_STORE);
		// Upsert semantics: sessionId is primary key, put will replace if exists
		store.put(session);
		// Wait for tx completion in modern browsers
		await new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onabort = tx.onerror = (e) => reject(e);
		});
		return true;
	} catch (e) {
		console.error("addSessionToDB error:", e);
		return false;
	}
}

async function getOldSessions(cutoffTimestamp) {
	try {
		const db = await openDB();
		const tx = db.transaction(SESSION_STORE, "readonly");
		const store = tx.objectStore(SESSION_STORE);
		const idx = store.index("sessionEnd");
		const range = IDBKeyRange.upperBound(cutoffTimestamp);
		return await new Promise((resolve, reject) => {
			const req = idx.getAll(range);
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => reject(req.error);
		});
	} catch (e) {
		console.error("getOldSessions error:", e);
		return [];
	}
}

async function pruneOldSessions(cutoffTimestamp) {
	try {
		const db = await openDB();
		const tx = db.transaction(SESSION_STORE, "readwrite");
		const store = tx.objectStore(SESSION_STORE);
		const idx = store.index("sessionEnd");
		const range = IDBKeyRange.upperBound(cutoffTimestamp);
		await new Promise((resolve, reject) => {
			const cursorReq = idx.openCursor(range);
			cursorReq.onsuccess = (ev) => {
				const cursor = ev.target.result;
				if (cursor) {
					store.delete(cursor.primaryKey);
					cursor.continue();
				} else {
					resolve();
				}
			};
			cursorReq.onerror = () => reject(cursorReq.error);
		});
		return true;
	} catch (e) {
		console.error("pruneOldSessions error:", e);
		return false;
	}
}

// ---------- Storage helpers (chrome.storage.local wrappers) ----------
function storageGet(keys) {
	return new Promise((res) => {
		chrome.storage.local.get(keys, (value) => {
			res(value || {});
		});
	});
}
function storageSet(obj) {
	return new Promise((resolve) => {
		chrome.storage.local.set(obj, () => resolve());
	});
}

// ---------- Aggregates / Global Stats Helpers ----------
function getNewAggregate() {
	return {
		totalLife: 0,
		activeLife: 0,
		clicks: 0,
		tabSwitches: 0, // note: sessions bring tabSwitches now (content.js)
		visitCount: 0,
		lastVisit: 0,
		category: "unknown",
		userCategory: null,
	};
}
function getNewGlobalStats() {
	return {
		totalLifetime: 0,
		totalActiveTime: 0,
		totalClicks: 0,
		totalTabSwitches: 0,
		totalVisits: 0,
		contextSwitches: 0,
		distractionSwitches: 0,
		dailyScore: 0,
	};
}

// ---------- Timeline buckets (hourly/daily) ----------
function ensureHourlyBucket(ts) {
	const hourStart = Math.floor(ts / 3600) * 3600;
	if (!usageTimeline.hourly[hourStart]) {
		usageTimeline.hourly[hourStart] = {
			total: 0,
			categories: {
				productivity: 0,
				entertainment: 0,
				other: 0,
				unknown: 0,
			},
		};
	}
	return hourStart;
}
function ensureDailyBucket(ts) {
	const d = new Date(ts * 1000);
	d.setHours(0, 0, 0, 0);
	const dayKey = Math.floor(d.getTime() / 1000);
	if (!usageTimeline.daily[dayKey]) {
		usageTimeline.daily[dayKey] = {
			total: 0,
			categories: {
				productivity: 0,
				entertainment: 0,
				other: 0,
				unknown: 0,
			},
		};
	}
	return dayKey;
}
function addToBucket(bucket, key, seconds, category) {
	if (!seconds || seconds <= 0) return;
	bucket[key].total += seconds;
	bucket[key].categories[category] =
		(bucket[key].categories[category] || 0) + seconds;
}
function pruneTimeline(nowS) {
	const hourlyCut = nowS - 72 * 3600; // keep last 72 hours
	for (const k of Object.keys(usageTimeline.hourly)) {
		if (Number(k) < hourlyCut) delete usageTimeline.hourly[k];
	}
	const dailyCut = nowS - 90 * 86400; // keep last 90 days
	for (const k of Object.keys(usageTimeline.daily)) {
		if (Number(k) < dailyCut) delete usageTimeline.daily[k];
	}
}
function updateUsageTimeline(session, category) {
	try {
		const start = Number(session.sessionStart) || nowSeconds();
		const duration = Number(session.sessionDuration) || 0;
		if (duration <= 0) return;
		const end = Number(session.sessionEnd) || start + duration;
		const activeRatio = (session.activeSession || 0) / (duration || 1);
		let cursor = start;
		const effectiveEnd = Math.max(end, start + duration);
		while (cursor < effectiveEnd) {
			const hourStart = Math.floor(cursor / 3600) * 3600;
			const hourEnd = hourStart + 3600;
			const allocation = Math.min(effectiveEnd, hourEnd) - cursor;
			const activeAllocation = allocation * activeRatio;
			const ensured = ensureHourlyBucket(cursor);
			addToBucket(
				usageTimeline.hourly,
				ensured,
				activeAllocation,
				category,
			);
			cursor += allocation;
		}
		// daily
		cursor = start;
		while (cursor < effectiveEnd) {
			const dayStart = new Date(cursor * 1000);
			dayStart.setHours(0, 0, 0, 0);
			const dayStartS = Math.floor(dayStart.getTime() / 1000);
			const dayEndS = dayStartS + 86400;
			const allocation = Math.min(effectiveEnd, dayEndS) - cursor;
			const activeAllocation = allocation * activeRatio;
			const ensuredDay = ensureDailyBucket(cursor);
			addToBucket(
				usageTimeline.daily,
				ensuredDay,
				activeAllocation,
				category,
			);
			cursor += allocation;
		}
		pruneTimeline(nowSeconds());
	} catch (e) {
		console.error("updateUsageTimeline error:", e);
	}
}

// ---------- Context switch listener ----------
// We keep this to increment contextSwitches and distractionSwitches (global scoring).
app.tabs &&
	app.tabs.onActivated.addListener(async (activeInfo) => {
		const { tabId, windowId } = activeInfo;
		const prev = activeTabCache[windowId];
		try {
			const newTab = await new Promise((resolve) =>
				app.tabs.get(tabId, resolve),
			);
			if (!newTab || !newTab.url || !newTab.url.startsWith("http")) {
				activeTabCache[windowId] = null;
				return;
			}
			const newHostname = new URL(newTab.url).hostname;
			// for category detection we will consult domain_aggregates in storage
			const data = await storageGet([
				"domain_aggregates",
				"global_stats",
			]);
			const aggregates = data.domain_aggregates || {};
			const stats = data.global_stats || getNewGlobalStats();

			const newDomainAggregate = aggregates[newHostname] || {};
			const newCategory =
				newDomainAggregate.userCategory ||
				newDomainAggregate.category ||
				categorizeDomain(newHostname);

			if (!prev || prev.domain === newHostname) {
				// initial set or same domain -> update cache
				activeTabCache[windowId] = {
					domain: newHostname,
					category: newCategory,
				};
				return;
			}

			// real context switch between domains
			stats.contextSwitches = (stats.contextSwitches || 0) + 1;

			const prevCategory = prev.category || "unknown";
			if (
				prevCategory === "productivity" &&
				(newCategory === "entertainment" || newCategory === "other")
			) {
				stats.distractionSwitches =
					(stats.distractionSwitches || 0) + 1;
				stats.dailyScore = (stats.dailyScore || 0) - 5; // penalty
			}

			await storageSet({ global_stats: stats });

			// update cache
			activeTabCache[windowId] = {
				domain: newHostname,
				category: newCategory,
			};
		} catch (e) {
			// swallow errors if tab access fails
		}
	});

// ---------- Category detection helper (simple) ----------
const CATEGORY_KEYWORDS = {
	productivity: [
		"docs",
		"drive",
		"notion",
		"slack",
		"asana",
		"clickup",
		"jira",
		"figma",
		"github",
		"linear",
		"office",
		"teams",
		"zoom",
		"meet",
		"calendar",
		"mail",
		"outlook",
		"todoist",
		"trello",
		"stackoverflow",
	],
	entertainment: [
		"youtube",
		"netflix",
		"spotify",
		"primevideo",
		"instagram",
		"tiktok",
		"reddit",
		"twitch",
		"hulu",
		"disney",
		"soundcloud",
		"hbomax",
		"imdb",
		"plex",
		"pandora",
		"applemusic",
		"facebook",
		"twitter",
		"9gag",
	],
	other: [
		"amazon",
		"ebay",
		"walmart",
		"shop",
		"news",
		"cnn",
		"nytimes",
		"bbc",
		"guardian",
		"weather",
		"finance",
		"bank",
		"medium",
		"blog",
		"linkedin",
	],
};
function normalizeDomain(d) {
	return (d || "").toLowerCase();
}
function categorizeDomain(domain) {
	const n = normalizeDomain(domain);
	if (!n) return "unknown";
	for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
		if (kws.some((k) => n.includes(k))) return cat;
	}
	return "unknown";
}

// ---------- Message handling from content.js and popup ----------
app.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			if (!request || !request.type) {
				sendResponse &&
					sendResponse({ ok: false, reason: "bad_request" });
				return;
			}

			// 1) Full session finalize from content script
			if (request.type === "urlSession" && request.urlSession) {
				const s = request.urlSession;
				// Basic validation
				if (
					!s.sessionId ||
					!s.domain ||
					!s.sessionDuration ||
					s.sessionDuration <= 0
				) {
					sendResponse &&
						sendResponse({ ok: false, reason: "invalid_session" });
					return;
				}

				// Prepare canonical record (cleaned / minimal)
				const record = {
					sessionId: s.sessionId,
					domain: s.domain,
					hostname: s.hostname || s.domain,
					url: s.url || "",
					sessionStart: Number(s.sessionStart) || nowSeconds(),
					sessionEnd:
						Number(s.sessionEnd) ||
						Number(s.sessionStart) + Number(s.sessionDuration) ||
						nowSeconds(),
					sessionDuration: Number(s.sessionDuration) || 0,
					activeSession: Number(s.activeSession) || 0,
					clicks: Number(s.clicks) || 0,
					tabSwitches: Number(s.tabSwitches) || 0,
					videoPlayed: !!s.videoPlayed,
					audioPlayed: !!s.audioPlayed,
					largeImagesCount: Number(s.largeImagesCount) || 0,
					headingsCount: Number(s.headingsCount) || 0,
					headingsList: Array.isArray(s.headingsList)
						? s.headingsList.slice(0, 500)
						: [], // cap to avoid insane payloads
					highPriority: !!s.highPriority,
					blocked: !!s.blocked,
					tabId: s.tabId || null,
					lastSnapshotAt: Number(s.lastSnapshotAt) || nowSeconds(),
				};

				// 1.a Update Tier-1 aggregates & global stats in storage
				const data = await storageGet([
					"domain_aggregates",
					"global_stats",
					"usage_timeline",
				]);
				const aggregates = data.domain_aggregates || {};
				const stats = data.global_stats || getNewGlobalStats();

				const dKey = record.domain;
				const domainData = aggregates[dKey] || getNewAggregate();
				domainData.totalLife =
					(domainData.totalLife || 0) + record.sessionDuration;
				domainData.activeLife =
					(domainData.activeLife || 0) + record.activeSession;
				domainData.clicks = (domainData.clicks || 0) + record.clicks;
				domainData.tabSwitches =
					(domainData.tabSwitches || 0) + record.tabSwitches;
				domainData.visitCount = (domainData.visitCount || 0) + 1;
				domainData.lastVisit = record.sessionEnd || nowSeconds();
				domainData.category =
					domainData.userCategory ||
					domainData.category ||
					categorizeDomain(dKey);
				aggregates[dKey] = domainData;

				// global stats
				stats.totalLifetime =
					(stats.totalLifetime || 0) + record.sessionDuration;
				stats.totalActiveTime =
					(stats.totalActiveTime || 0) + record.activeSession;
				stats.totalClicks = (stats.totalClicks || 0) + record.clicks;
				stats.totalTabSwitches =
					(stats.totalTabSwitches || 0) + record.tabSwitches;
				stats.totalVisits = (stats.totalVisits || 0) + 1;

				// update dailyScore using existing scoring function logic
				stats.dailyScore =
					(stats.dailyScore || 0) +
					getScoreForSession(record, domainData.category);

				// update timeline (in-memory) and persist usage_timeline periodically
				updateUsageTimeline(record, domainData.category);

				// persist aggregates & stats (fast)
				await storageSet({
					domain_aggregates: aggregates,
					global_stats: stats,
					usage_timeline: usageTimeline,
				});

				// persist full session to IndexedDB (Tier-2)
				await addSessionToDB(record);

				// update lastSnapshot cache
				if (record.tabId) {
					lastSnapshotCache[record.tabId] = {
						sessionId: record.sessionId,
						domain: record.domain,
						url: record.url,
						sessionStart: record.sessionStart,
						sessionDuration: record.sessionDuration,
						activeSession: record.activeSession,
						clicks: record.clicks,
						tabSwitches: record.tabSwitches,
						videoPlayed: record.videoPlayed,
						audioPlayed: record.audioPlayed,
						largeImagesCount: record.largeImagesCount,
						headingsCount: record.headingsCount,
						lastSnapshotAt: record.lastSnapshotAt,
					};
				}

				sendResponse && sendResponse({ ok: true });
				return;
			}

			// 2) Live session snapshot from content script (lighter, repeated every X seconds)
			if (request.type === "liveSessionSnapshot" && request.snapshot) {
				const snap = request.snapshot;
				// store lightweight snapshot keyed by tabId or sessionId
				const key =
					snap.tabId ||
					snap.sessionId ||
					"s_" +
						(snap.sessionId || Math.random().toString(36).slice(2));
				lastSnapshotCache[key] = Object.assign({}, snap, {
					updatedAt: nowSeconds(),
				});
				// optional: mirror a single lastSnapshot to storage for popup fast read
				await storageSet({ lastSnapshot: snap });
				sendResponse && sendResponse({ ok: true });
				return;
			}

			// 3) Popup asking for quick query data (recent sessions summary + last snapshot)
			if (request.type === "querySessionsForPopup") {
				const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
				// read today's sessions from IndexedDB via range
				const db = await openDB();
				const tx = db.transaction(SESSION_STORE, "readonly");
				const store = tx.objectStore(SESSION_STORE);
				// simple: return last N sessions (descending by sessionStart)
				const sessions = await new Promise((resolve) => {
					const res = [];
					// open cursor in reverse order by key (if DB supports)
					const req = store.openCursor(null, "prev");
					req.onsuccess = (ev) => {
						const cursor = ev.target.result;
						if (cursor && res.length < 40) {
							res.push(cursor.value);
							cursor.continue();
						} else {
							resolve(res);
						}
					};
					req.onerror = () => resolve([]);
				});

				const ls = await storageGet([
					"domain_aggregates",
					"global_stats",
					"usage_timeline",
					"lastSnapshot",
				]);
				sendResponse &&
					sendResponse({
						ok: true,
						sessions,
						lastSnapshot: ls.lastSnapshot || null,
						domain_aggregates:
							ls.domain_aggregates || ls.domain_aggregates,
						global_stats: ls.global_stats || ls.global_stats,
					});
				return;
			}

			// 4) usageReminder -> display a notification (from content.js request)
			if (
				request.type === "usageReminder" &&
				request.domain &&
				request.time
			) {
				app.notifications &&
					app.notifications.create({
						type: "basic",
						iconUrl: "/icons/128.png",
						title: "⏰ BrowSync Reminder",
						message: `You've been on ${request.domain} for ${request.time}. Consider taking a break!`,
						priority: 1,
					});
				sendResponse && sendResponse({ ok: true });
				return;
			}

			// 5) admin: prune/force archive (manual)
			if (request.type === "forcePrune") {
				const cutoffTS = nowSeconds() - PRUNING_DAYS * 86400;
				const old = await getOldSessions(cutoffTS);
				if (old.length) {
					const monthly = summarizeSessionsByMonth(old);
					const data = await storageGet(["archive_summary"]);
					const archive = data.archive_summary || {};
					Object.assign(archive, monthly);
					await storageSet({ archive_summary: archive });
					await pruneOldSessions(cutoffTS);
					sendResponse &&
						sendResponse({ ok: true, archived: old.length });
				} else {
					sendResponse && sendResponse({ ok: true, archived: 0 });
				}
				return;
			}

			// default
			sendResponse && sendResponse({ ok: false, reason: "unknown_type" });
			return;
		} catch (err) {
			console.error("onMessage handler error:", err);
			try {
				sendResponse && sendResponse({ ok: false, error: String(err) });
			} catch (e) {}
			return;
		}
	})();
	return true; // keep channel open for async response
});

// ---------- Scoring function (same as earlier, preserved) ----------
function getScoreForSession(session, category) {
	let score = 0;
	const durationInMinutes = (session.sessionDuration || 0) / 60;
	const activeRatio =
		(session.activeSession || 0) / (session.sessionDuration || 1);

	if (session.sessionDuration > 600 && activeRatio > 0.85) {
		score += durationInMinutes * 2;
	}
	if (category === "productivity") {
		score += (session.activeSession / 60) * 1.5;
	} else if (category === "entertainment") {
		score -= (session.sessionDuration / 60) * 1.0;
	}
	score += (session.activeSession / 60) * 1.0;
	score -= (session.tabSwitches || 0) * 0.1;
	return score;
}

// ---------- Summarize sessions by month for archiving ----------
function summarizeSessionsByMonth(sessions) {
	const monthly = {};
	for (const s of sessions) {
		const end =
			Number(s.sessionEnd) || Number(s.sessionStart) || nowSeconds();
		const d = new Date(end * 1000);
		const monthKey = `${d.getFullYear()}-${String(
			d.getMonth() + 1,
		).padStart(2, "0")}`;
		if (!monthly[monthKey])
			monthly[monthKey] = {
				totalTime: 0,
				totalActiveTime: 0,
				domainTimeMap: {},
			};
		const m = monthly[monthKey];
		m.totalTime += Number(s.sessionDuration) || 0;
		m.totalActiveTime += Number(s.activeSession) || 0;
		m.domainTimeMap[s.domain] =
			(m.domainTimeMap[s.domain] || 0) + (Number(s.sessionDuration) || 0);
	}
	const finalArchive = {};
	for (const [k, v] of Object.entries(monthly)) {
		const sorted = Object.entries(v.domainTimeMap).sort(
			([, a], [, b]) => b - a,
		);
		finalArchive[k] = {
			totalTime: Math.round(v.totalTime),
			totalActiveTime: Math.round(v.totalActiveTime),
			avgActivityRatio:
				v.totalTime > 0
					? Math.round((v.totalActiveTime / v.totalTime) * 100)
					: 0,
			top5Domains: sorted
				.slice(0, 5)
				.map(([domain, time]) => ({ domain, time: Math.round(time) })),
			worst5Domains: sorted
				.slice(-5)
				.reverse()
				.map(([domain, time]) => ({ domain, time: Math.round(time) })),
		};
	}
	return finalArchive;
}

// ---------- Alarms (pruning) ----------
app.runtime.onInstalled.addListener(async (details) => {
	// initialize storage shape if missing
	const initData = await storageGet([
		"domain_aggregates",
		"global_stats",
		"usage_timeline",
		"archive_summary",
	]);
	if (!initData.domain_aggregates)
		await storageSet({
			domain_aggregates: {},
			usage_timeline: usageTimeline,
			global_stats: getNewGlobalStats(),
			archive_summary: {},
		});
	// create alarm
	try {
		app.alarms.create(PRUNING_ALARM_NAME, {
			delayInMinutes: 60,
			periodInMinutes: 1440,
		});
	} catch (e) {}
});

app.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm && alarm.name === PRUNING_ALARM_NAME) {
		try {
			const cutoff = nowSeconds() - PRUNING_DAYS * 86400;
			const oldSessions = await getOldSessions(cutoff);
			if (oldSessions.length) {
				const monthly = summarizeSessionsByMonth(oldSessions);
				const data = await storageGet(["archive_summary"]);
				const archive = data.archive_summary || {};
				Object.assign(archive, monthly);
				await storageSet({ archive_summary: archive });
				await pruneOldSessions(cutoff);
			}
			// reset daily stats
			const statsData = await storageGet(["global_stats"]);
			const stats = statsData.global_stats || getNewGlobalStats();
			stats.dailyScore = 0;
			stats.contextSwitches = 0;
			stats.distractionSwitches = 0;
			await storageSet({ global_stats: stats });
		} catch (e) {
			console.error("Pruning alarm error:", e);
		}
	}
});

// ---------- On startup (load persisted timeline into memory) ----------
app.runtime.onStartup &&
	app.runtime.onStartup.addListener(async () => {
		const data = await storageGet(["usage_timeline"]);
		if (data.usage_timeline) {
			usageTimeline = Object.assign(usageTimeline, data.usage_timeline);
		}
	});

// ---------- Small migration note ----------
// Since you're keeping only new keys, old keys will be ignored. We use sessionId as primary key so
// re-sends of the same session will upsert and replace previous record.
