const app = chrome || browser;

// Helper: Format seconds into readable time
function formatTime(seconds) {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return (
		hrs > 0 ? `${hrs}h ${mins}m`
		: mins > 0 ? `${mins}m ${secs}s`
		: `${secs}s`
	);
}

// Generate a SVG data-url fallback favicon
function generateFallbackFavicon(domain, size = 128) {
	const initial = domain && domain[0] ? domain[0].toUpperCase() : "B";
	const fontSize = Math.floor(size * 0.46);
	const svg = `
        <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
            <defs>
                <linearGradient id='g' x1='0' x2='1'>
                    <stop offset='0' stop-color='#FF6B35'/>
                    <stop offset='1' stop-color='#DC2626'/>
                </linearGradient>
            </defs>
            <rect width='100%' height='100%' rx='18' fill='url(#g)' />
            <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Inter, system-ui, sans-serif' font-size='${fontSize}' fill='#FFFFFF' font-weight='700'>${initial}</text>
        </svg>`;
	return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function setFaviconWithFallback(imgEl, domain, size = 128) {
	function isLikelyRemoteDomain(d) {
		if (!d) return false;
		if (/^(127|10|192|0)\.|^localhost$/i.test(d)) return false;
		if (!d.includes(".")) return false;
		if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(d)) return false;
		return true;
	}

	function generateGlobeSvg(domain, size = 64) {
		const svg = `
        <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'>
          <defs>
            <linearGradient id='bg' x1='0' x2='1'>
              <stop offset='0' stop-color='rgba(255,107,53,0.12)' />
              <stop offset='1' stop-color='rgba(220,38,38,0.08)' />
            </linearGradient>
          </defs>
          <rect width='100%' height='100%' rx='6' fill='url(#bg)' />
          <circle cx='12' cy='12' r='7' fill='#DC2626' />
          <path d='M12 5a7 7 0 010 14' stroke='rgba(255,255,255,0.9)' stroke-width='0.9' fill='none'/>
          <path d='M9 6c1 1.6 1 10.6 0 12' stroke='rgba(255,255,255,0.85)' stroke-width='0.9' fill='none'/>
          <path d='M15 6c-1 1.6-1 10.6 0 12' stroke='rgba(255,255,255,0.85)' stroke-width='0.9' fill='none'/>
          <path d='M6 12h12' stroke='rgba(255,255,255,0.9)' stroke-width='0.9' fill='none'/>
        </svg>`;
		return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
	}

	try {
		if (!domain) {
			imgEl.src = "/icons/128.png";
			return;
		}

		if (!isLikelyRemoteDomain(domain)) {
			imgEl.src = generateGlobeSvg(domain, size);
			return;
		}

		imgEl.src = `https://logo.clearbit.com/${domain}?size=${size}`;
		imgEl.onerror = () => {
			imgEl.onerror = null;
			imgEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
			imgEl.onerror = () => {
				imgEl.onerror = null;
				imgEl.src = generateFallbackFavicon(domain, size);
			};
		};
	} catch (err) {
		imgEl.src = generateFallbackFavicon(domain, size);
	}
}

// Format bytes to nice memory display
function formatMemoryNice(bytes) {
	const mb = bytes / (1024 * 1024);
	if (mb >= 1024) {
		return `${(mb / 1024).toFixed(1)} GB`;
	}
	return `${mb.toFixed(1)} MB`;
}

