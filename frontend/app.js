const API_BASE = window.SENTINEL_API_BASE || "http://localhost:8000/api/v1";
const TRIGGER_THRESHOLD = 15.2;
const state = { map: null, statusByDistrict: new Map(), selectedDistrict: null, geoLayer: null, activeLayer: null, currentBriefResponse: null };

const elements = {
  apiStatus: document.querySelector("#api-status"),
  overview: document.querySelector("#district-overview"),
  briefs: document.querySelector("#briefs-content"),
  auditModal: document.querySelector("#audit-modal"),
  auditTable: document.querySelector("#audit-table"),
  auditKpis: document.querySelector("#audit-kpis"),
  exportBrief: document.querySelector("#export-brief"),
  toast: document.querySelector("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[character]));
}

async function request(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, signal: controller.signal, ...options });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.detail || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Request timed out after 20 seconds. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function setApiStatus(connected, message) {
  elements.apiStatus.className = `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${connected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-red-400/30 bg-red-400/10 text-red-200"}`;
  elements.apiStatus.innerHTML = `<span class="h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}"></span><span>${escapeHtml(message)}</span>`;
}

function updateApiStatusForError(error) {
  if (error.message === "Gemini is not configured. Set GEMINI_API_KEY.") {
    setApiStatus(true, "Gemini degraded");
    return;
  }
  if (error.status >= 500 || error.message === "Failed to fetch" || error.message.startsWith("Request timed out")) {
    setApiStatus(false, "API unavailable");
  }
}

function mapStyle(feature) {
  const name = feature.properties.admin2Name;
  const district = state.statusByDistrict.get(name);
  const activated = district?.status === "ACTIVATED";
  return { color: activated ? "#F87171" : "#34D399", weight: 1.4, fillColor: activated ? "#EF4444" : "#10B981", fillOpacity: 0.57 };
}

function initMap() {
  state.map = L.map("map", { zoomControl: false }).setView([2.55, 34.65], 8);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(state.map);
}

function addGeoJson(geojson) {
  state.geoLayer = L.geoJSON(geojson, {
    style: mapStyle,
    onEachFeature(feature, layer) {
      const district = state.statusByDistrict.get(feature.properties.admin2Name);
      const probability = district ? `${district.drought_probability.toFixed(1)}%` : "Unavailable";
      layer.bindTooltip(`<strong>${escapeHtml(feature.properties.admin2Name)}</strong><br>Drought probability: ${probability}`, { sticky: true });
      layer.on({
        mouseover: () => layer.setStyle({ weight: 3, fillOpacity: 0.78 }),
        mouseout: () => {
          if (layer === state.activeLayer) {
            layer.setStyle({ color: "#F8FAFC", weight: 4, fillOpacity: 0.8 });
          } else {
            state.geoLayer.resetStyle(layer);
          }
        },
        click: () => selectDistrict(feature.properties.admin2Name, layer),
      });
    },
  }).addTo(state.map);
  state.map.fitBounds(state.geoLayer.getBounds(), { padding: [18, 18] });
}

function renderOverview(district) {
  const isActivated = district.status === "ACTIVATED";
  elements.overview.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Selected district</p><h3 class="mt-1 text-xl font-semibold text-white">${escapeHtml(district.district_name)}</h3></div><span class="rounded-full px-2.5 py-1 text-xs font-bold ${isActivated ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}">${escapeHtml(district.status)}</span></div><div class="mt-4 grid grid-cols-2 gap-3"><div class="rounded-lg bg-slate-800/80 p-3"><p class="text-xs text-slate-500">Drought probability</p><p class="mt-1 text-lg font-semibold ${isActivated ? "text-red-300" : "text-emerald-300"}">${district.drought_probability.toFixed(1)}%</p></div><div class="rounded-lg bg-slate-800/80 p-3"><p class="text-xs text-slate-500">Trigger threshold</p><p class="mt-1 text-lg font-semibold text-slate-100">${district.trigger_threshold.toFixed(1)}%</p></div></div>`;
}

function loadingBriefs() {
  elements.briefs.innerHTML = `<div class="empty-state"><span class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-teal-400"></span><p>Generating operational briefs…</p><span>Sentinel is applying the current district trigger to each role.</span></div>`;
}

