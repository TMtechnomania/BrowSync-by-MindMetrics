const app = chrome || browser;

function getDate() {
	return new Date().toISOString().split("T")[0].split("-").reverse().join("");
}

function getTime() {
	const now = new Date();
	return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

// Store the date on install as the first data recorded reference
app.runtime.onInstalled.addListener(async (e) => {
	if (e.reason === "install") {
		const date = getDate();
		await app.storage.local.set({ initiate: date });
	} else if (e.reason === "update") {
		// clear the storage on update and re-initiate the storage
		await app.storage.local.clear();
		const date = getDate();
		await app.storage.local.set({ initiate: date });
	}
});

const todaySessions = {
	date: getDate(),
	sessionStart: getTime(),
	tabSessions: {},
	urlSessions: {},
};

// Handle the tab sessions on start
app.runtime.onStartup.addListener(async () => {
    const date = getDate();
    const time = getTime();
    const storage = await app.storage.local.get();
    if (storage[date] === undefined) {
        await app.storage.local.set({ [date]: todaySessions });
    } else {
        // todaySessions = storage[date];
        Object.assign(todaySessions, storage[date]);
    }
});

// Handle the tab sessions on creation
app.tabs.onCreated.addListener(async (tab) => {
	const date = getDate();
	const time = getTime();

	const tabSession = {
		tabId: tab.id,
		tabCreated: time,
		tabRemoved: null,
		urlsVisited: [],
		domainVisited: [],
		totalTabs: tab.index,
		totalLife: 0,
		activeLife: 0,
		passiveLife: 0,
		distractions: 0,
	};

	todaySessions.tabSessions[tab.id] = tabSession;
    await app.storage.local.set({ [todaySessions.date]: todaySessions });
});

// Handle the tab on updated
app.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const date = getDate();
    const time = getTime();
	if (changeInfo.url) {
		const tabSession = todaySessions.tabSessions[tabId];
		if (tabSession === undefined) {
			return;
		}
		const urlVisited = {
			url: changeInfo.url,
			time: time,
		};
		tabSession.urlsVisited.push(urlVisited);
		if (
			!tabSession.domainVisited.includes(new URL(changeInfo.url).hostname)
		) {
			tabSession.domainVisited.push(new URL(changeInfo.url).hostname);
		}
		todaySessions.tabSessions[tabId] = tabSession;
        await app.storage.local.set({ [todaySessions.date]: todaySessions });
	}
});

// Handle the tab on removed
app.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
	const date = getDate();
	const time = getTime();
	const tabSession = todaySessions.tabSessions[tabId];
    if (tabSession === undefined) {
        return;
    }
	tabSession.tabRemoved = time;
	tabSession.totalLife = tabSession.tabRemoved - tabSession.tabCreated;
	tabSession.passiveLife = tabSession.totalLife - tabSession.activeLife;
	todaySessions.tabSessions[tabId] = tabSession;
	// console.log(todaySessions);
	await app.storage.local.set({ [todaySessions.date]: todaySessions });
});

// Handle the tab on activated
app.tabs.onActivated.addListener(async (activeInfo) => {
	if (activeInfo.tabId) {
		const date = getDate();
		const time = getTime();
		const tabSession = todaySessions.tabSessions[activeInfo.tabId];
		clearInterval(tabTimer);
        if (tabSession === undefined) {
            return;
        }
			await handleClock(tabSession, time, activeInfo.tabId);
		
	}
});

let tabTimer = null;

async function handleClock(tabSession, time, tabId) {
    await app.storage.local.set({ [todaySessions.date]: todaySessions });
	tabSession.distractions += 1;
	if (tabTimer !== null) clearInterval(tabTimer);
	tabTimer = setInterval(() => {
		tabSession.activeLife += 1;
		todaySessions.tabSessions[tabId] = tabSession;
	}, 1000);
}

app.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log(sender);
    if (request.type === "urlSession") {
        const domain = request.urlSession.domain;
        const clicks = request.urlSession.clicks;
        const activeLife = request.urlSession.activeLife;
        const distractions = request.urlSession.distractions;
        const urlObject = request.urlSession.url;
        const totalLife = request.urlSession.totalLife;
        const passiveLife = request.urlSession.passiveLife;

        // Check if the todaySessions object has the domain key in the urlSessions object
        if (todaySessions.urlSessions[domain] === undefined) {
            console.log("Domain not found");
            
            todaySessions.urlSessions[domain] = {
                domain: domain,
                clicks: clicks,
                activeLife: activeLife,
                distractions: distractions,
                urls: [urlObject],
                totalLife: totalLife,
                passiveLife: passiveLife,
            };
        } else {
            console.log("Domain found");
            console.log("Old Data", todaySessions.urlSessions[domain]);
            console.log("New Data", request.urlSession);
            
            
            todaySessions.urlSessions[domain].clicks += clicks;
            todaySessions.urlSessions[domain].activeLife += activeLife;
            todaySessions.urlSessions[domain].distractions += distractions;
            todaySessions.urlSessions[domain].urls.push(urlObject);
            todaySessions.urlSessions[domain].totalLife += totalLife;
            todaySessions.urlSessions[domain].passiveLife += passiveLife;
        }

        // console.log(todaySessions);
        await app.storage.local.set({ [todaySessions.date]: todaySessions });
        console.log("Updated", todaySessions);
        
    }
});