// Generate local productivity summary
function generateLocalSummary(domainDB, domains) {
	const totalSeconds = domains.reduce(
		(sum, domain) => sum + (domainDB[domain].totalLife || 0),
		0,
	);
	const totalClicks = domains.reduce(
		(sum, domain) => sum + (domainDB[domain].clicks || 0),
		0,
	);
	const totalDistractions = domains.reduce(
		(sum, domain) => sum + (domainDB[domain].distractions || 0),
		0,
	);
	const totalSessions = domains.reduce(
		(sum, domain) => sum + (domainDB[domain].urlVisited?.length || 0),
		0,
	);

	const avgActivityRatio =
		(domains.reduce((sum, domain) => {
			const total = domainDB[domain].totalLife || 1;
			const active = domainDB[domain].activeLife || 0;
			return sum + active / total;
		}, 0) /
			domains.length) *
		100;

	const sortedByActivity = domains.slice().sort((a, b) => {
		const ratioA =
			(domainDB[a].activeLife || 0) / (domainDB[a].totalLife || 1);
		const ratioB =
			(domainDB[b].activeLife || 0) / (domainDB[b].totalLife || 1);
		return ratioB - ratioA;
	});

	const svg = (icon) => {
		const icons = {
			chart: `<svg class="inline-block mr-2 align-text-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke="currentColor" stroke-width="1.6"/><path d="M7 13v6M12 9v10M17 5v14" stroke="currentColor" stroke-width="1.6"/></svg>`,
			check: `<svg class="inline-block mr-2 align-text-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="1.6"/></svg>`,
			thumb: `<svg class="inline-block mr-2 align-text-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 9V5a3 3 0 00-3-3l-1 0A2 2 0 009 4v9M7 15v6h10a2 2 0 002-2v-4a2 2 0 00-2-2H7z" stroke="currentColor" stroke-width="1.6"/></svg>`,
			bell: `<svg class="inline-block mr-2 align-text-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V4a1 1 0 10-2 0v1.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z" stroke="currentColor" stroke-width="1.4"/></svg>`,
			target: `<svg class="inline-block mr-2 align-text-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M12 8v4l2 2" stroke="currentColor" stroke-width="1.4"/></svg>`,
			clock: `<svg class="inline-block mr-2 align-text-bottom" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/><path d="M12 7v6l3 2" stroke="currentColor" stroke-width="1.4"/></svg>`,
		};
		return icons[icon] || "";
	};

	const insights = [];

	if (totalSeconds > 0) {
		insights.push(
			`${svg("chart")}You've spent <strong>${formatTime(totalSeconds)}</strong> across <strong>${domains.length}</strong> websites.`,
		);
	}

	if (avgActivityRatio > 70) {
		insights.push(
			`${svg("check")}Great job! Your average activity ratio is <strong>${avgActivityRatio.toFixed(1)}%</strong>, showing high engagement.`,
		);
	} else if (avgActivityRatio > 50) {
		insights.push(
			`${svg("thumb")}Your activity ratio is <strong>${avgActivityRatio.toFixed(1)}%</strong>. Consider minimizing distractions to boost productivity.`,
		);
	} else {
		insights.push(
			`${svg("bell")}Your activity ratio is <strong>${avgActivityRatio.toFixed(1)}%</strong>. You may be multitasking too much - try focusing on one task at a time.`,
		);
	}

	if (totalDistractions > totalSessions * 0.5) {
		insights.push(
			`${svg("bell")}You have <strong>${totalDistractions}</strong> distractions. Try using focus mode or website blockers to stay on track.`,
		);
	}

	if (sortedByActivity.length > 0) {
		const topProductive = sortedByActivity[0];
		const ratio = (
			((domainDB[topProductive].activeLife || 0) /
				(domainDB[topProductive].totalLife || 1)) *
			100
		).toFixed(1);
		insights.push(
			`${svg("target")}Most engaged site: <strong>${topProductive}</strong> with ${ratio}% activity.`,
		);
	}

	const avgSessionTime = totalSeconds / (totalSessions || 1);
	if (avgSessionTime > 1800) {
		insights.push(
			`${svg("clock")}Your average session is <strong>${formatTime(Math.floor(avgSessionTime))}</strong>. Remember to take regular breaks!`,
		);
	}

	return insights.join("<br>");
}

// Category configuration
const CATEGORY_KEYS = ["productivity", "entertainment", "other", "unknown"];
const CATEGORY_COLORS = {
	productivity: "#FF6B35",
	entertainment: "#FF9153",
	other: "#FFD4C2",
	unknown: "#94A3B8",
};
const CATEGORY_LABELS = {
	productivity: "Productivity",
	entertainment: "Entertainment",
	other: "Other",
	unknown: "Unassigned",
};

function ensureCategoryShape(categories = {}) {
	const shaped = {};
	CATEGORY_KEYS.forEach((key) => {
		shaped[key] = Number(categories?.[key]) || 0;
	});
	return shaped;
}

function normalizeUsageTimeline(rawTimeline = {}) {
	const normalized = { hourly: {}, daily: {} };
	if (rawTimeline && typeof rawTimeline === "object") {
		if (rawTimeline.hourly && typeof rawTimeline.hourly === "object") {
			for (const [key, entry] of Object.entries(rawTimeline.hourly)) {
				const numericKey = Number(key);
				if (!Number.isFinite(numericKey)) continue;
				normalized.hourly[numericKey] = {
					total: Number(entry?.total) || 0,
					categories: ensureCategoryShape(entry?.categories),
				};
			}
		}
		if (rawTimeline.daily && typeof rawTimeline.daily === "object") {
			for (const [key, entry] of Object.entries(rawTimeline.daily)) {
				const numericKey = Number(key);
				if (!Number.isFinite(numericKey)) continue;
				normalized.daily[numericKey] = {
					total: Number(entry?.total) || 0,
					categories: ensureCategoryShape(entry?.categories),
				};
			}
		}
	}
	return normalized;
}

function buildHourlyBuckets(hourlyMap = {}, hours = 24) {
	const buckets = [];
	const now = new Date();
	const currentHourStartSeconds = Math.floor(now.getTime() / 3600000) * 3600;
	for (let i = hours - 1; i >= 0; i--) {
		const bucketStart = currentHourStartSeconds - i * 3600;
		const entry = hourlyMap[bucketStart] || {
			total: 0,
			categories: ensureCategoryShape(),
		};
		const labelDate = new Date(bucketStart * 1000);
		const label = labelDate.toLocaleTimeString([], { hour: "numeric" });
		buckets.push({
			label,
			total: Number(entry.total) || 0,
			categories: ensureCategoryShape(entry.categories),
			timestamp: bucketStart,
		});
	}
	return buckets;
}