function priorityClass(priority) {
  return ({ CRITICAL: "bg-red-500/15 text-red-300", HIGH: "bg-orange-500/15 text-orange-300", MEDIUM: "bg-amber-400/15 text-amber-200", LOW: "bg-sky-400/15 text-sky-200" }[priority] || "bg-slate-700 text-slate-200");
}

function renderBriefs(response) {
  state.currentBriefResponse = response;
  elements.exportBrief.classList.remove("hidden");
  elements.briefs.innerHTML = response.briefs.map((brief, index) => {
    const confidence = Math.max(0, Math.min(100, Math.round(brief.confidence_score * 100)));
    const bottlenecks = brief.key_bottlenecks.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return `<article class="brief-card rounded-xl p-4"><div class="flex items-start justify-between gap-3"><h3 class="font-semibold text-white">${escapeHtml(brief.role)}</h3><span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${priorityClass(brief.priority)}">${escapeHtml(brief.priority)}</span></div><p class="mt-3 text-sm leading-6 text-slate-300">${escapeHtml(brief.recommended_action)}</p><div class="mt-4"><div class="mb-1 flex justify-between text-xs"><span class="text-slate-400">Trigger confidence</span><span class="font-semibold text-teal-200">${confidence}%</span></div><div class="h-2 overflow-hidden rounded-full bg-slate-800"><div class="h-full rounded-full bg-teal-400" style="width: ${confidence}%"></div></div></div><details class="mt-4 rounded-lg bg-slate-800/65 px-3 py-2.5"><summary class="accordion-summary text-sm font-medium text-slate-200">Confidence rationale &amp; field conditionality</summary><p class="mt-3 text-sm leading-6 text-slate-400">${escapeHtml(brief.confidence_rationale)}</p></details><div class="mt-4"><p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Key bottlenecks / risks</p><ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">${bottlenecks}</ul></div><button class="confirm-action mt-5 w-full rounded-lg bg-teal-400 px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60" data-brief-index="${index}">Confirm &amp; Log Action</button></article>`;
  }).join("");
  document.querySelectorAll(".confirm-action").forEach((button) => button.addEventListener("click", () => confirmAction(response.briefs[Number(button.dataset.briefIndex)], button)));
}

async function selectDistrict(districtName, layer) {
  const district = state.statusByDistrict.get(districtName);
  if (!district) { showToast("District status is unavailable.", "error"); return; }
  if (state.activeLayer) state.geoLayer.resetStyle(state.activeLayer);
  state.activeLayer = layer;
  layer.setStyle({ color: "#F8FAFC", weight: 4, fillOpacity: 0.8 });
  state.map.fitBounds(layer.getBounds(), { padding: [42, 42], maxZoom: 10, animate: true });
  state.selectedDistrict = district;
  state.currentBriefResponse = null;
  renderOverview(district);
  loadingBriefs();
  elements.exportBrief.classList.add("hidden");
  try {
    const briefs = await request("/agent/generate-briefs", { method: "POST", body: JSON.stringify({ district_name: district.district_name }) });
    renderBriefs(briefs);
  } catch (error) {
    updateApiStatusForError(error);
    elements.briefs.innerHTML = `<div class="empty-state"><span class="text-3xl text-red-400">!</span><p>Could not generate decision briefs</p><span>${escapeHtml(error.message)}</span></div>`;
  }
}

async function confirmAction(brief, button) {
  if (!state.selectedDistrict) return;
  button.disabled = true;
  button.textContent = "Logging action…";
  try {
    await request("/audit/logs", { method: "POST", body: JSON.stringify({ district_name: state.selectedDistrict.district_name, role: brief.role, action_taken: brief.recommended_action, status: "EXECUTED" }) });
    button.textContent = "Action Logged ✓";
    showToast("Action confirmed and added to the accountability log.", "success");
    await loadAuditLogs();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Confirm & Log Action";
    showToast(`Could not log action: ${error.message}`, "error");
  }
}

function formatTime(timestamp) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)); }

function auditRoleVisual(role) {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes("coordinator")) return { initial: "C", label: "Coordinator", tone: "audit-role-coordinator" };
  if (normalizedRole.includes("water")) return { initial: "W", label: "Water", tone: "audit-role-water" };
  if (normalizedRole.includes("health")) return { initial: "H", label: "Health", tone: "audit-role-health" };
  return { initial: "A", label: "Action", tone: "audit-role-default" };
}

