const app = chrome || browser;

// Set scale for popup
const screenWidth = window.screen.width;
const scale = screenWidth / 1920;
document.documentElement.style.setProperty("--scale", scale);

// Reload popup when storage changes
app.storage.onChanged.addListener(() => window.location.reload());

function decodeTimestamp(unixTimestamp) {
    // Convert timestamp to milliseconds
    const date = new Date(unixTimestamp * 1000);

    // Extract time components
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    // Extract date components
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const year = date.getFullYear();

    return `${hours}:${minutes}:${seconds} - ${day}:${month}:${year}`;
}

function subtractTimestamp(end, start) {
    let duration = end - start;
    // get the time difference in Days, Hours, Minutes, Seconds
    let days = Math.floor(duration / (60 * 60 * 24));
    duration -= days * 60 * 60 * 24;
    let hours = Math.floor(duration / (60 * 60));
    duration -= hours * 60 * 60;
    let minutes = Math.floor(duration / 60);
    duration -= minutes * 60;
    let seconds = duration;
    // return the time difference in a formatted string
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else {
        return `${minutes}m ${seconds}s`;
    }
}

document.addEventListener("DOMContentLoaded", async function () {
    const domainLogo = document.getElementById("domainLogo");
    const domainName = document.getElementById("domainName");
    const totalTimeSpent = document.getElementById("totalTimeSpent");
    const totalSessions = document.getElementById("totalSessions");
    const activeTime = document.getElementById("activeTime");
    const passiveTime = document.getElementById("passiveTime");
    const activityRatio = document.getElementById("activityRatio");
    const totalDistractions = document.getElementById("totalDistractions");
    const totalInteractions = document.getElementById("totalInteractions");

    // Get domain data
	const { domainDB = {} } = await app.storage.local.get(["domainDB"]);
	console.log("Domain DB", domainDB);

    // Get the current tab url domain parameter
    const url = new URL(window.location.href);
    const domain = url.searchParams.get("domain");
    console.log("Domain", domain);

    // Get the domain data
    const domainData = domainDB[domain] || {};
    console.log("Domain Data", domainData);
    
    // Set the domain logo using api
    domainLogo.src = `https://logo.clearbit.com/${domain}`;
    domainName.textContent = domain;
    (function () {
        const totalTime = domainData.totalLife || 0;
        const hours = Math.floor(totalTime / 3600);
        const minutes = Math.floor((totalTime % 3600) / 60);
        const seconds = totalTime % 60;
        if (hours > 0) {
            totalTimeSpent.textContent = `${hours}h ${minutes}m ${seconds}s`;
        } else {
            totalTimeSpent.textContent = `${minutes}m ${seconds}s`;
        }
    })();
    totalSessions.textContent = domainData.urlVisited?.length || 0;
    (function () {
        const active = domainData.activeLife || 0;
        const hours = Math.floor(active / 3600);
        const minutes = Math.floor((active % 3600) / 60);
        const seconds = active % 60;
        if (hours > 0) {
            activeTime.textContent = `${hours}h ${minutes}m ${seconds}s`;
        } else {
            activeTime.textContent = `${minutes}m ${seconds}s`;
        }
    })();
    (function () {
        const passive = domainData.totalLife - domainData.activeLife || 0;
        const hours = Math.floor(passive / 3600);
        const minutes = Math.floor((passive % 3600) / 60);
        const seconds = passive % 60;
        if (hours > 0) {
            passiveTime.textContent = `${hours}h ${minutes}m ${seconds}s`;
        } else {
            passiveTime.textContent = `${minutes}m ${seconds}s`;
        }
    })();
    activityRatio.textContent = `${Math.round((domainData.activeLife / domainData.totalLife) * 100)}%`;
    totalDistractions.textContent = domainData.distractions || 0;
    totalInteractions.textContent = domainData.clicks || 0;

    const table = document.getElementById("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `
        <tr>
            <th>Logo</th>
            <th>Title</th>
            <th>URL</th>
            <th>Session Start</th>
            <th>Session End</th>
            <th>Session Duration</th>
            <th>Active Time</th>
            <th>Passive Time</th>
            <th>Activity Ratio</th>
            <th>Distractions</th>
            <th>Interactions</th>
        </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    // create a thead, tbody element, and append them to the table with these properties from urlVisited array:
    // {
    //     "activeSession": 0,
    //     "clicks": 0,
    //     "distractions": 0,
    //     "domain": "account.asus.com",
    //     "passiveSession": 0,
    //     "sessionDuration": 0,
    //     "sessionEnd": 1738530722,
    //     "sessionStart": 1738530722,
    //     "title": "",
    //     "url": "https://account.asus.com/in/loginform.aspx?skey=bf1f57ae70334ba78e5df57935f4ea31&returnUrl=https%253A%252F%252Faccount.asus.com%252Finfo.aspx%253Flang%253Den-us%2526site%253Din&id=KUw4PLXzLguhkTpMagUClA%253D%253D"
    // }
    domainData.urlVisited.forEach(session => {
        const tr = document.createElement("tr");
        // the timestamps are encoded as YYYYMMDDHHMMSS, so first convert them to seconds and then to a readable date
        let sessionStart = decodeTimestamp(session.sessionStart);
        let sessionEnd = decodeTimestamp(session.sessionEnd);
        let sessionDuration = subtractTimestamp(session.sessionEnd, session.sessionStart) || "0s";
        let activeTime = subtractTimestamp(session.activeSession, 0) || "0s";
        let passiveTime = subtractTimestamp(session.passiveSession, 0) || "0s";
        let activityRatio = `${Math.round((session.activeSession / session.sessionDuration) * 100)}%` || "0%";

        // if duration is 0, DELETE the session from the table and the domainDB
        if (session.sessionDuration === 0) {
            domainData.urlVisited = domainData.urlVisited.filter(s => s.sessionDuration !== 0);
            app.storage.local.set({ domainDB });
            window.location.reload();
        }        
        
        tr.innerHTML = `
            <td><img src="https://logo.clearbit.com/${session.domain}" alt="${session.domain}"></td>
            <td>${session.title}</td>
            <td>${session.url}</td>
            <td>${sessionStart}</td>
            <td>${sessionEnd}</td>
            <td>${sessionDuration}</td>
            <td>${activeTime}</td>
            <td>${passiveTime}</td>
            <td>${activityRatio}</td>
            <td>${session.distractions}</td>
            <td>${session.clicks}</td>
        `;
        tbody.appendChild(tr);
    });



    // Settings
    // check if the storage contains any key with this domain name
    // if not, set the default values
    const blacklist = document.getElementById("blacklist");
    const usageReminder = document.getElementById("usageReminder");
    const notifyUsage = document.getElementById("notifyUsage");
    const settings = await app.storage.local.get([domain]);
    if (!settings[domain]) {
        app.storage.local.set({
            [domain]: {
                blacklist: "no",
                usageReminder: "never",
            },
        });
    } else {
        blacklist.value = settings[domain].blacklist;
        usageReminder.value = settings[domain].usageReminder;
    }

    // Update settings
    blacklist.addEventListener("change", function () {
        app.storage.local.set({
            [domain]: {
                ...settings[domain],
                blacklist: this.value,
            },
        });
    });

    usageReminder.addEventListener("change", function () {
        app.storage.local.set({
            [domain]: {
                ...settings[domain],
                usageReminder: this.value,
            },
        });
    });

    // check if the url has parameter blacklisted=true, if so, show a message that the domain is blacklisted
    const blacklisted = url.searchParams.get("blacklisted");
    if (blacklisted === "true") {
        // create alert that the domain is blacklisted
        alert(`This domain: ${domain} is blacklisted`);
        // update url to remove the parameter
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("blacklisted");
        window.location.href = newUrl;
    }

    // check if the url has parameter delete=true, if so, delete the domain from the domainDB and redirect to the home page
    const deleted = url.searchParams.get("delete");
    if (deleted === "true") {
        // delete the domain from the domainDB
        delete domainDB[domain];
        await app.storage.local.set({ domainDB });
        // redirect to the home page
        window.location.href = "/dashboard.html";
    }
});