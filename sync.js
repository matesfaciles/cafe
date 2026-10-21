/* Dolce Timer – Vinculación P2P entre dispositivos (PeerJS)
 * Código completo de un dispositivo:  Dolce-Timer-<id aleatorio ~64 hex>-<PIN 8 dígitos>
 * El usuario solo teclea los 8 dígitos; aquí se añade el prefijo y la parte estable.
 */
(() => {
    "use strict";
    const PREFIX = "dolce-timer-";            // PeerJS exige ids sin mayúsculas
    const DISPLAY_PREFIX = "Dolce-Timer-";
    const LS_ID = "dolceTimer.peerId";        // id estable (sin PIN)
    const LS_PIN = "dolceTimer.pin";          // PIN actual, para reconectar solos
    const MAX_PEERS = 8;

    const $ = i => document.getElementById(i);
    const rndHex = n => {
        const a = new Uint8Array(n / 2);
        crypto.getRandomValues(a);
        return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
    };
    const genPin = () => String(Math.floor(1e7 + Math.random() * 9e7)); // 8 dígitos, sin 0 inicial

    let baseId = "";
    try {
        baseId = localStorage.getItem(LS_ID) || "";
        if (!/^dolce-timer-[0-9a-f]{64}$/.test(baseId)) {
            baseId = PREFIX + rndHex(64);
            localStorage.setItem(LS_ID, baseId);
        }
    } catch { baseId = PREFIX + rndHex(64); }

    let pin = "";
    try {
        pin = localStorage.getItem(LS_PIN) || "";
        if (!/^\d{8}$/.test(pin)) { pin = genPin(); localStorage.setItem(LS_PIN, pin); }
    } catch { pin = genPin(); }

    const fullId = () => baseId + "-" + pin;
    const shortId = id => id ? id.slice(PREFIX.length, PREFIX.length + 8) + "…" + id.slice(-8) : "";

    /* ---------- QR propio (canvas, sin librerías) ---------- */
    function drawQr(text) {
        const c = $("qrC");
        if (!c) return false;
        try {
            if (window.qrcode && typeof window.qrcode === "object" && window.qrcode.create) {
                const q = window.qrcode.create({ text, ecl: "M" });
                const m = q.modules, n = m.size ?? m.data.length, size = n;
                const s = Math.floor(216 / size), off = Math.floor((240 - size * s) / 2);
                const ctx = c.getContext("2d");
                ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 240, 240);
                ctx.fillStyle = "#000";
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    const bit = (m.data ? m.data[y][x] : (typeof m.get === "function" ? m.get(y, x) : m[y][x]));
                    if (bit) ctx.fillRect(off + x * s, off + y * s, s, s);
                }
                return true;
            }
        } catch {}
        return false;
    }

    /* ---------- Estado de red ---------- */
    let peer = null;              // Peer host (con nuestro id completo)
    let hostReady = false;
    let conns = [];               // DataConnections activas (entrantes y salientes)
    let pendingOut = {};          // connId -> conn mientras abrimos el host si hace falta
    let lastTs = 0;               // marca local del último estado aplicado
    let applying = false;         // true mientras aplicamos un estado remoto (evita eco)
    let syncTries = 0;

    const stateJson = () => window.__dolceState ? window.__dolceState() : "{}";
    const api = window.SYNC = {
        connected: () => conns.some(c => c.open),
        broadcast: json => { lastTs = Math.max(lastTs, Date.now()); if (api.connected()) sendAll({ t: "st", ts: lastTs, j: json }); },
        markLocal: ts => { if (ts > lastTs) lastTs = ts; }
    };

    function sendAll(o) {
        const s = JSON.stringify(o);
        conns.forEach(c => { try { if (c.open) c.send(s); } catch {} });
    }

    function ui(status) {
        const box = $("pinBox");
        if (box) box.textContent = pin;
        const st = $("syncStat");
        if (st) st.textContent = status || (conns.length
            ? "Vinculado con " + conns.filter(c => c.open).length + " dispositivo(s). Los cambios se guardan en todos."
            : hostReady ? "Listo para recibir conexiones con tu PIN." : "Conectando con la red…");
        const dl = $("discBtn");
        if (dl) dl.hidden = !conns.length;
        const ul = $("peerList");
        if (ul) ul.innerHTML = conns.map(c => {
            const p = (c.peer || "").slice(-8);
            return `<li><span class="dot${c.open ? " on" : ""}"></span><span class="grow">PIN …${p}</span><small style="color:var(--mu)">${c.open ? "Conectado" : "Conectando…"}</small></li>`;
        }).join("");
    }

    /* ---------- Host (recibir conexiones) ---------- */
    function ensureHost(cb) {
        if (hostReady) return cb && cb();
        if (peer) { peer.on("open", () => cb && cb()); return; }
        try {
            peer = new Peer(fullId());
        } catch (e) {
            ui("No se pudo iniciar la conexión: " + e.message);
            return;
        }
        peer.on("open", () => { hostReady = true; ui(); cb && cb(); });
        peer.on("connection", conn => addConn(conn));
        peer.on("error", err => {
            if (err.type === "unavailable-id") {                       // alguien usa ya nuestro id
                pin = genPin();
                try { localStorage.setItem(LS_PIN, pin); } catch {}
                hostReady = false;
                try { peer.destroy(); } catch {}
                peer = null;
                ui("Tu PIN cambiaba de sitio: nuevo PIN " + pin + ". Pídele a tu compañero que use este.");
                setTimeout(() => ensureHost(), 800);
            } else if (err.type === "peer-unavailable") {
                ui("No encuentro ese PIN. Comprueba que el otro móvil tiene la app abierta.");
            } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
                ui("Sin conexión con el servidor de vinculación. Revisa internet y vuelve a intentarlo.");
            }
        });
        peer.on("disconnected", () => { hostReady = false; ui("Red de vinculación caída: reintentando…"); try { peer.reconnect(); } catch {} });
    }

    /* ---------- Conexión saliente por PIN ---------- */
    function connectByPin(p) {
        p = String(p || "").replace(/\D/g, "");
        if (!/^\d{8}$/.test(p)) { toastSync("El PIN son 8 números exactos."); return; }
        if (p === pin) { toastSync("Ese es tu propio PIN."); return; }
        if (conns.length + Object.keys(pendingOut).length >= MAX_PEERS) { toastSync("Demasiados dispositivos vinculados (máx. " + MAX_PEERS + ")."); return; }
        const target = baseId + "-" + p;
        ensureHost(() => {
            toastSync("Llamando al PIN " + p + "…");
            const conn = peer.connect(target, { reliable: true });
            pendingOut[conn.peer] = conn;
            addConn(conn);
            ui();
        });
    }

    function addConn(conn) {
        const finish = () => {
            delete pendingOut[conn.peer];
            if (!conns.includes(conn)) conns.push(conn);
            ui();
            // Handshake: cada uno comparte su marca; quien tenga la más reciente envía el estado
            sendTo(conn, { t: "hi", ts: lastTs });
        };
        conn.on("open", finish);
        conn.on("data", d => onData(d, conn));
        conn.on("close", () => {
            conns = conns.filter(c => c !== conn);
            delete pendingOut[conn.peer];
            ui();
            scheduleReconnect(conn.peer);
        });
        conn.on("error", () => { conns = conns.filter(c => c !== conn); delete pendingOut[conn.peer]; ui(); });
    }

    const sendTo = (conn, o) => { try { if (conn.open) conn.send(JSON.stringify(o)); } catch {} };

    /* ---------- Manejo de mensajes ---------- */
    function onData(raw, from) {
        let m;
        try { m = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
        if (!m || !m.t) return;
        if (m.t === "hi") {
            if (+m.ts > lastTs) requestState(from);
            else if (lastTs) sendTo(from, { t: "st", ts: lastTs, j: stateJson() });
        } else if (m.t === "req") {
            if (lastTs) sendTo(from, { t: "st", ts: lastTs, j: stateJson() });
        } else if (m.t === "st") {
            applyRemote(m);
        }
    }

    function requestState(from) {
        if (from) sendTo(from, { t: "req" });
        else conns.forEach(c => sendTo(c, { t: "req" }));
    }

    function applyRemote(m) {
        const ts = +m.ts || 0;
        if (!ts || ts <= lastTs || applying) return;      // ya tenemos algo igual o más nuevo
        if (!window.__dolceApply) return;
        applying = true;
        try {
            const ok = window.__dolceApply(m.j);           // la app valida antes de aceptar
            if (ok) { lastTs = ts; ui("Estado sincronizado desde otro dispositivo."); }
            else if (lastTs) sendAll({ t: "st", ts: lastTs, j: stateJson() }); // rechazo → proponemos el nuestro
        } catch {}
        applying = false;
    }

    /* Reconexión suave con los últimos PIN conocidos */
    const LS_LAST = "dolceTimer.peers";
    function rememberPeers() {
        try { localStorage.setItem(LS_LAST, JSON.stringify(conns.map(c => c.peer))); } catch {}
    }
    function scheduleReconnect(gonePeer) {
        rememberPeers();
        if (syncTries++ > 3) return;
        setTimeout(() => { if (gonePeer && !conns.some(c => c.peer === gonePeer)) connectByPin(gonePeer.slice(-8)); }, 3000);
    }

    function disconnectAll() {
        conns.forEach(c => { try { c.close(); } catch {} });
        conns = [];
        try { localStorage.removeItem(LS_LAST); } catch {}
        ui("Desvinculado. Los cambios vuelven a guardarse solo en este móvil.");
    }

    /* ---------- Escáner QR ---------- */
    let scanStream = null, scanTimer = null;
    async function scanQr() {
        if (!("BarcodeDetector" in window) || !navigator.mediaDevices) {
            toastSync("Tu navegador no puede escanear QR con la cámara. Escribe el PIN de 8 dígitos.");
            return;
        }
        try {
            const det = new BarcodeDetector({ formats: ["qr_code"] });
            scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            const v = $("vid");
            v.srcObject = scanStream;
            await v.play();
            $("bm").textContent = "Apunta a la pantalla «Ver QR» del otro móvil.";
            $("sc").showModal();
            scanTimer = setInterval(async () => {
                try {
                    const r = await det.detect(v);
                    if (r[0]) {
                        const txt = String(r[0].rawValue || "");
                        const mm = txt.match(/(\d{8})\s*$/);
                        if (/^Dolce-Timer-[0-9a-f]{64}-\d{8}$/i.test(txt) && mm) {
                            stopQrScan();
                            $("pinIn").value = mm[1];
                            connectByPin(mm[1]);
                        }
                    }
                } catch {}
            }, 400);
        } catch {
            toastSync("No pude abrir la cámara. Escribe el PIN.");
        }
    }
    function stopQrScan() {
        clearInterval(scanTimer);
        if (scanStream) scanStream.getTracks().forEach(t => t.stop());
        scanStream = null;
        if ($("sc").open) $("sc").close();
    }

    function toastSync(msg) {
        const t = $("toast");
        if (t) {
            t.textContent = msg;
            t.classList.add("show");
            clearTimeout(toastSync._h);
            toastSync._h = setTimeout(() => t.classList.remove("show"), 3200);
        }
    }

    /* ---------- UI ---------- */
    function bindUi() {
        if (!$("pinBox")) return;
        $("newPin").onclick = () => {
            pin = genPin();
            try { localStorage.setItem(LS_PIN, pin); } catch {}
            hostReady = false;
            disconnectAllQuiet();
            try { if (peer) peer.destroy(); } catch {}
            peer = null;
            ensureHost();
            ui("Nuevo PIN generado. Compártelo otra vez.");
        };
        $("qrBtn").onclick = () => {
            const w = $("qrWrap");
            w.hidden = !w.hidden;
            if (!w.hidden) {
                const txt = DISPLAY_PREFIX + baseId.slice(PREFIX.length) + "-" + pin;
                if (!drawQr(txt)) w.innerHTML = '<p class="hint" style="color:#000;padding:8px">QR no disponible sin conexión. Usa el PIN: ' + pin + "</p>";
            }
        };
        $("connBtn").onclick = () => connectByPin($("pinIn").value);
        $("pinIn").onkeydown = e => { if (e.key === "Enter") connectByPin(e.target.value); };
        $("pinIn").oninput = e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8); };
        $("scanQr").onclick = scanQr;
        $("discBtn").onclick = disconnectAll;
        $("sc").addEventListener("close", () => { if (scanStream) stopQrScan(); });
    }

    function disconnectAllQuiet() {
        conns.forEach(c => { try { c.close(); } catch {} });
        conns = [];
    }

    /* ---------- Arranque ---------- */
    function start() {
        bindUi();
        ui("Conectando con la red de vinculación…");
        ensureHost(() => {
            ui();
            let prev = [];
            try { prev = JSON.parse(localStorage.getItem(LS_LAST) || "[]"); } catch {}
            prev.slice(0, MAX_PEERS).forEach(id => { if (/^\d{8}$/.test(id.slice(-8))) connectByPin(id.slice(-8)); });
        });
        setInterval(ui, 5000);
    }

    if ("Peer" in window) start();
    else window.addEventListener("load", () => setTimeout(() => {
        if ("Peer" in window) start();
        else { const st = $("syncStat"); if (st) st.textContent = "PeerJS no cargó (¿sin internet?). Recarga la página para vincular."; }
    }, 500));
})();
