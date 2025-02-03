const app = chrome || browser;

function getTimestamp() {
	const now = new Date();
    return Math.floor(now.getTime() / 1000);
}

// Wait until the DOM is ready
document.addEventListener("DOMContentLoaded", async function () {
    console.log("DOM loaded");
    let timestamp = getTimestamp(); // Start time
    let clicks = 0;
    let activeLife = 0;
    let distractions = 0;
    let isTabActive = true;
    let url = window.location.href;
    let domain = window.location.hostname;
    let timeInterval;

    // Function to start tracking active time
    function startTimeTracking() {
        timeInterval = setInterval(() => {
            if (isTabActive) activeLife++;
        }, 1000);
    }

    function stopTimeTracking() {
        clearInterval(timeInterval);
    }

    function sendData() {
        stopTimeTracking();
        const sessionEndTimestamp = getTimestamp();

        const urlSession = {
            domain: domain,
            url: url,
            title: document.title,
            clicks: clicks,
            sessionDuration: sessionEndTimestamp - timestamp,
            activeSession: activeLife,
            passiveSession: sessionEndTimestamp - timestamp - activeLife,
            distractions: distractions,
            sessionStart: timestamp,
            sessionEnd: sessionEndTimestamp,
        };

        // Send data to background script
        app.runtime.sendMessage({ type: "urlSession", urlSession });

        // Reset for the new session
        timestamp = sessionEndTimestamp;
        url = window.location.href;
        clicks = 0;
        activeLife = 0;
        distractions = 0;
        startTimeTracking();
    }

    // Track clicks
    document.addEventListener("click", () => clicks++);

    // Track tab visibility (distractions)
    document.addEventListener("visibilitychange", () => {
        isTabActive = !document.hidden;
        if (document.hidden) distractions++;
    });

    // Event listener for full page unload
    window.addEventListener("beforeunload", sendData);

    // Handle navigation changes
    function handleURLChange() {
        if (url !== window.location.href) {
            sendData(); // Send previous session data
        }
    }

    // Listen for SPA navigation events
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

    // window.addEventListener("popstate", handleURLChange); // Back/Forward button
    // window.addEventListener("hashchange", handleURLChange); // URL hash changes
    // window.addEventListener("locationchange", handleURLChange); // Custom event for SPA changes

    // Listen for requests from background script
    app.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "getSessionData") {
            sendResponse({
                sessionData: {
                    domain: domain,
                    url: url,
                    title: document.title,
                    clicks: clicks,
                    sessionDuration: getTimestamp() - timestamp,
                    activeSession: activeLife,
                    passiveSession: getTimestamp() - timestamp - activeLife,
                    distractions: distractions,
                    sessionStart: timestamp,
                    sessionEnd: getTimestamp(),
                },
            });
        } else if (request.type === "sendData") {
            sendData();
        }
    });

    // Start tracking time
    startTimeTracking();

    let isUsageReminder = false;
    let usageReminderInterval;


    // Handle settings, first check if the storage has a key with this domain name
    // if not, set the default values
    const settings = await app.storage.local.get([domain]);
    if (!settings[domain]) {
        app.storage.local.set({
            [domain]: {
                blacklist: "no",
                usageReminder: "never",
                notifyUsage: "never",
            },
        });
    } else {
        if (settings[domain].blacklist === "yes") {
            isBlacklisted = true;
            // Get the correct extension page URL
            const extensionURL = chrome.runtime.getURL("website.html");
            
            // Redirect to the extension page with parameters
            window.location.href = `${extensionURL}?domain=${domain}&blacklisted=true`;
        }        
        if (settings[domain].usageReminder !== "never") {
            isUsageReminder = true;
            if (settings[domain].usageReminder === "30m") {
                usageReminderInterval = 30 * 60;
            } else if (settings[domain].usageReminder === "1h") {
                usageReminderInterval = 60 * 60;
            } else if (settings[domain].usageReminder === "2h") {
                usageReminderInterval = 2 * 60 * 60;
            } else if (settings[domain].usageReminder === "4h") {
                usageReminderInterval = 4 * 60 * 60;
            }

            // Start the interval
            setInterval(() => {
                app.runtime.sendMessage({ type: "usageReminder", domain,
                    time: settings[domain].usageReminder
                 });
                //  create a alert
                alert("You have been using this site for a long time. Take a break!");
            }, usageReminderInterval * 1000);
        }
    }
});
