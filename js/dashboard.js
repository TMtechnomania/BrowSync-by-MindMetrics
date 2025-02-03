const app = chrome || browser;

// Set scale for popup
const screenWidth = window.screen.width;
const scale = screenWidth / 1920;
document.documentElement.style.setProperty("--scale", scale);

// Reload popup when storage changes
app.storage.onChanged.addListener(() => window.location.reload());

// Helper: Format seconds into a readable string
function formatTime(seconds) {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
}

// Helper: Create a domain list item with favicon and custom height
function createDomainListItem(domain, text, height) {
	const li = document.createElement("li");
	li.textContent = text;
	const img = document.createElement("img");
	img.src = `https://www.google.com/s2/favicons?domain=https://${domain}&size=128`;
	img.alt = `${domain} favicon`;
	img.onerror = () => img.remove();
	li.prepend(img);
	if (height !== undefined) {
		li.style.setProperty("--height", `${height}%`);
	}
	return li;
}

document.addEventListener("DOMContentLoaded", async () => {
	// Elements
	const sessionsCountEl = document.querySelector("#sessionsCount");
	const top5ListEl = document.querySelector("#top5List");
	const top5VisitsEl = document.querySelector("#top5Visits");
	const totalTimeSpentEl = document.querySelector("#totalTimeSpent");
	const mostVisitedSiteEl = document.querySelector("#mostVisitedSite");
	const leastVisitedSiteEl = document.querySelector("#leastVisitedSite");
	const totalDistractionsEl = document.querySelector("#totalDistractions");
	const totalInteractionsEl = document.querySelector("#totalInteractions");

	// Get domain data
	const { domainDB = {} } = await app.storage.local.get(["domainDB"]);
	console.log("Domain DB", domainDB);

	// Get the stored access token and refresh token
	const { accessToken, refreshToken, expireTime, refreshExpireTime } =
		await app.storage.local.get([
			"accessToken",
			"refreshToken",
			"expireTime",
			"refreshExpireTime",
		]);

	// Get the current timestamp
	const currentTime = new Date().getTime();

	// If no tokens exist, authenticate for the first time
	if (!accessToken || !refreshToken || !expireTime || !refreshExpireTime) {
		console.log("No tokens found, authenticating for the first time...");
		fetch("https://3001.code.vishalhq.in/auth", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				username: "test",
				password: "test@123",
			}),
		})
			.then((res) => res.json())
			.then(async (data) => {
				console.log("Authenticated:", data);
				let expireTime = currentTime + 15 * 60 * 1000; // Access token valid for 15 min
				let refreshExpireTime = currentTime + 24 * 60 * 60 * 1000; // Refresh token valid for 24 hours
				await app.storage.local.set({
					accessToken: data.accessToken,
					refreshToken: data.refreshToken,
					expireTime,
					refreshExpireTime,
				});
				location.reload(); // Reload page after getting the tokens
			})
			.catch((err) => {
				console.error("Authentication failed:", err);
			});
	}
	// If refresh token has expired, authenticate again
	else if (currentTime > refreshExpireTime) {
		console.log("Refresh Token is expired, re-authenticating...");
		fetch("https://3001.code.vishalhq.in/auth", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				username: "test",
				password: "test@123",
			}),
		})
			.then((res) => res.json())
			.then(async (data) => {
				console.log("Re-authenticated:", data);
				let expireTime = currentTime + 15 * 60 * 1000;
				let refreshExpireTime = currentTime + 24 * 60 * 60 * 1000;
				await app.storage.local.set({
					accessToken: data.accessToken,
					refreshToken: data.refreshToken,
					expireTime,
					refreshExpireTime,
				});
				location.reload(); // Reload page after getting new tokens
			})
			.catch((err) => {
				console.error("Re-authentication failed:", err);
			});
	}
	// If access token is expired, but refresh token is still valid, refresh access token
	else if (currentTime > expireTime && currentTime < refreshExpireTime) {
		console.log("Access Token expired, refreshing...");
		fetch("https://3001.code.vishalhq.in/refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				refreshToken,
			}),
		})
			.then((res) => res.json())
			.then((data) => {
				console.log("Access Token refreshed:", data);
				let expireTime = currentTime + 15 * 60 * 1000;
				let refreshExpireTime = currentTime + 24 * 60 * 60 * 1000;
				app.storage.local.set({
					accessToken: data.accessToken,
					refreshToken: data.refreshToken,
					expireTime,
					refreshExpireTime,
				});
				location.reload(); // Reload page to use the new access token
			})
			.catch((err) => {
				console.error("Token refresh failed:", err);
			});
	}
	// If access token is still valid, process data
	else {
		console.log("Access Token is still valid, processing data...");
		fetch("https://3001.code.vishalhq.in/process", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				accessToken,
				domainDB,
			}),
		})
			.then((res) => res.json())
			.then((data) => {
				console.log("Data processed:", data);
			})
			.catch((err) => {
				console.error("Data processing failed:", err);
			});
	}

	const domains = Object.keys(domainDB);
	if (!domains.length) {
		sessionsCountEl.textContent = "No domain data available.";
		top5ListEl.textContent = "No domain data available.";
		document.querySelector("#panel").style.display = "none";
		document.querySelector("#list").style.display = "none";
		top5VisitsEl.textContent = "No domain data available.";
		return;
	}

	// Total sessions: sum of urlVisited counts for each domain
	const totalSessions = domains.reduce(
		(sum, domain) => sum + (domainDB[domain].urlVisited?.length || 0),
		0,
	);
	sessionsCountEl.textContent = `${totalSessions} URLs visited across ${domains.length} domains`;

	// --- TOP 5 by totalLife ---
	const sortedByLife = domains
		.slice()
		.sort(
			(a, b) =>
				(domainDB[b].totalLife || 0) - (domainDB[a].totalLife || 0),
		);
	const top5ByLife = sortedByLife.slice(0, Math.min(5, sortedByLife.length));

	// console.log("Top 5 by life", top5ByLife);

	if (top5ByLife.length) {
		// Use first domain as the standard reference for height calculations
		const topDomain = top5ByLife[0];
		const topDomainLife = domainDB[topDomain].totalLife || 0;

		// Calculate standard reference (avoid division by zero)
		let standard = 1;
		if (topDomainLife > 0) {
			const hrs = Math.floor(topDomainLife / 3600);
			const mins = Math.floor((topDomainLife % 3600) / 60);

			if (hrs > 0) {
				standard = (hrs + 1) * 3600;
			} else if (mins > 0) {
				standard = Math.ceil(mins / 10) * 10 * 60;
			} else {
				standard = 60;
			}
			// console.log("Standard", standard);
		}

		top5ByLife.forEach((domain) => {
			const totalLife = domainDB[domain].totalLife || 0;
			if (!totalLife) return;
			const text = `${domain}: ${formatTime(totalLife)}`;
			const height = (totalLife / standard) * 100;
			const li = createDomainListItem(domain, text, height);
			li.onclick = () => {
				window.location.href = `/website.html?domain=${domain}`;
			};
			top5ListEl.appendChild(li);
		});
	} else {
		top5ListEl.textContent = "No domain time data available.";
	}

	// --- TOP 5 by visits ---
	const sortedByVisits = domains
		.slice()
		.sort(
			(a, b) =>
				(domainDB[b].urlVisited?.length || 0) -
				(domainDB[a].urlVisited?.length || 0),
		);
	const top5ByVisits = sortedByVisits.slice(
		0,
		Math.min(5, sortedByVisits.length),
	);
	if (top5ByVisits.length) {
		// Use first domain as reference for relative height
		const refVisits = domainDB[top5ByVisits[0]].urlVisited?.length || 1;
		top5ByVisits.forEach((domain) => {
			const visits = domainDB[domain].urlVisited?.length || 0;
			const text = `${domain}: ${visits} visits`;
			const height = (visits / refVisits) * 100;
			const li = createDomainListItem(domain, text, height);
			li.onclick = () => {
				window.location.href = `/website.html?domain=${domain}`;
			};
			top5VisitsEl.appendChild(li);
		});
	} else {
		top5VisitsEl.textContent = "No domain visit data available.";
	}

	// --- Total time spent on all domains ---
	const totalSeconds = domains.reduce(
		(sum, domain) => sum + (domainDB[domain].totalLife || 0),
		0,
	);
	totalTimeSpentEl.textContent = formatTime(totalSeconds);

	// --- Most and Least Visited Sites ---
	let mostVisited = "",
		leastVisited = "";
	let mostVisitedCount = 0,
		leastVisitedCount = Number.MAX_SAFE_INTEGER;
	domains.forEach((domain) => {
		const visits = domainDB[domain].urlVisited?.length || 0;
		if (visits > mostVisitedCount) {
			mostVisitedCount = visits;
			mostVisited = domain;
		}
		if (visits < leastVisitedCount) {
			leastVisitedCount = visits;
			leastVisited = domain;
		}
	});

	// Set most visited site favicon (use self onerror)
	mostVisitedSiteEl.src = `https://www.google.com/s2/favicons?domain=https://${mostVisited}&size=128`;
	mostVisitedSiteEl.alt = `${mostVisited} favicon`;
	mostVisitedSiteEl.onerror = () => mostVisitedSiteEl.remove();

	// Set least visited site favicon
	leastVisitedSiteEl.src = `https://www.google.com/s2/favicons?domain=https://${leastVisited}&size=128`;
	leastVisitedSiteEl.alt = `${leastVisited} favicon`;
	leastVisitedSiteEl.onerror = () => leastVisitedSiteEl.remove();

	// --- Total distractions and interactions ---
	const { totalDistractionCount, totalClicks } = domains.reduce(
		(acc, domain) => {
			acc.totalDistractionCount += domainDB[domain].distractions || 0;
			acc.totalClicks += domainDB[domain].clicks || 0;
			return acc;
		},
		{ totalDistractionCount: 0, totalClicks: 0 },
	);
	totalDistractionsEl.textContent = totalDistractionCount;
	totalInteractionsEl.textContent = totalClicks;

	// List, rendering a list of all the domains as a div with class flex, containing the logo, domain name, total visits, total time spent, and activity ratio and a edit button with link /website.html?domain=domain
	const list = document.querySelector("#list");
	const thead = document.createElement("thead");
	thead.innerHTML = `
        <tr>
            <th>Logo</th>
            <th>Domain</th>
            <th>Total Visits</th>
            <th>Total Time</th>
            <th>Activity Ratio</th>
            <th>Delete</th>
        </tr>
    `;
	list.appendChild(thead);
	const tbody = document.createElement("tbody");
	list.appendChild(tbody);
	domains.forEach((domain) => {
		const domainData = domainDB[domain];
		const domainItem = document.createElement("tr");
		domainItem.innerHTML = `
            <td><img src="https://www.google.com/s2/favicons?domain=https://${domain}&size=128" alt="${domain} favicon" onerror="this.remove()"></td>
            <td>${domain}</td>
            <td>${domainData.urlVisited.length}</td>
            <td>${formatTime(domainData.totalLife)}</td>
            <td>${Math.floor(
				(domainData.activeLife / domainData.totalLife) * 100,
			)}%</td>
            <td><a href="/website.html?domain=${domain}&delete=true" class="edit">Delete</a></td>
        `;
		domainItem.onclick = () => {
			window.location.href = `/website.html?domain=${domain}`;
		};
		tbody.appendChild(domainItem);
	});
});