function buildDailyBuckets(dailyMap = {}, days = 7, labelMode = "weekday") {
	const buckets = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	for (let i = days - 1; i >= 0; i--) {
		const day = new Date(today.getTime());
		day.setDate(day.getDate() - i);
		const dayKey = Math.floor(day.getTime() / 1000);
		const entry = dailyMap[dayKey] || {
			total: 0,
			categories: ensureCategoryShape(),
		};
		let label;
		if (labelMode === "shortDate") {
			label = `${day.getMonth() + 1}/${day.getDate()}`;
		} else {
			label = day.toLocaleDateString([], { weekday: "short" });
		}
		buckets.push({
			label,
			total: Number(entry.total) || 0,
			categories: ensureCategoryShape(entry.categories),
			timestamp: dayKey,
		});
	}
	return buckets;
}

function sumCategories(buckets = []) {
	const totals = ensureCategoryShape();
	buckets.forEach((bucket) => {
		CATEGORY_KEYS.forEach((key) => {
			totals[key] += Number(bucket.categories?.[key]) || 0;
		});
	});
	return totals;
}

function getPeakBucket(buckets = []) {
	return buckets.reduce((peak, bucket) => {
		if (!peak || bucket.total > peak.total) {
			return bucket;
		}
		return peak;
	}, null);
}

function generateUsageBarChart(buckets = [], options = {}) {
	const viewWidth = options.width || 560;
	const viewHeight = options.height || 130;
	const gap = buckets.length > 24 ? 2 : 6;
	const max = Math.max(...buckets.map((b) => b.total), 1);
	const barWidth = Math.max(
		4,
		Math.floor(
			(viewWidth - gap * (buckets.length - 1)) /
				Math.max(1, buckets.length),
		),
	);
	const barColor = options.barColor || "#FF6B35";
	const bgColor = options.barBackground || "rgba(255,107,53,0.12)";
	const ariaLabel = options.ariaLabel || "Usage chart";
	const svgParts = [];
	svgParts.push(
		`<svg class="usage-chart" width="100%" height="${viewHeight}" viewBox="0 0 ${viewWidth} ${viewHeight}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ariaLabel}">`,
	);
	const baselineY = viewHeight - 18;
	for (let g = 0; g <= 3; g++) {
		const y = baselineY - ((viewHeight - 40) / 3) * g;
		svgParts.push(
			`<line x1="0" y1="${y}" x2="${viewWidth}" y2="${y}" stroke="rgba(12,18,31,0.08)" stroke-width="1" />`,
		);
	}
	buckets.forEach((bucket, index) => {
		const x = index * (barWidth + gap);
		const height =
			max ? Math.max(0, (bucket.total / max) * (viewHeight - 40)) : 0;
		const y = baselineY - height;
		const categories = encodeURIComponent(
			JSON.stringify(bucket.categories || {}),
		);
		const label = encodeURIComponent(bucket.label || "");
		const title = encodeURIComponent(
			`${bucket.label} • ${formatTime(Math.round(bucket.total || 0))}`,
		);
		svgParts.push(
			`<rect x="${x}" y="${baselineY - (viewHeight - 40)}" width="${barWidth}" height="${viewHeight - 40}" rx="6" fill="${bgColor}" fill-opacity="0.35" />`,
		);
		svgParts.push(
			`<rect class="usage-bar" data-range="${options.range || ""}" data-label="${label}" data-title="${title}" data-total="${bucket.total || 0}" data-cats="${categories}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="6" fill="${barColor}" />`,
		);
	});
	svgParts.push("</svg>");
	return svgParts.join("");
}

function formatPercentage(part, total) {
	if (!total) return "0%";
	return `${Math.round((part / total) * 100)}%`;
}

function categoryLegendMarkup() {
	const chips = CATEGORY_KEYS.map((key) => {
		return `<span class="category-chip"><span class="legend-dot" style="background:${CATEGORY_COLORS[key]};"></span>${CATEGORY_LABELS[key]}</span>`;
	}).join("");
	return `<div class="category-legend">${chips}</div>`;
}

