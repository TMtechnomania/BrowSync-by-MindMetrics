const app = chrome || browser;

const todaySessions = {
	date: getDate(),
	sessionStart: getTime(),
	tabSessions: {},
	urlSessions: {},
};

function getDate() {
	return new Date().toISOString().split("T")[0].split("-").reverse().join("");
}

function getTime() {
	const now = new Date();
	return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

// Wait until the DOM is ready
document.addEventListener("DOMContentLoaded", async function () {
	console.log("DOM loaded");

	const date = getDate();
	const time = getTime();

	// Count the number of clicks
	let clicks = 0;
	document.addEventListener("click", function () {
		clicks++;
	});

	// Check the domain
	let domain = window.location.hostname;
	let url = window.location.href;

	// Store the amount of time spent on the page
	let activeLife = 0;
	let timeInterval;
	let isTabActive = true; // Track if the tab is active

	// Function to start the time tracking interval
	function startTimeTracking() {
		timeInterval = setInterval(function () {
			if (isTabActive) {
				// Only increment time when the tab is active
				activeLife++;
			}
		}, 1000);
	}

	// Function to stop the time tracking interval
	function stopTimeTracking() {
		clearInterval(timeInterval);
	}

	// Start time tracking
	startTimeTracking();

	// Track distractions based on tab visibility
	let distractions = 0;
	document.addEventListener("visibilitychange", function () {
		if (document.hidden) {
			// Tab becomes inactive (user switched away)
			distractions++;
			isTabActive = false; // Mark the tab as inactive
		} else {
			// Tab becomes active again (user switched back)
			isTabActive = true; // Mark the tab as active
		}
	});

	// Handle beforeunload event
	window.addEventListener("beforeunload", async function () {
		stopTimeTracking();
		const urlSession = {
			domain: domain,
			clicks: clicks,
			activeLife: activeLife,
			distractions: distractions,
			urlVisited: {
				url: url,
				sessionStart: time,
				sessionEnd: getTime(),
				sessionDuration: getTime() - time,
			},
            totalLife: getTime() - time,
            passiveLife: getTime() - time - activeLife,
		};

		// Send the data to the background script for processing
		app.runtime.sendMessage({ type: "urlSession", date, urlSession });
	});
});
