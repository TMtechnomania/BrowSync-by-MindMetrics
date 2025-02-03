const app = chrome || browser;
const logo = document.querySelector("#logo");
const domain = document.querySelector("#domain");
const totalVisits = document.querySelector("#totalVisits");
const totalTime = document.querySelector("#totalTime");
const activityRatio = document.querySelector("#activityRatio");

// get screen width and height
const screenWidth = window.screen.width;
// set the width of the popup based on the screen width
const scale = screenWidth / 1920;
document.documentElement.style.setProperty("--scale", scale);

document.addEventListener("DOMContentLoaded", async () => {
	// Get the active tab domain
	const getDomain = async () => {
		const tabs = await app.tabs.query({
			active: true,
			currentWindow: true,
		});
		const tab = tabs[0];
		const url = new URL(tab.url);
		return url.hostname;
	};

	const currentDomain = await getDomain();

	// Get the domainDB from the storage
	const data = await app.storage.local.get("domainDB");
	const domainDB = data.domainDB || {}; // Default to empty object if domainDB doesn't exist

	logo.src = `https://www.google.com/s2/favicons?domain=https://${currentDomain}&size=128`;
	domain.textContent = currentDomain;

	// Check if the domain exists in the domainDB
	if (domainDB[currentDomain]) {
		const domainData = domainDB[currentDomain];
		totalVisits.textContent = domainData.urlVisited.length;
		const hours = Math.floor(domainData.totalLife / 3600);
		const minutes = Math.floor((domainData.totalLife % 3600) / 60);
		const seconds = domainData.totalLife % 60;
		// Display the total time in hours, minutes and seconds if the hours are greater than 0, else display only minutes and seconds
		if (hours > 0) {
			totalTime.textContent = `${hours}h ${minutes}m ${seconds}s`;
		} else {
			totalTime.textContent = `${minutes}m ${seconds}s`;
		}

        // get activity ratio based on active and passive session
        const activityRatioValue = Math.floor(
            (domainData.activeLife / domainData.totalLife) * 100,
        );
        activityRatio.textContent = `${activityRatioValue}%`;

		// send message to content.js to get the current session data as response every second
		setInterval(() => {
			app.tabs.query({ active: true, currentWindow: true }, (tabs) => {
				const currentTab = tabs[0];
				app.tabs.sendMessage(
					currentTab.id,
					{ type: "getSessionData" },
					(response) => {
						const sessionData = response.sessionData;

						// adjust the time by adding the current session time to the total time
						const totalLife =
							domainData.totalLife + sessionData.sessionDuration;
						const hours = Math.floor(totalLife / 3600);
						const minutes = Math.floor((totalLife % 3600) / 60);
						const seconds = totalLife % 60;
						if (hours > 0) {
							totalTime.textContent = `${hours}h ${minutes}m ${seconds}s`;
						} else {
							totalTime.textContent = `${minutes}m ${seconds}s`;
						}

                        // get activity ratio based on active and passive session
                        const currentTotalActiveLife = domainData.activeLife + sessionData.activeSession;
                        const currentTotalLife = domainData.totalLife + sessionData.sessionDuration;
                        const activityRatioValue = Math.floor(
                            (currentTotalActiveLife / currentTotalLife) * 100,
                        );
                        activityRatio.textContent = `${activityRatioValue}%`;
					},
				);
			});
		}, 1000);
	} else if (currentDomain.includes(".")) {
		totalVisits.textContent = 0;
		setTimeout(() => {
			try {
				// send message to content.js to get the current session data as response every second
				setInterval(() => {
					app.tabs.query(
						{ active: true, currentWindow: true },
						(tabs) => {
							const currentTab = tabs[0];
							app.tabs.sendMessage(
								currentTab.id,
								{ type: "getSessionData" },
								(response) => {
									const sessionData = response.sessionData;

									// adjust the time by adding the current session time to the total time
									const totalLife =
										sessionData.sessionDuration;
									const hours = Math.floor(totalLife / 3600);
									const minutes = Math.floor(
										(totalLife % 3600) / 60,
									);
									const seconds = totalLife % 60;
									if (hours > 0) {
										totalTime.textContent = `${hours}h ${minutes}m ${seconds}s`;
									} else {
										totalTime.textContent = `${minutes}m ${seconds}s`;
									}

                                    // get activity ratio based on active and passive session
                                    const activityRatioValue = Math.floor(
                                        (sessionData.activeSession / sessionData.sessionDuration) * 100,
                                    );
                                    activityRatio.textContent = `${activityRatioValue}%`;

								},
							);
						},
					);
				}, 1000);
			} catch (error) {
				console.log(error);
			}
		}, 1000);
	} else {
        totalVisits.textContent = "N/A";
        totalTime.textContent = "N/A";
        activityRatio.textContent = "N/A";
    }
});