function attachUsageTooltips(container) {
	let tip = document.getElementById("usage-chart-tooltip");
	if (!tip) {
		tip = document.createElement("div");
		tip.id = "usage-chart-tooltip";
		tip.style.position = "fixed";
		tip.style.pointerEvents = "none";
		tip.style.zIndex = "9999";
		tip.style.padding = "10px 12px";
		tip.style.borderRadius = "12px";
		tip.style.boxShadow = "0 16px 36px rgba(8,15,30,0.18)";
		tip.style.transition = "opacity 140ms ease, transform 140ms ease";
		tip.style.opacity = "0";
		document.body.appendChild(tip);
	}
	const applyTheme = () => {
		const dark = document.documentElement.classList.contains("dark");
		if (dark) {
			tip.style.background = "rgba(12,18,31,0.92)";
			tip.style.color = "#F9FAFB";
			tip.style.boxShadow = "0 16px 36px rgba(2,6,23,0.42)";
		} else {
			tip.style.background = "rgba(255,255,255,0.96)";
			tip.style.color = "#0B1220";
			tip.style.boxShadow = "0 16px 32px rgba(15,23,42,0.18)";
		}
	};
	applyTheme();

	const bars = container.querySelectorAll("rect.usage-bar");
	bars.forEach((bar) => {
		bar.addEventListener("mouseenter", () => {
			const label = decodeURIComponent(
				bar.getAttribute("data-label") || "",
			);
			const total = Number(bar.getAttribute("data-total") || 0);
			const categories = bar.getAttribute("data-cats");
			let parsedCats = {};
			try {
				parsedCats = JSON.parse(
					decodeURIComponent(categories || "%7B%7D"),
				);
			} catch (_) {
				parsedCats = {};
			}
			parsedCats = ensureCategoryShape(parsedCats);
			const lines = CATEGORY_KEYS.filter(
				(key) => parsedCats[key] > 0,
			).map((key) => {
				const value = Math.round(parsedCats[key] || 0);
				return `<div class="usage-tooltip-line"><span class="legend-dot" style="background:${CATEGORY_COLORS[key]};"></span><span>${CATEGORY_LABELS[key]}</span><strong>${formatTime(value)}</strong><span class="usage-tooltip-share">${formatPercentage(value, total)}</span></div>`;
			});
			const fallbackLine =
				'<div class="usage-tooltip-line muted">No activity tracked</div>';
			tip.innerHTML = `
                <div class="usage-tooltip-heading">${label || "No label"}</div>
                <div class="usage-tooltip-total">${formatTime(Math.round(total))}</div>
                <div class="usage-tooltip-breakdown">${lines.length ? lines.join("") : fallbackLine}</div>
            `;
			tip.style.opacity = "1";
			tip.style.transform = "translateY(-6px)";
		});
		bar.addEventListener("mousemove", (event) => {
			tip.style.left = `${event.clientX + 14}px`;
			tip.style.top = `${event.clientY - 24}px`;
		});
		bar.addEventListener("mouseleave", () => {
			tip.style.opacity = "0";
			tip.style.transform = "translateY(0)";
		});
	});

	if (!tip.dataset.themeObserverAttached) {
		const observer = new MutationObserver(applyTheme);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		tip.dataset.themeObserverAttached = "true";
	}
}

