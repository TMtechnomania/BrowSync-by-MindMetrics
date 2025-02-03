const app = chrome || browser;

// Get current timestamp
function getTimestamp() {
	const now = new Date();
    return Math.floor(now.getTime() / 1000);
}

// Get the current date as YYYYMMDD
// function getDate() {
// 	const now = new Date();

// 	const year = now.getFullYear();
// 	const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-based
// 	const day = String(now.getDate()).padStart(2, "0");
// 	return `${year}${month}${day}`;
// }

const startTime = getTimestamp();
// const date = getDate();

const domainDB = {};

// Store the date on install as the first data recorded reference
app.runtime.onInstalled.addListener(async (e) => {
	if (e.reason === "install") {
		const timestamp = getTimestamp();
		await app.storage.local.set({ initiate: timestamp });
	} else if (e.reason === "update") {
		// await app.storage.local.clear();
		const data = await app.storage.local.get("domainDB");
		if (data.domainDB) {
			Object.assign(domainDB, data.domainDB);
		} else {
			await app.storage.local.set({ domainDB });
		}
		console.log("Data stored in the DB", domainDB);
	}
});

// Handle Startup
app.runtime.onStartup.addListener(async () => {
	// Check if the domainLog exists in the storage, if yes, then load it or else create a new one
	const data = await app.storage.local.get("domainDB");
	if (data.domainDB) {
		Object.assign(domainDB, data.domainDB);
	} else {
		await app.storage.local.set({ domainDB });
	}
});

let isDataCollected = false;

// Handle the data from the content script
app.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
	const data = await app.storage.local.get("domainDB");
	if (data.domainDB) {
		Object.assign(domainDB, data.domainDB);
	} else {
		await app.storage.local.set({ domainDB });
	}
	if (request.type === "urlSession") {
		isDataCollected = true;
		// console.log("Received data from the content script");
		const domain = request.urlSession.domain;
		const clicks = request.urlSession.clicks;
		const totalLife = request.urlSession.sessionDuration;
		const activeLife = request.urlSession.activeSession;
		const passiveLife = request.urlSession.passiveSession;
		const distractions = request.urlSession.distractions;
		const urlObject = request.urlSession;
		if (domainDB[domain]) {
			// console.log("Domain exists in the DB", domain);
			if (totalLife === 0) {
				return; // Do not store data if the session duration is 0
			}
			domainDB[domain].clicks += clicks;
			domainDB[domain].totalLife += totalLife;
			domainDB[domain].activeLife += activeLife;
			domainDB[domain].passiveLife += passiveLife;
			domainDB[domain].distractions += distractions;
			domainDB[domain].urlVisited.push(urlObject);
		} else {
			// console.log("Domain does not exist in the DB", domain);
			domainDB[domain] = {
				clicks,
				totalLife,
				activeLife,
				passiveLife,
				distractions,
				urlVisited: [urlObject],
			};
		}
		await app.storage.local.set({ domainDB });
		console.log("Data stored in the DB", domainDB);
		setTimeout(() => {
			isDataCollected = false;
		}, 1000);
	} else if (request.type === "usageReminder") {
		const domain = request.domain;
		const time = request.time;
		app.notifications.create({
			type: "basic",
			iconUrl: "/icons/icon128.png",
			title: "Usage Reminder",
			message: `You have been on ${domain} for ${time}. Take a break!`,
		});
	}
});

// observer for tab url change (not creation of tabs), and send a message to content script to start tracking
app.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (
		changeInfo.url &&
		isDataCollected === false &&
		new URL(changeInfo.url).hostname.includes(".")
	) {
		setTimeout(() => {
			console.log("sending message to content script");
			app.tabs.sendMessage(tabId, { type: "sendData" });
		}, 500);
	}	
});