function renderAuditLog(log) {
  const roleVisual = auditRoleVisual(log.role);
  return `<article class="brief-card rounded-xl p-4 sm:p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div class="flex min-w-0 items-center gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${roleVisual.tone}" aria-label="${roleVisual.label} role">${roleVisual.initial}</span><div class="min-w-0"><p class="text-xs font-semibold uppercase tracking-wider text-slate-500">${escapeHtml(roleVisual.label)} action</p><h3 class="mt-0.5 font-semibold text-white">${escapeHtml(log.role)}</h3></div></div><span class="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">${escapeHtml(log.status)}</span></div><p class="mt-4 text-sm leading-6 text-slate-300">${escapeHtml(log.action_taken)}</p><div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800 pt-3 text-xs text-slate-500"><span class="font-medium text-slate-400">${escapeHtml(log.district_name)}</span><span aria-hidden="true">•</span><time>${escapeHtml(formatTime(log.timestamp))}</time></div></article>`;
}

async function loadAuditLogs() {
  try {
    const logs = await request("/audit/logs");
    const activatedCovered = [...new Set(logs.map((log) => log.district_name).filter((name) => state.statusByDistrict.get(name)?.status === "ACTIVATED"))];
    elements.auditKpis.innerHTML = `<div class="rounded-lg border border-slate-700 bg-slate-800/70 p-3"><p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Actions Logged</p><p class="mt-1 text-2xl font-semibold text-teal-200">${logs.length}</p></div><div class="rounded-lg border border-slate-700 bg-slate-800/70 p-3"><p class="text-xs font-semibold uppercase tracking-wider text-slate-500">Activated Districts Covered</p><p class="mt-1 text-lg font-semibold text-emerald-200">${activatedCovered.length ? activatedCovered.map(escapeHtml).join(", ") : "None yet"}</p></div>`;
    elements.auditTable.innerHTML = logs.length ? logs.map(renderAuditLog).join("") : `<div class="py-12 text-center text-slate-500">No execution records yet.</div>`;
  } catch (error) { updateApiStatusForError(error); elements.auditKpis.innerHTML = ""; elements.auditTable.innerHTML = `<div class="py-12 text-center text-red-300">Unable to load audit logs: ${escapeHtml(error.message)}</div>`; }
}

