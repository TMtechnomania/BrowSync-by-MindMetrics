(function(){
const app = chrome || browser;

// Lightweight data inspector for debugging/stats.
// Exposes window.dataInspector with analyzeDomainDB() and exportDomainCSV(domain).

async function analyzeDomainDB(opts = {}){
  const { minSessionDuration = 2, topN = 10 } = opts;
  const raw = await app.storage.local.get(['domainDB']);
  const domainDB = raw.domainDB || {};
  const domains = Object.keys(domainDB).sort();
  const report = {
    generatedAt: Date.now(),
    domainCount: domains.length,
    totalSessions: 0,
    totalTimeSeconds: 0,
    anomalies: {
      sessionsMissingFields: 0,
      zeroDuration: 0,
      negativeOrBadTimes: 0,
      overlappingSessions: 0
    },
    perDomain: {}
  };

  function statsFromArray(arr){
    if (!arr.length) return {count:0, sum:0, avg:0, median:0, min:0, max:0};
    const sorted = arr.slice().sort((a,b)=>a-b);
    const sum = arr.reduce((s,x)=>s+x,0);
    const avg = sum/arr.length;
    const mid = Math.floor(sorted.length/2);
    const median = (sorted.length%2===1)? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
    return {count:arr.length, sum, avg, median, min:sorted[0], max:sorted[sorted.length-1] };
  }

  for (const domain of domains){
    const data = domainDB[domain] || {};
    const sessions = Array.isArray(data.urlVisited) ? data.urlVisited.slice() : [];
    // normalize session objects defensively
    const normalized = sessions.map(s => ({
      title: (s && s.title) || 'Untitled',
      url: (s && s.url) || '',
      sessionStart: typeof s.sessionStart === 'number' ? s.sessionStart : (s && s.sessionStart? Number(s.sessionStart): null),
      sessionEnd: typeof s.sessionEnd === 'number' ? s.sessionEnd : (s && s.sessionEnd? Number(s.sessionEnd): null),
      sessionDuration: typeof s.sessionDuration === 'number' ? s.sessionDuration : (s && s.sessionDuration? Number(s.sessionDuration): null),
      activeSession: typeof s.activeSession === 'number' ? s.activeSession : (s && s.activeSession? Number(s.activeSession): 0),
      passiveSession: typeof s.passiveSession === 'number' ? s.passiveSession : null,
      clicks: typeof s.clicks === 'number' ? s.clicks : (s && s.clicks? Number(s.clicks): 0),
      distractions: typeof s.distractions === 'number' ? s.distractions : (s && s.distractions? Number(s.distractions): 0),
    }));

    // detect anomalies and compute domain metrics
    const durations = [];
    const clicksArr = [];
    const distractionsArr = [];
    let missingFields = 0, zeroDur = 0, badTimes = 0, overlaps = 0;

    // sort by start time for overlap detection
    normalized.sort((a,b)=> (a.sessionStart||0) - (b.sessionStart||0));
    for (let i=0;i<normalized.length;i++){
      const s = normalized[i];
      if (s.sessionDuration == null || s.sessionStart == null || s.sessionEnd == null) missingFields++;
      if (typeof s.sessionDuration === 'number' && s.sessionDuration <= 0) zeroDur++;
      if (s.sessionEnd != null && s.sessionStart != null && s.sessionEnd <= s.sessionStart) badTimes++;
      if (i>0 && s.sessionStart != null && normalized[i-1].sessionEnd != null && s.sessionStart < normalized[i-1].sessionEnd) overlaps++;
      if (typeof s.sessionDuration === 'number' && s.sessionDuration > 0){
        durations.push(s.sessionDuration);
      }
      clicksArr.push(s.clicks || 0);
      distractionsArr.push(s.distractions || 0);
    }

    const durationStats = statsFromArray(durations);
    const clickStats = statsFromArray(clicksArr);
    const distractionStats = statsFromArray(distractionsArr);

    report.totalSessions += sessions.length;
    report.totalTimeSeconds += durationStats.sum;
    report.anomalies.sessionsMissingFields += missingFields;
    report.anomalies.zeroDuration += zeroDur;
    report.anomalies.negativeOrBadTimes += badTimes;
    report.anomalies.overlappingSessions += overlaps;

    report.perDomain[domain] = {
      sessions: sessions.length,
      totalTime: durationStats.sum,
      avgSession: durationStats.avg || 0,
      medianSession: durationStats.median || 0,
      minSession: durationStats.min || 0,
      maxSession: durationStats.max || 0,
      bounceCount: durations.filter(d => d <= minSessionDuration).length,
      bounceRate: durations.length ? Math.round((durations.filter(d => d <= minSessionDuration).length / durations.length) * 100) : 0,
      avgClicksPerSession: clickStats.avg || 0,
      avgDistractionsPerSession: distractionStats.avg || 0,
      anomalies: { missingFields, zeroDur, badTimes, overlaps }
    };
  }

  // derive top domains by time and by sessions
  const byTime = Object.entries(report.perDomain).map(([d,info])=>({domain:d, totalTime:info.totalTime})).sort((a,b)=>b.totalTime-a.totalTime).slice(0, topN);
  const bySessions = Object.entries(report.perDomain).map(([d,info])=>({domain:d, sessions:info.sessions})).sort((a,b)=>b.sessions-b.sessions).slice(0, topN);

  report.topByTime = byTime;
  report.topBySessions = bySessions;

  // quick console output
  console.group('%cBrowSync Data Inspector', 'color:#FF6B35;font-weight:700');
  console.log('Generated at', new Date(report.generatedAt).toString());
  console.log('Domains tracked:', report.domainCount);
  console.log('Total sessions:', report.totalSessions);
  console.log('Total time (s):', report.totalTimeSeconds, ' — ', formatSeconds(report.totalTimeSeconds));
  console.log('Anomalies:', report.anomalies);
  console.log('Top domains by time:', report.topByTime);
  console.log('Per-domain sample (first 10):');
  console.table(Object.entries(report.perDomain).slice(0,10).map(([d,i])=>({domain:d, sessions:i.sessions, totalTime:i.totalTime, avgSession:i.avgSession.toFixed(1), bounceRate:`${i.bounceRate}%`})));
  console.groupEnd();

  // attach result for interactive use
  window.__browsync_inspector_report = report;
  return report;
}

function formatSeconds(sec){
  if (!sec || sec <= 0) return '0s';
  const hrs = Math.floor(sec/3600);
  const mins = Math.floor((sec%3600)/60);
  const s = sec%60;
  if (hrs>0) return `${hrs}h ${mins}m ${s}s`;
  if (mins>0) return `${mins}m ${s}s`;
  return `${s}s`;
}

async function exportDomainCSV(domain){
  const raw = await app.storage.local.get(['domainDB']);
  const domainDB = raw.domainDB || {};
  const sessions = domainDB[domain] && Array.isArray(domainDB[domain].urlVisited) ? domainDB[domain].urlVisited : [];
  if (!sessions.length) return null;
  const headers = ['title','url','sessionStart','sessionEnd','sessionDuration','activeSession','passiveSession','clicks','distractions'];
  const rows = sessions.map(s => headers.map(h => {
    const v = (s && s[h] != null) ? s[h] : '';
    // escape
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(','));
  const csv = `"${headers.join('","')}"\n` + rows.join('\n');
  // download helper
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${domain.replace(/[^a-z0-9\-\.]/gi,'_')}_sessions.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// Expose API
window.dataInspector = window.dataInspector || {};
window.dataInspector.analyzeDomainDB = analyzeDomainDB;
window.dataInspector.exportDomainCSV = exportDomainCSV;
window.dataInspector.formatSeconds = formatSeconds;

// Auto-log helper if dev flag set in localStorage
try{
  if (localStorage && localStorage.getItem && localStorage.getItem('devInspect') === 'true'){
    console.info('data_inspector loaded: run dataInspector.analyzeDomainDB() to get a report');
  }
}catch(e){}

})();
