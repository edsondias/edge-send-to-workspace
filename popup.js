const $ = (id) => document.getElementById(id);

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function tabMatches(tab, hostname, mode, customPattern) {
  const h = hostnameOf(tab.url || tab.pendingUrl || "");
  if (!h) return false;
  if (mode === "host") return hostname ? h === hostname : false;
  if (mode === "subdomain") return hostname ? (h === hostname || h.endsWith("." + hostname)) : false;
  if (mode === "custom") {
    const p = (customPattern || "").trim().toLowerCase();
    if (!p) return false;
    if (p.startsWith("*.")) { const base = p.slice(2); return h === base || h.endsWith("." + base); }
    return h === p;
  }
  return false;
}

let currentHostname = null;
let currentWindowId = null;

function selectedMode() {
  return document.querySelector("input[name=mode]:checked").value;
}
function selectedTargetWindowId() {
  const el = document.querySelector("input[name=target]:checked");
  return el ? Number(el.value) : null;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function buildWindowList(preselectId) {
  const wins = (await chrome.windows.getAll({ populate: true })).filter((w) => w.type === "normal");
  const box = $("windows");
  box.innerHTML = "";
  for (const w of wins) {
    const activeTab = w.tabs.find((t) => t.active) || w.tabs[0];
    const label = `${w.tabs.length} aba(s) - ${activeTab ? (activeTab.title || activeTab.url) : ""}`;
    const checked = preselectId != null && preselectId === w.id ? "checked" : "";
    const isCurrent = w.id === currentWindowId ? ' <span class="tag">atual</span>' : "";
    const row = document.createElement("label");
    row.className = "win";
    row.innerHTML =
      `<input type="radio" name="target" value="${w.id}" ${checked}/>` +
      `<span class="lbl">${escapeHtml(label)}</span>${isCurrent}`;
    box.appendChild(row);
  }
}

async function refreshPreview() {
  const mode = selectedMode();
  $("customRow").style.display = mode === "custom" ? "flex" : "none";
  const target = selectedTargetWindowId();
  const all = await chrome.tabs.query({});
  const matched = all.filter(
    (t) => t.windowId !== target && tabMatches(t, currentHostname, mode, $("customPattern").value)
  );
  $("count").textContent = matched.length;
}

function setStatus(t, isErr) {
  const e = $("status");
  e.textContent = t;
  e.className = isErr ? "err" : "ok";
}

async function doMove() {
  const target = selectedTargetWindowId();
  if (target == null) { setStatus("Selecione a janela de destino.", true); return; }

  const opts = {
    mode: selectedMode(),
    hostname: currentHostname,
    customPattern: $("customPattern").value,
    targetWindowId: target,
    focusAfter: $("focusAfter").checked,
  };

  // Persiste para o atalho de teclado reaproveitar.
  await chrome.storage.local.set({
    mode: opts.mode,
    customPattern: opts.customPattern,
    targetWindowId: target,
    focusAfter: opts.focusAfter,
  });

  setStatus("Movendo...");
  const res = await chrome.runtime.sendMessage({ type: "move", opts });
  if (!res) { setStatus("Sem resposta do service worker.", true); return; }
  if (res.error === "target-missing")
    setStatus("A janela de destino nao existe mais. Reabra o Workspace e atualize a lista.", true);
  else if (res.error === "no-target") setStatus("Nenhuma janela de destino definida.", true);
  else if (res.error) setStatus("Erro: " + res.error, true);
  else setStatus(`Movidas ${res.moved} aba(s).`, false);

  await buildWindowList(target);
  await refreshPreview();
}

async function init() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHostname = active ? hostnameOf(active.url) : null;
  currentWindowId = active ? active.windowId : null;
  $("host").textContent = currentHostname || "(desconhecido)";
  $("customPattern").placeholder = currentHostname ? `*.${currentHostname}` : "*.exemplo.com";

  const s = await chrome.storage.local.get({
    mode: "host", customPattern: "", targetWindowId: null, focusAfter: true,
  });
  const modeEl = document.querySelector(`input[name=mode][value="${s.mode}"]`);
  if (modeEl) modeEl.checked = true;
  $("customPattern").value = s.customPattern || "";
  $("focusAfter").checked = !!s.focusAfter;

  await buildWindowList(s.targetWindowId);
  await refreshPreview();

  document.querySelectorAll("input[name=mode]").forEach((r) => r.addEventListener("change", refreshPreview));
  $("customPattern").addEventListener("input", refreshPreview);
  $("windows").addEventListener("change", refreshPreview);
  $("moveBtn").addEventListener("click", doMove);
}

document.addEventListener("DOMContentLoaded", init);
