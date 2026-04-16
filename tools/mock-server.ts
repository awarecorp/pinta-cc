import http from "http";
import fs from "fs";
import path from "path";

const PORT = 3000;
const API_KEY = "test-token";
const DATA_DIR = path.join(__dirname, ".data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

// 차단 룰 설정 (테스트용으로 수정 가능)
const rules: Array<{ id: string; action: string; toolName: string; reason: string }> = [
  // { id: "r1", action: "block", toolName: "Bash", reason: "Bash 사용이 차단되었습니다" },
];

// --- Storage ---

function loadEvents(): unknown[] {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveEvent(event: unknown): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const events = loadEvents();
  events.push(event);
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

function log(label: string, data: unknown) {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

// --- HTML UI ---

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pinta - Event Viewer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; }
  .layout { display: flex; height: 100vh; }
  .list-pane { flex: 1; overflow-y: auto; padding: 20px; border-right: 1px solid #21262d; min-width: 0; }
  .detail-pane { width: 480px; flex-shrink: 0; overflow-y: auto; background: #161b22; display: none; }
  .detail-pane.open { display: block; }
  .detail-header { padding: 16px; border-bottom: 1px solid #21262d; display: flex; justify-content: space-between; align-items: center; }
  .detail-header h3 { font-size: 14px; color: #58a6ff; }
  .detail-close { background: none; border: none; color: #8b949e; cursor: pointer; font-size: 18px; }
  .detail-close:hover { color: #c9d1d9; }
  .detail-body { padding: 16px; }
  .detail-section { margin-bottom: 16px; }
  .detail-section h4 { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .detail-row { display: flex; padding: 4px 0; font-size: 13px; }
  .detail-label { color: #8b949e; width: 120px; flex-shrink: 0; }
  .detail-value { color: #c9d1d9; word-break: break-all; }
  .detail-value.type { font-weight: 600; }
  .detail-value.PreToolUse { color: #d29922; }
  .detail-value.PostToolUse { color: #3fb950; }
  .detail-value.UserPromptSubmit { color: #bc8cff; }
  .detail-value.SessionStart { color: #58a6ff; }
  .detail-value.SessionEnd { color: #8b949e; }
  .detail-json { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 12px; max-height: 300px; overflow-y: auto; }
  .detail-json pre { font-size: 12px; color: #8b949e; white-space: pre-wrap; word-break: break-all; }
  .detail-prompt { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 12px; font-size: 13px; color: #c9d1d9; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
  .detail-tabs { display: flex; border-bottom: 1px solid #21262d; padding: 0 16px; }
  .detail-tab { padding: 8px 12px; font-size: 13px; color: #8b949e; cursor: pointer; border-bottom: 2px solid transparent; }
  .detail-tab:hover { color: #c9d1d9; }
  .detail-tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
  h1 { font-size: 20px; margin-bottom: 16px; color: #58a6ff; }
  .toolbar { display: flex; gap: 12px; margin-bottom: 20px; align-items: center; }
  .toolbar button { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .toolbar button:hover { background: #30363d; }
  .toolbar select { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 10px; border-radius: 6px; font-size: 13px; }
  .stats { font-size: 13px; color: #8b949e; margin-left: auto; }
  .session { margin-bottom: 24px; }
  .session-header { font-size: 14px; color: #8b949e; padding: 8px 12px; background: #161b22; border-radius: 6px 6px 0 0; border: 1px solid #21262d; }
  .trace { margin: 0; border-left: 3px solid #30363d; border-right: 1px solid #21262d; }
  .trace-header { font-size: 13px; color: #58a6ff; padding: 8px 12px; background: #161b22; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #21262d; }
  .trace-header:hover { background: #1c2129; }
  .trace-header .arrow { transition: transform 0.2s; font-size: 10px; }
  .trace-header .arrow.open { transform: rotate(90deg); }
  .trace-header .time { color: #8b949e; font-size: 12px; margin-left: auto; }
  .event { padding: 10px 12px; border-bottom: 1px solid #21262d; font-size: 13px; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .event:hover { background: #1c2129; }
  .event.selected { background: #1c2129; border-left: 2px solid #58a6ff; padding-left: 10px; }
  .event-type { font-weight: 600; min-width: 160px; flex-shrink: 0; }
  .event-type.PreToolUse { color: #d29922; }
  .event-type.PostToolUse { color: #3fb950; }
  .event-type.UserPromptSubmit { color: #bc8cff; }
  .event-type.SessionStart { color: #58a6ff; }
  .event-type.SessionEnd { color: #8b949e; }
  .event-type.blocked { color: #f85149; }
  .event-detail { color: #8b949e; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .event-time { color: #484f58; font-size: 12px; flex-shrink: 0; }
  .empty { text-align: center; padding: 60px; color: #484f58; }
</style>
</head>
<body>
<div class="layout">
<div class="list-pane">
  <h1>Pinta Event Viewer</h1>
  <div class="toolbar">
    <button onclick="refresh()">Refresh</button>
    <button onclick="clearEvents()">Clear</button>
    <select id="filter" onchange="refresh()">
      <option value="">All Events</option>
      <option value="UserPromptSubmit">UserPromptSubmit</option>
      <option value="PreToolUse">PreToolUse</option>
      <option value="PostToolUse">PostToolUse</option>
      <option value="SessionStart">SessionStart</option>
      <option value="SessionEnd">SessionEnd</option>
    </select>
    <label style="font-size:13px"><input type="checkbox" id="autoRefresh" checked onchange="toggleAutoRefresh()"> Auto-refresh</label>
    <span class="stats" id="stats"></span>
  </div>
  <div id="app"></div>
</div>
<div class="detail-pane" id="detailPane">
  <div class="detail-header">
    <h3 id="detailTitle">Event Detail</h3>
    <button class="detail-close" onclick="closeDetail()">&times;</button>
  </div>
  <div class="detail-tabs">
    <div class="detail-tab active" data-tab="overview" onclick="switchTab('overview')">Overview</div>
    <div class="detail-tab" data-tab="payload" onclick="switchTab('payload')">Payload</div>
    <div class="detail-tab" data-tab="raw" onclick="switchTab('raw')">Raw JSON</div>
  </div>
  <div class="detail-body" id="detailBody"></div>
</div>
</div>

<script>
let autoRefreshTimer = null;
let allEvents = [];
let selectedEventId = null;
let currentTab = 'overview';

async function fetchEvents() {
  const res = await fetch('/api/events/list');
  return res.json();
}

async function clearEvents() {
  await fetch('/api/events/clear', { method: 'POST' });
  closeDetail();
  refresh();
}

function toggleAutoRefresh() {
  if (document.getElementById('autoRefresh').checked) {
    autoRefreshTimer = setInterval(refresh, 2000);
  } else {
    clearInterval(autoRefreshTimer);
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatFullTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function summarize(ev) {
  const p = ev.payload || {};
  if (ev.eventType === 'UserPromptSubmit') return p.prompt ? p.prompt.slice(0, 120) : '';
  if (ev.eventType === 'PreToolUse' || ev.eventType === 'PostToolUse') {
    const tool = ev.toolName || p.tool_name || '';
    const input = p.tool_input || {};
    if (input.command) return tool + ': ' + input.command.slice(0, 100);
    if (input.file_path) return tool + ': ' + input.file_path;
    if (input.pattern) return tool + ': ' + input.pattern;
    if (input.query) return tool + ': ' + input.query;
    if (input.prompt) return tool + ': ' + input.prompt.slice(0, 80);
    return tool;
  }
  return ev.eventType;
}

function closeDetail() {
  document.getElementById('detailPane').classList.remove('open');
  selectedEventId = null;
  document.querySelectorAll('.event.selected').forEach(el => el.classList.remove('selected'));
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (selectedEventId !== null) showDetail(selectedEventId);
}

function showDetail(idx) {
  const ev = allEvents[idx];
  if (!ev) return;
  selectedEventId = idx;
  const pane = document.getElementById('detailPane');
  pane.classList.add('open');

  document.querySelectorAll('.event.selected').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('ev-' + idx);
  if (el) el.classList.add('selected');

  document.getElementById('detailTitle').textContent = ev.eventType + (ev.toolName ? ' - ' + ev.toolName : '');

  const body = document.getElementById('detailBody');
  const p = ev.payload || {};

  if (currentTab === 'overview') {
    let html = '<div class="detail-section"><h4>Event Info</h4>';
    html += row('Type', '<span class="detail-value type ' + ev.eventType + '">' + ev.eventType + '</span>');
    html += row('Time', formatFullTime(ev.timestamp));
    html += row('Event ID', ev.eventId);
    html += row('Trace ID', ev.traceId || '-');
    html += row('Session ID', ev.sessionId);
    if (ev.toolName) html += row('Tool', ev.toolName);
    if (p.tool_use_id) html += row('Tool Use ID', p.tool_use_id);
    html += row('CWD', p.cwd || '-');
    html += row('Permission', p.permission_mode || '-');
    html += '</div>';

    // Context-specific sections
    if (ev.eventType === 'UserPromptSubmit' && p.prompt) {
      html += '<div class="detail-section"><h4>User Prompt</h4>';
      html += '<div class="detail-prompt">' + escapeHtml(p.prompt) + '</div></div>';
    }

    if ((ev.eventType === 'PreToolUse' || ev.eventType === 'PostToolUse') && p.tool_input) {
      html += '<div class="detail-section"><h4>Tool Input</h4>';
      html += '<div class="detail-json"><pre>' + escapeHtml(JSON.stringify(p.tool_input, null, 2)) + '</pre></div></div>';
    }

    if (ev.eventType === 'PostToolUse' && p.tool_response !== undefined) {
      html += '<div class="detail-section"><h4>Tool Response</h4>';
      const resp = typeof p.tool_response === 'string' ? p.tool_response : JSON.stringify(p.tool_response, null, 2);
      html += '<div class="detail-json"><pre>' + escapeHtml(resp) + '</pre></div></div>';
    }

    body.innerHTML = html;
  } else if (currentTab === 'payload') {
    body.innerHTML = '<div class="detail-section"><h4>Payload</h4><div class="detail-json"><pre>' + escapeHtml(JSON.stringify(p, null, 2)) + '</pre></div></div>';
  } else {
    body.innerHTML = '<div class="detail-section"><h4>Full Event</h4><div class="detail-json"><pre>' + escapeHtml(JSON.stringify(ev, null, 2)) + '</pre></div></div>';
  }
}

function row(label, value) {
  return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>';
}

function toggleTrace(id) {
  const el = document.getElementById('trace-body-' + id);
  const arrow = document.getElementById('arrow-' + id);
  if (el.style.display === 'none') {
    el.style.display = 'block';
    arrow.classList.add('open');
  } else {
    el.style.display = 'none';
    arrow.classList.remove('open');
  }
}

async function refresh() {
  const events = await fetchEvents();
  allEvents = events;
  const filter = document.getElementById('filter').value;
  const filtered = filter ? events.filter(e => e.eventType === filter) : events;

  document.getElementById('stats').textContent = filtered.length + ' events';

  const sessions = new Map();
  for (const ev of filtered) {
    const sid = ev.sessionId || 'unknown';
    if (!sessions.has(sid)) sessions.set(sid, new Map());
    const traces = sessions.get(sid);
    const tid = ev.traceId || 'no-trace';
    if (!traces.has(tid)) traces.set(tid, []);
    traces.get(tid).push({ ...ev, _idx: events.indexOf(ev) });
  }

  if (filtered.length === 0) {
    document.getElementById('app').innerHTML = '<div class="empty">No events yet. Start using Claude Code with the Pinta plugin.</div>';
    return;
  }

  let html = '';
  let traceNum = 0;
  const sessionEntries = [...sessions.entries()].reverse();
  for (const [sid, traces] of sessionEntries) {
    html += '<div class="session">';
    html += '<div class="session-header">Session: ' + sid.slice(0, 12) + '...</div>';

    const traceEntries = [...traces.entries()].reverse();
    for (const [tid, tevents] of traceEntries) {
      const traceIdx = traceNum++;
      const firstTime = tevents[0]?.timestamp ? formatTime(tevents[0].timestamp) : '';
      const evCount = tevents.length;
      const hasPrompt = tevents.find(e => e.eventType === 'UserPromptSubmit');
      const promptPreview = hasPrompt ? summarize(hasPrompt).slice(0, 60) : tid.slice(0, 12);

      html += '<div class="trace">';
      html += '<div class="trace-header" onclick="toggleTrace(' + traceIdx + ')">';
      html += '<span class="arrow" id="arrow-' + traceIdx + '">&#9654;</span>';
      html += '<strong>' + escapeHtml(promptPreview) + '</strong>';
      html += '<span style="color:#484f58;font-size:12px">' + evCount + ' events</span>';
      html += '<span class="time">' + firstTime + '</span>';
      html += '</div>';
      html += '<div id="trace-body-' + traceIdx + '" style="display:none">';

      for (const ev of tevents) {
        const globalIdx = ev._idx;
        const sel = selectedEventId === globalIdx ? ' selected' : '';
        html += '<div class="event' + sel + '" id="ev-' + globalIdx + '" onclick="showDetail(' + globalIdx + ')">';
        html += '<span class="event-type ' + ev.eventType + '">' + ev.eventType + '</span>';
        html += '<span class="event-detail">' + escapeHtml(summarize(ev)) + '</span>';
        html += '<span class="event-time">' + (ev.timestamp ? formatTime(ev.timestamp) : '') + '</span>';
        html += '</div>';
      }

      html += '</div></div>';
    }
    html += '</div>';
  }

  document.getElementById('app').innerHTML = html;

  if (selectedEventId !== null) showDetail(selectedEventId);
}

refresh();
toggleAutoRefresh();
</script>
</body>
</html>`;

// --- Server ---

const server = http.createServer((req, res) => {
  // UI - no auth required
  if (req.method === "GET" && (req.url === "/" || req.url === "/ui")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // Events list API - no auth required (dev tool)
  if (req.method === "GET" && req.url === "/api/events/list") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(loadEvents()));
    return;
  }

  // Clear events - no auth required (dev tool)
  if (req.method === "POST" && req.url === "/api/events/clear") {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EVENTS_FILE, "[]");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ cleared: true }));
    log("EVENTS CLEARED", {});
    return;
  }

  // Non-API requests (favicon, unknown paths) — skip auth gate
  if (!req.url?.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  // Plugin API - auth required
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${API_KEY}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    log("UNAUTHORIZED", { method: req.method, url: req.url, got: auth ?? "(none)", expected: `Bearer ${API_KEY}` });
    return;
  }

  // GET /api/health
  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // GET /api/rules
  if (req.method === "GET" && req.url === "/api/rules") {
    const body = { rules, version: "v1" };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  // POST /api/events
  if (req.method === "POST" && req.url === "/api/events") {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        const event = JSON.parse(data);
        saveEvent(event);
        log(`EVENT [${event.eventType}]${event.toolName ? ` tool=${event.toolName}` : ""}`, { traceId: event.traceId, toolName: event.toolName });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`\n🔒 Pinta Mock Server running on http://localhost:${PORT}`);
  console.log(`   Token: ${API_KEY}`);
  console.log(`   Rules: ${rules.length} rules loaded`);
  console.log(`\n   UI:        http://localhost:${PORT}/`);
  console.log(`   Events:    http://localhost:${PORT}/api/events/list`);
  console.log(`   Health:    http://localhost:${PORT}/api/health`);
  console.log(`   Rules:     http://localhost:${PORT}/api/rules`);
  console.log(`\n   Waiting for events...\n`);
});
