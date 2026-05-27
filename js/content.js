const app = chrome || browser;

function getTimestamp() {
	return Math.floor(Date.now() / 1000);
}

// Wait for DOM ready
document.addEventListener("DOMContentLoaded", async function () {
	let timestamp = getTimestamp();
	let clicks = 0;
	let activeLife = 0;
	let distractions = 0;
	let isTabActive = !document.hidden;
	let url = window.location.href;
	let domain = window.location.hostname;
	let timeInterval;

	// Start tracking active time
	function startTimeTracking() {
		timeInterval = setInterval(() => {
			if (isTabActive) activeLife++;
		}, 1000);
	}

	function stopTimeTracking() {
		clearInterval(timeInterval);
	}

	// Small helper to send runtime messages in a cross-runtime safe way (chrome callback vs browser promise)
	function sendRuntimeMessage(message) {
		// If browser (Firefox) or Promise-enabled runtime is present, use it directly
		if (
			typeof browser !== "undefined" &&
			browser.runtime &&
			browser.runtime.sendMessage
		) {
			return browser.runtime.sendMessage(message);
		}

		// Fallback to chrome callback style wrapped in a Promise
		return new Promise((resolve, reject) => {
			try {
				chrome.runtime.sendMessage(message, (response) => {
					const err = chrome.runtime.lastError;
					if (err) return reject(err);
					resolve(response);
				});
			} catch (e) {
				// If sendMessage throws synchronously, reject
				reject(e);
			}
		});
	}

	// Send session data to background
	function sendData() {
		stopTimeTracking();
		const sessionEndTimestamp = getTimestamp();
		const sessionDuration = sessionEndTimestamp - timestamp;

		const urlSession = {
			domain: domain,
			url: url,
			title: document.title || "Untitled",
			clicks: clicks,
			sessionDuration: sessionDuration,
			activeSession: activeLife,
			passiveSession: sessionDuration - activeLife,
			distractions: distractions,
			sessionStart: timestamp,
			sessionEnd: sessionEndTimestamp,
		};

		// Send to background script (use safe helper)
		sendRuntimeMessage({ type: "urlSession", urlSession }).catch(() => {
			// Ignore errors if background script is not ready
		});

		// Reset for new session
		timestamp = sessionEndTimestamp;
		url = window.location.href;
		domain = window.location.hostname;
		clicks = 0;
		activeLife = 0;
		distractions = 0;
		startTimeTracking();
	}

	// Track clicks
	document.addEventListener("click", () => clicks++);

	// Track tab visibility changes (distractions)
	document.addEventListener("visibilitychange", () => {
		isTabActive = !document.hidden;
		if (document.hidden) distractions++;
	});

	// Send data before page unload
	window.addEventListener("beforeunload", sendData);

	// Handle URL changes in SPAs
	function handleURLChange() {
		if (url !== window.location.href) {
			sendData();
		}
	}

	// Intercept history methods for SPA navigation
	(function (history) {
		const pushState = history.pushState;
		const replaceState = history.replaceState;

		history.pushState = function () {
			const result = pushState.apply(history, arguments);
			window.dispatchEvent(new Event("locationchange"));
			return result;
		};

		history.replaceState = function () {
			const result = replaceState.apply(history, arguments);
			window.dispatchEvent(new Event("locationchange"));
			return result;
		};
	})(window.history);

	// Listen for SPA navigation events and flush session when location changes
	// Some apps use pushState/replaceState (we dispatch 'locationchange' there),
	// also handle popstate/hashchange as extra coverage.
	window.addEventListener("locationchange", handleURLChange);
	window.addEventListener("popstate", handleURLChange);
	window.addEventListener("hashchange", handleURLChange);

	// Listen for messages from background script
	app.runtime.onMessage.addListener((request, sender, sendResponse) => {
		if (request.type === "getSessionData") {
			const currentTime = getTimestamp();
			sendResponse({
				sessionData: {
					domain: domain,
					url: url,
					title: document.title || "Untitled",
					clicks: clicks,
					sessionDuration: currentTime - timestamp,
					activeSession: activeLife,
					passiveSession: currentTime - timestamp - activeLife,
					distractions: distractions,
					sessionStart: timestamp,
					sessionEnd: currentTime,
				},
			});
		} else if (request.type === "sendData") {
			sendData();
		}
		return true; // Keep message channel open
	});

	// Start tracking
	startTimeTracking();

	// Handle domain settings
	const settings = await app.storage.local.get([domain]);
	if (!settings[domain]) {
		await app.storage.local.set({
			[domain]: {
				blacklist: "no",
				usageReminder: "never",
			},
		});
	} else {
		// Check if blacklisted
		if (settings[domain].blacklist === "yes") {
			const extensionURL = chrome.runtime.getURL("website.html");
			window.location.href = `${extensionURL}?domain=${domain}&blacklisted=true`;
			return;
		}

		// Setup usage reminder
		if (settings[domain].usageReminder !== "never") {
			const reminderIntervals = {
				"30m": 30 * 60 * 1000,
				"1h": 60 * 60 * 1000,
				"2h": 2 * 60 * 60 * 1000,
				"4h": 4 * 60 * 60 * 1000,
			};

			const interval = reminderIntervals[settings[domain].usageReminder];
			if (interval) {
				setInterval(() => {
					// use safe send helper to support both callback and promise runtimes
					sendRuntimeMessage({
						type: "usageReminder",
						domain: domain,
						time: settings[domain].usageReminder,
					}).catch(() => {});

					// Show in-page notification
					const notification = document.createElement("div");
					notification.style.cssText = `
						position: fixed;
						top: 20px;
						right: 20px;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						color: white;
						padding: 20px;
						border-radius: 10px;
						box-shadow: 0 4px 20px rgba(0,0,0,0.3);
						z-index: 999999;
						font-family: system-ui, -apple-system, sans-serif;
						max-width: 300px;
						animation: slideIn 0.3s ease-out;
					`;
					notification.innerHTML = `
						<div style="font-weight: bold; margin-bottom: 8px;">⏰ BrowSync Reminder</div>
						<div style="font-size: 14px;">You've been on this site for ${settings[domain].usageReminder}. Consider taking a break!</div>
					`;
					document.body.appendChild(notification);

					setTimeout(() => {
						notification.style.animation = "slideOut 0.3s ease-in";
						setTimeout(() => notification.remove(), 300);
					}, 5000);
				}, interval);
			}
		}
	}
});
