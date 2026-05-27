// content.js - refactor v1
/* eslint-disable no-console */
const app = chrome || browser;

function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

// --- UUID v4 helper (small)
function uuidv4() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
		/[xy]/g,
		function (c) {
			const r = (Math.random() * 16) | 0;
			const v = c === "x" ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		},
	);
}

// --- small safe runtime send helper
function sendRuntimeMessage(message) {
	if (
		typeof browser !== "undefined" &&
		browser.runtime &&
		browser.runtime.sendMessage
	) {
		return browser.runtime.sendMessage(message);
	}
	return new Promise((resolve, reject) => {
		try {
			chrome.runtime.sendMessage(message, (resp) => {
				const err = chrome.runtime.lastError;
				if (err) return reject(err);
				resolve(resp);
			});
		} catch (e) {
			reject(e);
		}
	});
}

// --- Ad heuristics (best-effort)
function looksLikeAdElement(el) {
	if (!el) return false;
	const attrs =
		(el.src || "") +
		" " +
		(el.id || "") +
		" " +
		(el.className || "") +
		" " +
		((el.dataset && JSON.stringify(el.dataset)) || "");
	const src = (el.src || "").toLowerCase();
	const combined = attrs.toLowerCase();
	const adKeywords = [
		"ad",
		"ads",
		"doubleclick",
		"googlesyndication",
		"adservice",
		"sponsored",
		"banner",
		"partner",
	];
	for (const k of adKeywords) {
		if (combined.includes(k)) return true;
		if (src.includes(k)) return true;
	}
	// if element is within an iframe - usually ad containers -> skip
	let p = el;
	while (p) {
		if (p.tagName && p.tagName.toLowerCase() === "iframe") return true;
		p = p.parentElement;
	}
	return false;
}

// --- Heading helper (creates a searchable small object)
function makeHeadingObj(el, index) {
	const text = (el.innerText || el.textContent || "").trim();
	return {
		text: text.slice(0, 1000), // cap
		tag: el.tagName.toLowerCase(),
		index: index,
		ts: nowSeconds(),
		// optional xpath can be added if you want later (left out for perf)
	};
}

// --- Get registrable domain (eTLD+1) naive method
function getBaseDomain(hostname) {
	// naive fallback: take last two parts. For complex TLDs you'd want publicsuffix lib.
	const parts = hostname.split(".");
	if (parts.length <= 2) return hostname;
	return parts.slice(-2).join(".");
}

// --- Session object & lifecycle
let session = null;
let activeLifeSec = 0;
let activeInterval = null;
let isTabActive = !document.hidden;
let clickCount = 0;
let lastHref = location.href;
let tabId = null; // optional; set by background when content receives response
let largeImagesCount = 0;
let videoPlayed = false;
let audioPlayed = false;
let headingsIndex = new Map(); // text->true to dedupe
let headingsList = []; // array of heading objects
let tabSwitches = 0;

// Throttle helper
function throttle(fn, wait) {
	let last = 0;
	let timer = null;
	return function (...args) {
		const now = Date.now();
		if (!last || now - last >= wait) {
			last = now;
			fn.apply(this, args);
		} else {
			clearTimeout(timer);
			timer = setTimeout(() => {
				last = Date.now();
				fn.apply(this, args);
			}, wait - (now - last));
		}
	};
}

// Create session
function createSession(opts = {}) {
	session = {
		sessionId: uuidv4(),
		domain: getBaseDomain(location.hostname || ""),
		hostname: location.hostname || "",
		url: location.href,
		sessionStart: nowSeconds(),
		sessionEnd: null,
		totalActiveSec: 0,
		totalPassiveSec: 0,
		tabSwitches: 0,
		clicks: 0,
		highPriority: !!opts.highPriority,
		blocked: !!opts.blocked,
		reminderInterval: opts.reminderInterval || null,
		videoPlayed: false,
		audioPlayed: false,
		largeImagesCount: 0,
		headings: [],
		lastSnapshotAt: nowSeconds(),
		tabId: opts.tabId || null,
	};
	// reset local track counters
	activeLifeSec = 0;
	clickCount = 0;
	largeImagesCount = 0;
	videoPlayed = false;
	audioPlayed = false;
	headingsIndex.clear();
	headingsList = [];
	tabSwitches = 0;
	// start active interval
	startActiveTimer();
}

