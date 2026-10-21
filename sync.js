/* Dolce Timer – Vinculación P2P entre dispositivos (PeerJS)
 * Código completo de un dispositivo:  dolce-timer-<cadena fija de 64 hex>-<PIN 8 dígitos>
 * La parte de 64 caracteres es SIEMPRE la misma en todos los móviles: lo único que
 * cambia entre dispositivos son los 8 dígitos del PIN. Así basta con teclear el PIN
 * para calcular el id completo del compañero.
 */
(() => {
    "use strict";
    const PREFIX = "dolce-timer-";            // PeerJS exige ids sin mayúsculas
    const BASE = PREFIX + "b4c8f2a6d9e1375c0af6db21e84c9573fa0c2e6b1d974a05c3e8fb6210ad74c9"; // fijo, mismo en todos los dispositivos
    const LS_PIN = "dolceTimer.pin";          // PIN actual, para reconectar solos
    const MAX_PEERS = 8;

    const $ = i => document.getElementById(i);
    const genPin = () => String(Math.floor(1e7 + Math.random() * 9e7)); // 8 dígitos, sin 0 inicial

    /* Elegir PIN libre: si la red de señalización ya tiene ese id ocupado, probamos otro.
     * Como la base es común, el PIN es literalmente el identificador de cada dispositivo. */
    let pin = "";
    try {
        pin = localStorage.getItem(LS_PIN) || "";
        if (!/^\d{8}$/.test(pin)) pin = "";
    } catch {}
    if (!pin) pin = genPin();

    const fullId = p => BASE + "-" + p;
    const pinOf = id => id ? id.slice(-8) : "";

    /* ---------- QR propio (librería qrcode, canvas) ---------- */
    function drawQr(text) {
        const c = $("qrC");
        if (!c) return false;
        try {
            if (window.QRCode && window.QRCode.create) {
                const q = window.QRCode.create(text, { errorCorrectionLevel: "M" });
                const m = q.modules, size = m.size;
                const s = Math.floor(216 / size), off = Math.floor((240 - size * s) / 2);
                const ctx = c.getContext("2d");
                ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 240, 240);
                ctx.fillStyle = "#000";
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    if (m.data[y * size + x]) ctx.fillRect(off + x * s, off + y * s, s, s);
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
    let pendingOut = {};          // peerId -> conn pendiente de abrir
    let lastTs = 0;               // marca local del último estado aplicado
    let applying = false;         // true mientras aplicamos un estado remoto (evita eco)
    let syncTries = 0;
    let reconnecting = false;     // evita bucles de reconexión automática
    let pinTries = 0;             // intentos de cambiar de PIN por estar ocupado

    const stateJson = () => window.__dolceState ? window.__dolceState() : "{}";
    const api = window.SYNC = {
        connected: () => conns.some(c => c.open),
        broadcast: json => {
            lastTs = Math.max(lastTs, Date.now());
            if (api.connected()) sendAll({ t: "st", ts: lastTs, j: json });
        },
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
            const p = pinOf(c.peer);
            return `<li><span class="dot${c.open ? " on" : ""}"></span><span class="grow">PIN ${p}</span><small style="color:var(--mu)">${c.open ? "Conectado" : "Conectando…"}</small></li>`;
        }).join("");
    }

    /* Cerrar el peer actual y volver a abrirlo (con el PIN vigente o uno nuevo) */
    function rebuildPeer(newPin) {
        if (newPin) {
            pin = newPin;
            try { localStorage.setItem(LS_PIN, pin); } catch {}
        }
        disconnectAllQuiet();
        hostReady = false;
        try { if (peer) peer.destroy(); } catch {}
        peer = null;
        ensureHost();
    }

    /* ---------- Host (recibir conexiones) ---------- */
    function ensureHost(cb) {
        if (hostReady) return cb && cb();
        if (peer) { if (cb) peer.once("open", cb); return; }
        try {
            peer = new Peer(fullId(pin), { debug: 0 });
        } catch (e) {
            ui("No se pudo iniciar la vinculación: " + e.message);
            return;
        }
        peer.on("open", () => { hostReady = true; pinTries = 0; ui(); cb && cb(); });
        peer.on("connection", conn => addConn(conn));
        peer.on("error", err => {
            if (err.type === "unavailable-id") {
                /* La base es común a todos los móviles: si alguien usa ya ese id,
                 * su PIN coincide con el nuestro. Generamos uno nuevo hasta encontrar
                 * un hueco libre en la red de señalización. */
                if (pinTries++ < 5) {
                    const np = genPin();
                    rebuildPeer(np);
                    ui("Ese PIN ya estaba en uso: tienes un PIN nuevo (" + np + "). Compártelo otra vez.");
                } else {
                    ui("No hay PIN disponible ahora mismo. Pulsa «Nuevo PIN» o inténtalo más tarde.");
                }
            } else if (err.type === "peer-unavailable") {
                ui("No encuentro ese PIN. Comprueba que el otro móvil tiene la app abierta y muestra ese PIN.");
            } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "browser-incompatible") {
                ui(err.type === "browser-incompatible"
                    ? "Este navegador no permite la vinculación directa (WebRTC)."
                    : "Sin conexión con el servidor de vinculación. Revisa internet y vuelve a intentarlo.");
            }
        });
        peer.on("disconnected", () => {
            hostReady = false;
            ui("Red de vinculación caída: reintentando…");
            try { peer.reconnect(); } catch {}
        });
    }

    /* ---------- Conexión saliente por PIN ---------- */
    function connectByPin(p) {
        p = String(p || "").replace(/\D/g, "");
        if (!/^\d{8}$/.test(p)) { toastSync("El PIN son 8 números exactos."); return; }
        if (p === pin) { toastSync("Ese es tu propio PIN."); return; }
        if (conns.length + Object.keys(pendingOut).length >= MAX_PEERS) { toastSync("Demasiados dispositivos vinculados (máx. " + MAX_PEERS + ")."); return; }
        const target = fullId(p);
        if (conns.some(c => c.peer === target) || pendingOut[target]) { toastSync("Ya estás vinculado con ese PIN."); return; }
        ensureHost(() => {
            toastSync("Llamando al PIN " + p + "…");
            const conn = peer.connect(target, { reliable: true });
            pendingOut[target] = conn;
            addConn(conn);
            ui();
            /* Si en 12 s no se abre, avisamos y limpiamos la llamada pendiente */
            setTimeout(() => {
                if (pendingOut[target]) {
                    delete pendingOut[target];
                    conns = conns.filter(c => c !== conn);
                    try { conn.close(); } catch {}
                    ui("No se pudo conectar con el PIN " + p + ". ¿Lo has escrito bien? ¿Tiene la app abierta?");
                }
            }, 12000);
        });
    }

    function addConn(conn) {
        const finish = () => {
            delete pendingOut[conn.peer];
            if (!conns.includes(conn)) conns.push(conn);
            syncTries = 0;
            rememberPeers();
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
        if (reconnecting || ++syncTries > 3) return;
        reconnecting = true;
        setTimeout(() => {
            reconnecting = false;
            if (gonePeer && !conns.some(c => c.peer === gonePeer)) connectByPin(pinOf(gonePeer));
        }, 3000);
    }

    function disconnectAll() {
        conns.forEach(c => { try { c.close(); } catch {} });
        conns = [];
        syncTries = 100;                                   // que no intente reconectar solo
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
                        const txt = String(r[0].rawValue || "").trim();
                        /* Aceptamos tanto la forma interna (dolce-timer-…) como la visible
                         * (Dolce-Timer-…): lo único que se lee son los 8 dígitos finales. */
                        const mm = txt.match(/^dolce-timer-[0-9a-f]{64}-(\d{8})$/i);
                        if (mm) {
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
            pinTries = 0;
            rebuildPeer(genPin());
            ui("Nuevo PIN generado. Compártelo otra vez.");
        };
        $("qrBtn").onclick = () => {
            const w = $("qrWrap");
            w.hidden = !w.hidden;
            if (!w.hidden) {
                const txt = fullId(pin);                   // código completo del dispositivo
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
        try { localStorage.setItem(LS_PIN, pin); } catch {}   // fijar el PIN en cuanto la señalización lo confirma
        bindUi();
        ui("Conectando con la red de vinculación…");
        ensureHost(() => {
            ui();
            let prev = [];
            try { prev = JSON.parse(localStorage.getItem(LS_LAST) || "[]"); } catch {}
            prev.slice(0, MAX_PEERS).forEach(id => { if (/^\d{8}$/.test(pinOf(id))) connectByPin(pinOf(id)); });
        });
        setInterval(ui, 5000);
    }

    /* PeerJS y qrcode se cargan con «defer»: esperan a que el documento termine de parsearse,
     * así que en este punto ya están disponibles (si hay internet). */
    if ("Peer" in window) start();
    else {
        const st = $("syncStat");
        if (st) st.textContent = "No se pudo cargar el servicio de vinculación (¿sin internet?). Recarga la página para intentarlo otra vez.";
    }
})();
