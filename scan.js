/* Dolce Timer – Escáner universal de códigos (ZXing)
 * Sustituye a BarcodeDetector: funciona también en iPhone/Safari y sin HTTPS estricto.
 * Se encarga del diálogo «sc»: abre la cámara trasera, decodifica en bucle y avisa
 * al botón «Linterna» si el dispositivo lo permite. La app decide qué hacer con cada
 * código leído: un QR de vinculación (dolce-timer-…) se envía a SCAN.onQr(), y un
 * código de barras de producto se busca en Open Food Facts.
 */
(() => {
    "use strict";
    const $ = i => document.getElementById(i);
    const ZB = () => window.ZXingBrowser;

    /* ---------- Linterna (torch) ---------- */
    let torchTrack = null, torchOn = false;

    function trackHasTorch(t) {
        try { return !!(t.getCapabilities && t.getCapabilities().torch); } catch { return false }
    }
    async function refreshTorch() {
        const b = $("torch");
        if (!b) return;
        const ok = !!torchTrack && trackHasTorch(torchTrack);
        b.hidden = !ok;
        if (!ok) torchOn = false;
        b.setAttribute("aria-pressed", torchOn ? "true" : "false");
        b.innerHTML = '<i class="fa-solid fa-lightbulb" aria-hidden="true"></i>' + (torchOn ? "Linterna activada" : "Linterna");
    }
    async function toggleTorch() {
        if (!torchTrack || !trackHasTorch(torchTrack)) return;
        try {
            await torchTrack.applyConstraints({ advanced: [{ torch: !torchOn }] });
            torchOn = !torchOn;
        } catch { toastScan("La linterna no está disponible ahora."); }
        refreshTorch();
    }

    /* ---------- Apertura / cierre ---------- */
    let controls = null, busy = false, lastHit = 0, lastVal = "";

    async function openCam() {
        if (busy) return;
        busy = true;
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setMsg("Este navegador no permite acceder a la cámara. Escribe el código manualmente.");
                return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            const v = $("vid");
            v.srcObject = stream;
            try { await v.play() } catch (e) {
                /* Safari exige que la reproducción arranque de un gesto del usuario */
                v.muted = true;
                await v.play().catch(() => setMsg("Toca la pantalla para activar la vista de cámara."));
            }
            /* Un único lector multi-formato: decodifica QR (vinculación) y EAN/UPC (producto) */
            const reader = new (ZB().BrowserMultiFormatReader)();
            try {
                controls = await reader.decodeFromStream(stream, v, onFrame);
            } catch (e) {
                setMsg("No pude iniciar el escáner (" + (e && e.message || "error") + "). Prueba a escribir el código.");
                stopCam();
            }
            torchTrack = stream.getVideoTracks()[0] || null;
            refreshTorch();
        } catch (e) {
            const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
            setMsg(denied
                ? "Permiso de cámara denegado. Toca el icono 🔒 de la barra de direcciones → Cámara → Permitir, y vuelve a intentarlo."
                : "No pude abrir la cámara. Cierra otras apps que la usen o escribe el código manualmente.");
        } finally { busy = false }
    }

    function onFrame(err, result) {
        if (result) {
            const now = Date.now();
            const val = String(result.getText ? result.getText() : "");
            if (val && !(val === lastVal && now - lastHit < 2500)) {
                lastVal = val; lastHit = now;
                handle(val);
            }
        }
    }

    function stopCam() {
        try { if (controls) controls.stop(); } catch {}
        controls = null;
        const v = $("vid");
        if (v && v.srcObject) {
            try { v.srcObject.getTracks().forEach(t => t.stop()) } catch {}
            v.srcObject = null;
        }
        torchTrack = null; torchOn = false;
    }

    function closeDialog() {
        stopCam();
        const d = $("sc");
        if (d && d.open) d.close();
    }

    /* ---------- Qué hacer con cada código leído ---------- */
    function handle(txt) {
        txt = String(txt || "").trim();
        if (!txt) return;
        /* ¿Es un QR de vinculación? dolce-timer-<64 hex>-<8 dígitos> (admitimos mayúsculas) */
        const mm = txt.match(/^dolce-timer-[0-9a-f]{64}-(\d{8})$/i);
        if (mm) {
            beepOk();
            closeDialog();
            if (window.SCAN && typeof window.SCAN.onQr === "function") window.SCAN.onQr(mm[1]);
            return;
        }
        /* ¿Código de barras de producto? (solo cifras, formato EAN/UPC) */
        if (/^\d{6,14}$/.test(txt)) {
            beepOk();
            closeDialog();
            if (typeof window.__handleCode === "function") window.__handleCode(txt);
            return;
        }
        setMsg("Ese código no es de vinculación ni de producto. Inténtalo con otro.");
    }

    function beepOk() {
        try {
            const C = window.AudioContext || window.webkitAudioContext;
            const au = new C();
            const o = au.createOscillator(), g = au.createGain();
            o.connect(g); g.connect(au.destination);
            o.frequency.value = 1380; o.type = "sine";
            g.gain.setValueAtTime(.12, au.currentTime);
            g.gain.exponentialRampToValueAtTime(.0001, au.currentTime + .18);
            o.start(); o.stop(au.currentTime + .2);
            setTimeout(() => au.close().catch(() => {}), 600);
        } catch {}
        try { navigator.vibrate && navigator.vibrate(60) } catch {}
    }

    function setMsg(m) {
        const b = $("bm");
        if (b) b.textContent = m;
    }

    function toastScan(msg) {
        const t = $("toast");
        if (t) {
            t.textContent = msg;
            t.classList.add("show");
            clearTimeout(toastScan._h);
            toastScan._h = setTimeout(() => t.classList.remove("show"), 3200);
        }
    }

    /* ---------- API para sync.js (escanear QR de vinculación) ---------- */
    window.SCAN = {
        available: () => !!ZB(),
        start: () => {
            if (!ZB()) { toastScan("El escáner aún no se ha descargado. Comprueba tu conexión y vuelve a intentarlo."); return false }
            setMsg("Apunta a la pantalla «Ver QR» del otro móvil.");
            $("sc").showModal();
            openCam();
            return true;
        },
        onQr: null   // lo asigna sync.js: fn(pinDe8Digitos)
    };

    /* Botones del diálogo */
    function bind() {
        const bx = $("bx"), bo = $("bok"), tc = $("torch");
        if (bx) bx.onclick = closeDialog;
        if (bo) bo.onclick = () => {
            const c = ($("bc").value || "").trim();
            if (!c) return;
            closeDialog();
            handle(c);
        };
        if (tc) tc.onclick = toggleTorch;
        const d = $("sc");
        if (d) d.addEventListener("close", stopCam);
    }
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", bind);
    else bind();
})();