// finalize session and send to background
function finalizeSession() {
	if (!session) return;
	stopActiveTimer();
	session.sessionEnd = nowSeconds();
	session.totalActiveSec = activeLifeSec;
	const duration = session.sessionEnd - session.sessionStart;
	session.totalPassiveSec = Math.max(0, duration - session.totalActiveSec);
	session.tabSwitches = tabSwitches;
	session.clicks = clickCount;
	session.videoPlayed = videoPlayed;
	session.audioPlayed = audioPlayed;
	session.largeImagesCount = largeImagesCount;
	// push headings list
	session.headings = headingsList.slice();
	session.lastSnapshotAt = nowSeconds();

	// Minimal filter: ignore zero-duration sessions
	if (session.sessionEnd - session.sessionStart > 0) {
		// send to background
		sendRuntimeMessage({ type: "urlSession", urlSession: session }).catch(
			() => {},
		);
	}

	// clear
	session = null;
	stopMutationObservers();
}

// --- timers & activity
function startActiveTimer() {
	if (activeInterval) clearInterval(activeInterval);
	activeInterval = setInterval(() => {
		if (isTabActive) activeLifeSec++;
	}, 1000);
}
function stopActiveTimer() {
	if (activeInterval) {
		clearInterval(activeInterval);
		activeInterval = null;
	}
}

// --- click tracking
document.addEventListener("click", () => {
	clickCount++;
});

// --- visibility & tab switches
document.addEventListener("visibilitychange", () => {
	const prev = isTabActive;
	isTabActive = !document.hidden;
	if (!isTabActive && prev) {
		// tab became hidden
		tabSwitches++;
	}
	// tab becoming visible doesn't need to increment
});

// --- SPA href-change handling (simple approach)
function checkHrefChange() {
	if (location.href !== lastHref) {
		// href changed without unload => treat as SPA navigation: finalize and new session
		finalizeSession();
		lastHref = location.href;
		createSession();
	}
}
setInterval(checkHrefChange, 800); // lightweight poll to catch edge SPA changes

// Also hook into history changes to be faster
(function (history) {
	const pushState = history.pushState;
	const replaceState = history.replaceState;
	history.pushState = function () {
		const res = pushState.apply(history, arguments);
		window.dispatchEvent(new Event("locationchange"));
		return res;
	};
	history.replaceState = function () {
		const res = replaceState.apply(history, arguments);
		window.dispatchEvent(new Event("locationchange"));
		return res;
	};
})(window.history);
window.addEventListener("locationchange", () => {
	checkHrefChange();
});
window.addEventListener("hashchange", () => {
	checkHrefChange();
});
window.addEventListener("popstate", () => {
	checkHrefChange();
});

// --- beforeunload: finalize
window.addEventListener("beforeunload", () => {
	finalizeSession();
});

// --- headings collection (on load + scroll, throttle)
function collectHeadings() {
	try {
		const nodes = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
		let idx = 0;
		for (const n of nodes) {
			const txt = (n.innerText || n.textContent || "").trim();
			if (!txt) continue;
			if (!headingsIndex.has(txt)) {
				const obj = makeHeadingObj(n, idx++);
				headingsIndex.set(txt, true);
				headingsList.push(obj);
			}
		}
	} catch (e) {
		// ignore DOM access errors
	}
}
const onScrollCollect = throttle(() => {
	collectHeadings();
	// update session snapshot (lightweight)
	if (session) {
		session.lastSnapshotAt = nowSeconds();
	}
}, 400);

window.addEventListener("load", () => {
	collectHeadings();
});
window.addEventListener("scroll", onScrollCollect);

// --- media detection & mutation observer
let mutationObserver = null;
function setupMutationObservers() {
	// watch for images/videos added later (lazy load)
	if (mutationObserver) return;
	mutationObserver = new MutationObserver((mutList) => {
		for (const m of mutList) {
			if (m.addedNodes && m.addedNodes.length) {
				for (const node of m.addedNodes) {
					if (!node) continue;
					if (node.nodeType !== 1) continue;
					// images
					if (node.tagName && node.tagName.toLowerCase() === "img") {
						handleImageNode(node);
					}
					// video/audio
					if (
						node.tagName &&
						node.tagName.toLowerCase() === "video"
					) {
						attachMediaListeners(node);
					}
					if (node.querySelectorAll) {
						// also scan subtrees quickly
						const imgs = node.querySelectorAll("img");
						for (const i of imgs) handleImageNode(i);
						const vids = node.querySelectorAll("video");
						for (const v of vids) attachMediaListeners(v);
						const auds = node.querySelectorAll("audio");
						for (const a of auds) attachMediaListeners(a);
					}
				}
			}
		}
	});
	mutationObserver.observe(
		document.documentElement || document.body || document,
		{
			childList: true,
			subtree: true,
		},
	);

	// initial scan
	document.querySelectorAll("img").forEach(handleImageNode);
	document.querySelectorAll("video").forEach(attachMediaListeners);
	document.querySelectorAll("audio").forEach(attachMediaListeners);
}