async function exportBriefPdf() {
  const response = state.currentBriefResponse;
  if (!response || !state.selectedDistrict) return;
  if (!window.jspdf?.jsPDF) { showToast("PDF export library did not load. Check your connection and try again.", "error"); return; }

  elements.exportBrief.disabled = true;
  elements.exportBrief.textContent = "Creating PDF…";

  try {
    const { jsPDF } = window.jspdf;
    const document = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = document.internal.pageSize.getWidth();
    const pageHeight = document.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let cursorY = margin;
    const newPage = () => { document.addPage(); cursorY = margin; };
    const reserve = (height) => { if (cursorY + height > pageHeight - 18) newPage(); };
    const writeWrapped = (text, size = 10, color = [51, 65, 85], indent = 0) => {
      document.setFontSize(size);
      document.setTextColor(...color);
      const lines = document.splitTextToSize(String(text), contentWidth - indent);
      const lineHeight = size * 0.48;
      lines.forEach((line) => { reserve(lineHeight); document.text(line, margin + indent, cursorY); cursorY += lineHeight; });
      return lines.length * lineHeight;
    };
    const heading = (text, size = 11) => { reserve(10); document.setFont("helvetica", "bold"); document.setFontSize(size); document.setTextColor(15, 118, 110); document.text(text.toUpperCase(), margin, cursorY); cursorY += 7; document.setFont("helvetica", "normal"); };

    document.setFillColor(15, 118, 110);
    document.rect(0, 0, pageWidth, 8, "F");
    document.setFont("helvetica", "bold");
    document.setFontSize(20);
    document.setTextColor(15, 23, 42);
    document.text("SENTINEL — ACTION BRIEF", margin, cursorY + 7);
    cursorY += 15;
    document.setFont("helvetica", "normal");
    writeWrapped("IGAD / ICPAC Region Pilot · Karamoja, Uganda · OND Season Forecast", 9, [71, 85, 105]);
    cursorY += 5;
    document.setFillColor(241, 245, 249);
    document.setDrawColor(203, 213, 225);
    document.roundedRect(margin, cursorY, contentWidth, 29, 2, 2, "FD");
    cursorY += 7;
    writeWrapped(`District: ${response.district_name}`, 11, [15, 23, 42]);
    writeWrapped(`Drought probability: ${response.drought_probability.toFixed(1)}%   |   Trigger threshold: ${TRIGGER_THRESHOLD.toFixed(1)}%   |   Status: ${response.trigger_status}`, 9, [51, 65, 85]);
    cursorY += 10;

    response.briefs.forEach((brief, index) => {
      reserve(30);
      document.setDrawColor(203, 213, 225);
      document.setLineWidth(0.35);
      document.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 7;
      document.setFont("helvetica", "bold");
      document.setFontSize(14);
      document.setTextColor(15, 23, 42);
      document.text(`${index + 1}. ${brief.role}`, margin, cursorY);
      document.setFontSize(9);
      document.setTextColor(brief.priority === "CRITICAL" ? 185 : 154, brief.priority === "CRITICAL" ? 28 : 82, 28);
      document.text(brief.priority, pageWidth - margin - document.getTextWidth(brief.priority), cursorY);
      cursorY += 8;
      document.setFont("helvetica", "normal");
      heading("Recommended action");
      writeWrapped(brief.recommended_action);
      heading(`Trigger confidence: ${Math.round(brief.confidence_score * 100)}%`);
      heading("Confidence rationale & field conditionality");
      writeWrapped(brief.confidence_rationale);
      heading("Key bottlenecks / risks");
      brief.key_bottlenecks.forEach((item) => writeWrapped(`• ${item}`, 10, [51, 65, 85], 2));
      cursorY += 7;
    });

    const pageCount = document.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      document.setPage(page);
      document.setFontSize(8);
      document.setTextColor(100, 116, 139);
      document.text(`Generated by Sentinel · Validate with field observations and local coordination · Page ${page} of ${pageCount}`, margin, pageHeight - 9);
    }
    const filenameDistrict = response.district_name.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");
    document.save(`sentinel-action-brief-${filenameDistrict}.pdf`);
    showToast("Action brief exported as PDF.", "success");
  } catch (error) {
    showToast(`Could not export PDF: ${error.message}`, "error");
  } finally {
    elements.exportBrief.disabled = false;
    elements.exportBrief.textContent = "Export Action Brief (PDF)";
  }
}

function openAuditModal() { elements.auditModal.classList.remove("hidden"); elements.auditModal.setAttribute("aria-hidden", "false"); loadAuditLogs(); }
function closeAuditModal() { elements.auditModal.classList.add("hidden"); elements.auditModal.setAttribute("aria-hidden", "true"); }
function showToast(message, type) { elements.toast.className = `fixed bottom-5 right-5 z-[1100] rounded-lg border px-4 py-3 text-sm shadow-xl ${type === "success" ? "border-emerald-400/30 bg-emerald-950 text-emerald-100" : "border-red-400/30 bg-red-950 text-red-100"}`; elements.toast.textContent = message; elements.toast.classList.remove("hidden"); window.setTimeout(() => elements.toast.classList.add("hidden"), 4200); }

async function bootstrap() {
  initMap();
  try {
    const [statuses, geojson] = await Promise.all([request("/districts/status"), request("/districts/geojson")]);
    statuses.forEach((district) => state.statusByDistrict.set(district.district_name, district));
    addGeoJson(geojson);
    setApiStatus(true, "Live API connected");
  } catch (error) {
    setApiStatus(false, "API unavailable");
    elements.briefs.innerHTML = `<div class="empty-state"><span class="text-3xl text-red-400">!</span><p>Unable to load Sentinel data</p><span>${escapeHtml(error.message)}</span></div>`;
  }
}

document.querySelector("#audit-button").addEventListener("click", openAuditModal);
document.querySelector("#audit-close").addEventListener("click", closeAuditModal);
document.querySelector("#audit-backdrop").addEventListener("click", closeAuditModal);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAuditModal(); });
elements.exportBrief.addEventListener("click", exportBriefPdf);
bootstrap();