async function renderDerivedMetrics(
	domainDB,
	domains,
	usageTimeline = { hourly: {}, daily: {} },
) {
	try {
		const container = document.getElementById("derivedMetrics");
		if (!container) return;

		const timeline = normalizeUsageTimeline(usageTimeline);

		const allSessions = [];
		domains.forEach((domain) => {
			const sessions = domainDB[domain].urlVisited || [];
			sessions.forEach((session) => {
				allSessions.push({ domain, ...session });
			});
		});

		const totalSessions = allSessions.length;
		const totalTime = allSessions.reduce(
			(sum, s) => sum + (Number(s.sessionDuration) || 0),
			0,
		);
		const avgSession =
			totalSessions ? Math.round(totalTime / totalSessions) : 0;
		const totalActive = domains.reduce(
			(sum, domain) => sum + (domainDB[domain].activeLife || 0),
			0,
		);
		const totalPassive = domains.reduce(
			(sum, domain) => sum + (domainDB[domain].passiveLife || 0),
			0,
		);
		const focusRatio =
			totalTime ? Math.round((totalActive / totalTime) * 100) : 0;

		let bounceThreshold = 30;
		try {
			const settings = await app.storage.local.get(["bounceThreshold"]);
			if (settings && typeof settings.bounceThreshold !== "undefined")
				bounceThreshold = Number(settings.bounceThreshold) || 30;
		} catch (_) {}

		const bounceCount = allSessions.filter(
			(session) =>
				(Number(session.sessionDuration) || 0) <= bounceThreshold,
		).length;
		const bounceRate =
			totalSessions ? Math.round((bounceCount / totalSessions) * 100) : 0;

		const last24Buckets = buildHourlyBuckets(timeline.hourly, 24);
		const last7Buckets = buildDailyBuckets(timeline.daily, 7, "weekday");
		const last30Buckets = buildDailyBuckets(
			timeline.daily,
			30,
			"shortDate",
		);
		const weeklyCategoryTotals = sumCategories(last7Buckets);
		const weeklyTotal = Object.values(weeklyCategoryTotals).reduce(
			(sum, value) => sum + value,
			0,
		);
		const topWeeklyCategory =
			CATEGORY_KEYS.slice().sort(
				(a, b) =>
					(weeklyCategoryTotals[b] || 0) -
					(weeklyCategoryTotals[a] || 0),
			)[0] || "unknown";
		const peakHour = getPeakBucket(last24Buckets);
		const peakDay = getPeakBucket(last7Buckets);
		const peakMonth = getPeakBucket(last30Buckets);
		const monthTotalSeconds = last30Buckets.reduce(
			(sum, bucket) => sum + (bucket.total || 0),
			0,
		);

		const insightCards = [
			{
				title: "Avg session length",
				value: formatTime(avgSession),
				subtitle:
					totalSessions ?
						`Across ${totalSessions} sessions`
					:	"Awaiting browsing data",
			},
			{
				title: `Bounce rate ≤ ${bounceThreshold}s`,
				value: `${bounceRate}%`,
				subtitle: `${bounceCount} quick exits`,
			},
			{
				title: "Focus ratio",
				value: `${focusRatio}%`,
				subtitle:
					totalTime ?
						`${formatTime(Math.round(totalActive))} active / ${formatTime(Math.round(totalPassive))} passive`
					:	"No focus data yet",
			},
			{
				title: `${CATEGORY_LABELS[topWeeklyCategory] || "Usage mix"} (7d)`,
				value: formatTime(
					Math.round(weeklyCategoryTotals[topWeeklyCategory] || 0),
				),
				subtitle:
					weeklyTotal ?
						`${formatPercentage(weeklyCategoryTotals[topWeeklyCategory] || 0, weeklyTotal)} of last 7 days`
					:	"No category data yet",
			},
		];

		const cardsMarkup = insightCards
			.map(
				(card) => `
            <article class="insight-card">
                <p class="insight-card__title">${card.title}</p>
                <p class="insight-card__value">${card.value}</p>
                <p class="insight-card__subtitle">${card.subtitle}</p>
            </article>
        `,
			)
			.join("");

		const formatHourLabel = (bucket) => {
			if (!bucket) return "—";
			return new Date((bucket.timestamp || 0) * 1000).toLocaleTimeString(
				[],
				{ hour: "numeric" },
			);
		};
		const formatDayLabel = (bucket) => {
			if (!bucket) return "—";
			return new Date((bucket.timestamp || 0) * 1000).toLocaleDateString(
				[],
				{ month: "short", day: "numeric" },
			);
		};

		const chartCards = [
			{
				title: "Last 24 hours",
				subtitle:
					peakHour && peakHour.total ?
						`Peak around ${formatHourLabel(peakHour)}`
					:	"No hourly activity yet",
				buckets: last24Buckets,
				range: "24h",
				barColor: CATEGORY_COLORS.productivity,
				ariaLabel: "Hourly usage across the last 24 hours",
				axis:
					last24Buckets.length ?
						`${formatHourLabel(last24Buckets[0])} → ${formatHourLabel(last24Buckets[last24Buckets.length - 1])}`
					:	"24 hour window",
				footer:
					peakHour && peakHour.total ?
						`${formatTime(Math.round(peakHour.total))} during ${formatHourLabel(peakHour)}`
					:	"No time recorded",
			},
			{
				title: "Last 7 days",
				subtitle:
					peakDay && peakDay.total ?
						`Highest on ${formatDayLabel(peakDay)}`
					:	"No daily activity yet",
				buckets: last7Buckets,
				range: "7d",
				barColor: CATEGORY_COLORS.entertainment,
				ariaLabel: "Daily usage across the last 7 days",
				axis:
					last7Buckets.length ?
						`${formatDayLabel(last7Buckets[0])} → ${formatDayLabel(last7Buckets[last7Buckets.length - 1])}`
					:	"7 day window",
				footer:
					peakDay && peakDay.total ?
						`${formatTime(Math.round(peakDay.total))} on ${formatDayLabel(peakDay)}`
					:	"No time recorded",
			},
			{
				title: "Last 30 days",
				subtitle:
					peakMonth && peakMonth.total ?
						`Top day ${formatDayLabel(peakMonth)}`
					:	"No monthly data yet",
				buckets: last30Buckets,
				range: "30d",
				barColor: CATEGORY_COLORS.other,
				ariaLabel: "Daily usage across the last 30 days",
				axis:
					last30Buckets.length ?
						`${formatDayLabel(last30Buckets[0])} → ${formatDayLabel(last30Buckets[last30Buckets.length - 1])}`
					:	"30 day window",
				footer:
					monthTotalSeconds ?
						`${formatTime(Math.round(monthTotalSeconds))} tracked this month`
					:	"Waiting for more history",
			},
		];

		const chartsMarkup = chartCards
			.map(
				(card) => `
            <article class="usage-graph-card">
                <header class="usage-graph-card__header">
                    <div>
                        <h4>${card.title}</h4>
                        <p class="usage-graph-card__hint">${card.subtitle}</p>
                    </div>
                    <span class="usage-graph-card__range">${card.axis}</span>
                </header>
                <div class="usage-graph-card__chart">${generateUsageBarChart(card.buckets, { width: card.range === "30d" ? 600 : 520, height: card.range === "30d" ? 140 : 120, barColor: card.barColor, range: card.range, ariaLabel: card.ariaLabel })}</div>
                <footer class="usage-graph-card__footer">${card.footer}</footer>
            </article>
        `,
			)
			.join("");

		container.innerHTML = `
            <div class="insight-card-grid">${cardsMarkup}</div>
            ${categoryLegendMarkup()}
            <div class="usage-graph-grid">${chartsMarkup}</div>
        `;

		attachUsageTooltips(container);
	} catch (error) {
		console.error("renderDerivedMetrics error", error);
	}
}