function stopMutationObservers() {
	if (mutationObserver) {
		mutationObserver.disconnect();
		mutationObserver = null;
	}
}

function handleImageNode(imgEl) {
	try {
		if (looksLikeAdElement(imgEl)) return;
		// check dimensions once loaded
		const check = () => {
			const w = imgEl.naturalWidth || imgEl.width || imgEl.clientWidth;
			const h = imgEl.naturalHeight || imgEl.height || imgEl.clientHeight;
				if (w >= 240 && h >= 240) {
					largeImagesCount++;
				}
		};
		if (imgEl.complete) {
			check();
		} else {
			imgEl.addEventListener("load", check, { once: true });
			// fallback timeout
			setTimeout(check, 3000);
		}
	} catch (e) {}
}

function attachMediaListeners(mediaEl) {
	try {
		if (looksLikeAdElement(mediaEl)) return;
		// listen for `play` events
		mediaEl.addEventListener(
			"play",
			() => {
				if (mediaEl.tagName.toLowerCase() === "video") {
					videoPlayed = true;
				} else if (mediaEl.tagName.toLowerCase() === "audio") {
					audioPlayed = true;
				}
			},
			{ passive: true },
		);

		// for preview autoplay detection (some sites use muted autoplay preview)
		if (mediaEl.readyState && mediaEl.readyState > 0) {
			// if currentTime > 0 and not paused
			if (!mediaEl.paused && mediaEl.currentTime > 0) {
				if (mediaEl.tagName.toLowerCase() === "video")
					videoPlayed = true;
				if (mediaEl.tagName.toLowerCase() === "audio")
					audioPlayed = true;
			}
		}
	} catch (e) {}
}

// --- initialize
(async function init() {
	// create session on DOM ready-ish
	createSession();

	// setup observers & scans
	setupMutationObservers();

	// expose a message handler for popup/background
	app.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (!request || !request.type) return;
		if (request.type === "getLiveSession") {
			// return lightweight snapshot for popup
			if (!session) {
				sendResponse({ ok: false, session: null });
				return true;
			}
			const now = nowSeconds();
			const currDuration = now - session.sessionStart;
			sendResponse({
				ok: true,
				session: {
					sessionId: session.sessionId,
					domain: session.domain,
					hostname: session.hostname,
					url: session.url,
					sessionStart: session.sessionStart,
					sessionDuration: currDuration,
					active: activeLifeSec,
					passive: Math.max(0, currDuration - activeLifeSec),
					clicks: clickCount,
					tabSwitches: tabSwitches,
					videoPlayed,
					audioPlayed,
					largeImagesCount,
					headingsCount: headingsList.length,
				},
			});
			return true;
		} else if (request.type === "sendData") {
			finalizeSession();
			// create new session immediately after to continue tracking
			createSession();
			sendResponse({ ok: true });
			return true;
		} else if (request.type === "setTabId") {
			// optional: background can tell content which tabId it thinks it is
			tabId = request.tabId;
			if (session) session.tabId = tabId;
			sendResponse({ ok: true });
			return true;
		}
		return true;
	});

	// heartbeat snapshot saver (batch update to background every 10s)
	setInterval(() => {
		if (!session) return;
		// Do light batching — only push summary (not full)
		const s = {
			sessionId: session.sessionId,
			domain: session.domain,
			hostname: session.hostname,
			url: session.url,
			sessionStart: session.sessionStart,
			lastSnapshotAt: nowSeconds(),
			activeSoFar: activeLifeSec,
			clicks: clickCount,
			tabSwitches,
			videoPlayed,
			audioPlayed,
			largeImagesCount,
			headingsCount: headingsList.length,
			highPriority: session.highPriority,
			blocked: session.blocked,
			tabId: session.tabId,
		};
		sendRuntimeMessage({ type: "liveSessionSnapshot", snapshot: s }).catch(
			() => {},
		);
	}, 10000);
})();
