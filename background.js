// Service worker: matching por dominio + movimentacao de abas.
// Usado tanto pelo popup (via mensagem) quanto pelo atalho de teclado.

const DEFAULTS = {
  mode: "host",            // "host" | "subdomain" | "custom"
  customPattern: "",       // ex.: "*.exemplo.com" ou "exemplo.com"
  targetWindowId: null,    // janela do Workspace escolhida no popup
  focusAfter: true,
};

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function tabMatches(tab, hostname, mode, customPattern) {
  const h = hostnameOf(tab.url || tab.pendingUrl || "");
  if (!h) return false;
  if (mode === "host") {
    return hostname ? h === hostname : false;
  }
  if (mode === "subdomain") {
    return hostname ? (h === hostname || h.endsWith("." + hostname)) : false;
  }
  if (mode === "custom") {
    const p = (customPattern || "").trim().toLowerCase();
    if (!p) return false;
    if (p.startsWith("*.")) {
      const base = p.slice(2);
      return h === base || h.endsWith("." + base);
    }
    return h === p;
  }
  return false;
}

async function collectTabs({ mode, hostname, customPattern, targetWindowId }) {
  const all = await chrome.tabs.query({});
  return all.filter(
    (t) => t.windowId !== targetWindowId && tabMatches(t, hostname, mode, customPattern)
  );
}

async function performMove(opts) {
  const { targetWindowId, focusAfter } = opts;
  if (targetWindowId == null) return { error: "no-target" };

  // A janela de destino ainda existe? (IDs mudam quando o Workspace e reaberto)
  try {
    await chrome.windows.get(targetWindowId);
  } catch {
    return { error: "target-missing" };
  }

  const matched = await collectTabs(opts);
  if (!matched.length) return { moved: 0, total: 0 };

  const pinned = matched.filter((t) => t.pinned);
  const normal = matched.filter((t) => !t.pinned);

  let moved = 0;
  let idx = 0;
  // Abas fixadas precisam ficar na regiao fixada (inicio da barra).
  for (const t of pinned) {
    try {
      await chrome.tabs.move(t.id, { windowId: targetWindowId, index: idx });
      idx++;
      moved++;
    } catch (_) { /* ignora aba que nao pode mover */ }
  }
  for (const t of normal) {
    try {
      await chrome.tabs.move(t.id, { windowId: targetWindowId, index: -1 });
      moved++;
    } catch (_) { /* ignora */ }
  }

  if (focusAfter) {
    try { await chrome.windows.update(targetWindowId, { focused: true }); } catch (_) {}
  }
  return { moved, total: matched.length };
}

// Mensagens vindas do popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "move") {
    performMove(msg.opts).then(sendResponse);
    return true; // resposta assincrona
  }
  if (msg && msg.type === "preview") {
    collectTabs(msg.opts).then((tabs) => sendResponse({ count: tabs.length }));
    return true;
  }
});

async function loadSettings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

// Atalho de teclado: usa o dominio da aba ativa + janela de destino salva.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "move-to-workspace") return;
  const s = await loadSettings();
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const hostname = active ? hostnameOf(active.url) : null;

  if (s.mode !== "custom" && !hostname) { flashBadge("?"); return; }

  const res = await performMove({
    mode: s.mode,
    hostname,
    customPattern: s.customPattern,
    targetWindowId: s.targetWindowId,
    focusAfter: s.focusAfter,
  });

  if (res.error) flashBadge("!");
  else flashBadge(String(res.moved));
});

function flashBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}