// Create domain list item for top sites
function createDomainListItem(
	domain,
	visits,
	timeSeconds,
	maxValue,
	isTime = true,
) {
	const percentage = Math.min(
		100,
		((isTime ? timeSeconds : visits) / (maxValue || 1)) * 100,
	);

	const container = document.createElement("button");
	container.type = "button";
	container.className = "domain-list-item";
	container.onclick = () =>
		(window.location.href = `/website.html?domain=${encodeURIComponent(domain)}`);

	const favicon = document.createElement("img");
	favicon.alt = `${domain} logo`;
	favicon.className = "domain-icon";
	favicon.loading = "lazy";
	setFaviconWithFallback(favicon, domain, 64);

	const details = document.createElement("div");
	details.className = "domain-details";

	const topRow = document.createElement("div");
	topRow.className = "domain-top-row";

	const name = document.createElement("span");
	name.className = "domain-name";
	name.textContent = domain;

	const metric = document.createElement("span");
	metric.className = "domain-metric";
	metric.textContent = isTime ? formatTime(timeSeconds) : `${visits} visits`;

	topRow.append(name, metric);

	const progressTrack = document.createElement("div");
	progressTrack.className = "domain-progress-track";

	const progressBar = document.createElement("div");
	progressBar.className = "domain-progress-bar";
	progressBar.style.width = `${percentage}%`;
	if (percentage > 0) {
		progressBar.style.minWidth = "6px";
	}

	progressTrack.append(progressBar);
	details.append(topRow, progressTrack);
	container.append(favicon, details);

	return container;
}

document.addEventListener("DOMContentLoaded", async () => {
	const sessionsTotalEl = document.querySelector("#sessionsTotal");
	const sessionsSubEl = document.querySelector("#sessionsSub");
	const top5ListEl = document.querySelector("#top5List");
	const top5VisitsEl = document.querySelector("#top5Visits");
	const totalTimeSpentEl = document.querySelector("#totalTimeSpent");
	const totalDistractionsEl = document.querySelector("#totalDistractions");
	const totalInteractionsEl = document.querySelector("#totalInteractions");
	const openTabsCountEl = document.querySelector("#openTabsCount");
	const memoryUsageDisplayEl = document.querySelector("#memoryUsageDisplay");
	const productivitySummaryEl = document.querySelector(
		"#productivitySummary",
	);
	const productivityBadgeEl = document.querySelector("#productivityBadge");
	const domainTableBodyEl = document.querySelector("#domainTableBody");
	const searchInput = document.querySelector("#searchInput");
	const refreshBtn = document.querySelector("#refreshBtn");
	const sortSelect = document.getElementById("sortSelect");
	const sortResetBtn = document.getElementById("sortResetBtn");
	const bounceThresholdSelect = document.getElementById(
		"bounceThresholdSelect",
	);
	const bounceSavedEl = document.getElementById("bounceSaved");

	let allDomains = [];
	let filteredDomains = [];
	let currentDomainDB = {};
	let currentSearchTerm = "";
	let currentSortKey = "alphabetical";
	let cachedUsageTimeline = normalizeUsageTimeline();

	// Update system stats
	async function updateSystemStats() {
		try {
			const allTabs = await app.tabs.query({});
			openTabsCountEl.textContent = allTabs.length;

			if (chrome.system && chrome.system.memory) {
				const memInfo = await chrome.system.memory.getInfo();
				const total = memInfo.capacity || 0;
				const available = memInfo.availableCapacity || 0;
				const usedMemory = Math.max(0, total - available);
				memoryUsageDisplayEl.textContent = `${formatMemoryNice(usedMemory)}`;
			} else {
				memoryUsageDisplayEl.textContent = "N/A";
			}
		} catch (error) {
			console.log("System stats unavailable:", error);
			memoryUsageDisplayEl.textContent = "N/A";
		}
	}

	function sortDomainsList(domains, sourceDb) {
		const sortable = domains.slice();
		switch (currentSortKey) {
			case "time":
				return sortable.sort(
					(a, b) =>
						(sourceDb[b]?.totalLife || 0) -
						(sourceDb[a]?.totalLife || 0),
				);
			case "visits":
				return sortable.sort(
					(a, b) =>
						(sourceDb[b]?.urlVisited?.length || 0) -
						(sourceDb[a]?.urlVisited?.length || 0),
				);
			case "activity":
				return sortable.sort((a, b) => {
					const ratioA =
						(sourceDb[a]?.activeLife || 0) /
						Math.max(1, sourceDb[a]?.totalLife || 1);
					const ratioB =
						(sourceDb[b]?.activeLife || 0) /
						Math.max(1, sourceDb[b]?.totalLife || 1);
					return ratioB - ratioA;
				});
			case "distractions":
				return sortable.sort(
					(a, b) =>
						(sourceDb[b]?.distractions || 0) -
						(sourceDb[a]?.distractions || 0),
				);
			case "alphabetical":
			default:
				return sortable.sort((a, b) => a.localeCompare(b));
		}
	}

	function updateFilteredDomains(sourceDb = currentDomainDB) {
		if (!sourceDb) return;
		const base =
			currentSearchTerm ?
				allDomains.filter((domain) =>
					domain.toLowerCase().includes(currentSearchTerm),
				)
			:	allDomains.slice();
		filteredDomains = sortDomainsList(base, sourceDb);
		renderDomainTable(sourceDb, filteredDomains);
	}

	async function loadDashboard() {
		try {
			const settings = await app.storage.local.get(["bounceThreshold"]);
			const b = settings.bounceThreshold || 30;
			if (bounceThresholdSelect) bounceThresholdSelect.value = String(b);
		} catch (e) {}

		const { domainDB = {}, usageTimeline = { hourly: {}, daily: {} } } =
			await app.storage.local.get(["domainDB", "usageTimeline"]);
		const domains = Object.keys(domainDB);

		if (!domains.length) {
			if (sessionsTotalEl)
				sessionsTotalEl.textContent = "No browsing data yet.";
			if (sessionsSubEl)
				sessionsSubEl.textContent = "Start browsing to see your stats!";
			top5ListEl.innerHTML =
				'<p style="color: var(--text-tertiary); font-size: 14px;">No data available</p>';
			top5VisitsEl.innerHTML =
				'<p style="color: var(--text-tertiary); font-size: 14px;">No data available</p>';
			productivitySummaryEl.innerHTML =
				"<p>Start browsing to get personalized insights.</p>";
			currentDomainDB = {};
			allDomains = [];
			filteredDomains = [];
			cachedUsageTimeline = normalizeUsageTimeline();
			updateFilteredDomains(currentDomainDB);
			return;
		}

		currentDomainDB = domainDB;
		allDomains = domains;
		cachedUsageTimeline = normalizeUsageTimeline(usageTimeline);
		updateFilteredDomains(currentDomainDB);

		const totalSessions = domains.reduce(
			(sum, domain) => sum + (domainDB[domain].urlVisited?.length || 0),
			0,
		);
		if (sessionsTotalEl) sessionsTotalEl.textContent = `${totalSessions}`;
		if (sessionsSubEl)
			sessionsSubEl.textContent = `across ${domains.length} domains`;

		const totalSeconds = domains.reduce(
			(sum, domain) => sum + (domainDB[domain].totalLife || 0),
			0,
		);
		totalTimeSpentEl.textContent = formatTime(totalSeconds);

		const totalClicks = domains.reduce(
			(sum, domain) => sum + (domainDB[domain].clicks || 0),
			0,
		);
		const totalDistractionCount = domains.reduce(
			(sum, domain) => sum + (domainDB[domain].distractions || 0),
			0,
		);
		totalInteractionsEl.textContent = totalClicks;
		totalDistractionsEl.textContent = totalDistractionCount;

		const sortedByTime = domains
			.slice()
			.sort(
				(a, b) =>
					(domainDB[b].totalLife || 0) - (domainDB[a].totalLife || 0),
			);
		const top5ByTime = sortedByTime.slice(0, 5);
		const maxTime = domainDB[top5ByTime[0]]?.totalLife || 1;

		top5ListEl.innerHTML = "";
		top5ByTime.forEach((domain) => {
			const item = createDomainListItem(
				domain,
				domainDB[domain].urlVisited?.length || 0,
				domainDB[domain].totalLife || 0,
				maxTime,
				true,
			);
			top5ListEl.appendChild(item);
		});

		const sortedByVisits = domains
			.slice()
			.sort(
				(a, b) =>
					(domainDB[b].urlVisited?.length || 0) -
					(domainDB[a].urlVisited?.length || 0),
			);
		const top5ByVisits = sortedByVisits.slice(0, 5);
		const maxVisits = domainDB[top5ByVisits[0]]?.urlVisited?.length || 1;

		top5VisitsEl.innerHTML = "";
		top5ByVisits.forEach((domain) => {
			const item = createDomainListItem(
				domain,
				domainDB[domain].urlVisited?.length || 0,
				domainDB[domain].totalLife || 0,
				maxVisits,
				false,
			);
			top5VisitsEl.appendChild(item);
		});

		const summary = generateLocalSummary(domainDB, domains);
		productivitySummaryEl.innerHTML = summary;

		await renderDerivedMetrics(domainDB, domains, cachedUsageTimeline);

		if (productivityBadgeEl) {
			const focusValue =
				(domains.reduce(
					(sum, domain) =>
						sum +
						(domainDB[domain].activeLife || 0) /
							(domainDB[domain].totalLife || 1),
					0,
				) /
					domains.length) *
				100;
			if (focusValue >= 75) {
				productivityBadgeEl.textContent = "High focus streak";
			} else if (focusValue >= 50) {
				productivityBadgeEl.textContent = "Balanced browsing";
			} else {
				productivityBadgeEl.textContent =
					"Consider a deep work session";
			}
		}
	}

	function renderDomainTable(domainDB, domains) {
		domainTableBodyEl.innerHTML = "";

		domains.forEach((domain, index) => {
			const domainData = domainDB[domain];
			const totalLife = domainData.totalLife || 0;
			const activeLife = domainData.activeLife || 0;
			const passiveLife = Math.max(0, totalLife - activeLife);
			const activityRatio = Math.floor(
				(activeLife / (totalLife || 1)) * 100,
			);

			const tr = document.createElement("tr");
			tr.onclick = () =>
				(window.location.href = `/website.html?domain=${encodeURIComponent(domain)}`);

			const sNoCell = document.createElement("td");
			sNoCell.textContent = index + 1;

			const domainCell = document.createElement("td");
			const domainCellDiv = document.createElement("div");
			domainCellDiv.className = "domain-cell";
			const icon = document.createElement("img");
			icon.className = "domain-icon";
			icon.alt = `${domain} icon`;
			icon.loading = "lazy";
			setFaviconWithFallback(icon, domain, 64);
			const info = document.createElement("div");
			info.className = "domain-info";
			const name = document.createElement("span");
			name.className = "domain-name";
			name.textContent = domain;
			const sessions = document.createElement("span");
			sessions.className = "domain-sessions";
			sessions.textContent = `${domainData.urlVisited?.length || 0} sessions`;
			info.append(name, sessions);
			domainCellDiv.append(icon, info);
			domainCell.append(domainCellDiv);

			const visitsCell = document.createElement("td");
			visitsCell.textContent = domainData.urlVisited?.length || 0;

			const totalCell = document.createElement("td");
			totalCell.textContent = formatTime(totalLife);

			const activeCell = document.createElement("td");
			activeCell.textContent = formatTime(activeLife);

			const passiveCell = document.createElement("td");
			passiveCell.textContent = formatTime(passiveLife);

			const distractionsCell = document.createElement("td");
			distractionsCell.textContent = domainData.distractions || 0;

			const interactionsCell = document.createElement("td");
			interactionsCell.textContent = domainData.clicks || 0;

			const focusCell = document.createElement("td");
			const focusTag = document.createElement("span");
			focusTag.className = "focus-badge";
			if (activityRatio >= 75)
				focusTag.classList.add("focus-badge--high");
			else if (activityRatio >= 50)
				focusTag.classList.add("focus-badge--medium");
			else if (activityRatio >= 25)
				focusTag.classList.add("focus-badge--low");
			else focusTag.classList.add("focus-badge--poor");
			focusTag.textContent = `${activityRatio}% active`;
			focusCell.append(focusTag);

			const actionCell = document.createElement("td");
			const actionBtn = document.createElement("button");
			actionBtn.type = "button";
			actionBtn.className = "btn-delete";
			actionBtn.innerHTML =
				'<svg class="icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg><span>Delete</span>';
			actionBtn.onclick = (event) => {
				event.stopPropagation();
				deleteDomain(domain);
			};
			actionCell.append(actionBtn);

			tr.append(
				sNoCell,
				domainCell,
				visitsCell,
				totalCell,
				activeCell,
				passiveCell,
				distractionsCell,
				interactionsCell,
				focusCell,
				actionCell,
			);
			domainTableBodyEl.appendChild(tr);
		});
	}

	async function deleteDomain(domain) {
		if (
			confirm(`Are you sure you want to delete all data for ${domain}?`)
		) {
			const { domainDB = {} } = await app.storage.local.get(["domainDB"]);
			delete domainDB[domain];
			await app.storage.local.set({ domainDB });
			loadDashboard();
		}
	}

	searchInput.addEventListener("input", (e) => {
		currentSearchTerm = (e.target.value || "").toLowerCase();
		updateFilteredDomains(currentDomainDB);
	});

	if (sortSelect) {
		sortSelect.addEventListener("change", (event) => {
			currentSortKey = event.target.value || "alphabetical";
			updateFilteredDomains(currentDomainDB);
		});
	}

	if (sortResetBtn) {
		sortResetBtn.addEventListener("click", () => {
			currentSortKey = "alphabetical";
			currentSearchTerm = "";
			if (sortSelect) sortSelect.value = "alphabetical";
			if (searchInput) searchInput.value = "";
			updateFilteredDomains(currentDomainDB);
		});
	}

	refreshBtn.addEventListener("click", () => {
		window.location.reload();
	});

	if (bounceThresholdSelect) {
		bounceThresholdSelect.addEventListener("change", async (e) => {
			const v = Number(e.target.value) || 30;
			try {
				await app.storage.local.set({ bounceThreshold: v });
				if (bounceSavedEl) {
					bounceSavedEl.classList.remove("hidden");
					setTimeout(() => {
						if (bounceSavedEl)
							bounceSavedEl.classList.add("hidden");
					}, 1500);
				}
				const { domainDB = {} } = await app.storage.local.get([
					"domainDB",
				]);
				const domains = Object.keys(domainDB);
				currentDomainDB = domainDB;
				allDomains = domains;
				await renderDerivedMetrics(
					domainDB,
					domains,
					cachedUsageTimeline,
				);
				updateFilteredDomains(currentDomainDB);
			} catch (err) {
				console.error("Failed to save bounceThreshold", err);
			}
		});
	}

	await loadDashboard();
	await updateSystemStats();
	setInterval(updateSystemStats, 2000);
});
