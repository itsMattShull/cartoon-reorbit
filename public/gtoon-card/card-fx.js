/* ===================== CARD FX: LENS FLARE + PULSE =====================
 * Everything is sized from card.offsetWidth (384 native) via u = width / 384,
 * so it scales if the card size ever changes. Layout (offsetWidth) ignores the
 * card's CSS scale(), which is what we want.
 *
 *   fxLensFlare(cardEl, opts)  -> Promise (resolves when the flare is gone)
 *   fxPulse(cardEl, opts)      -> { stop() }
 *   fxClear(cardEl)            -> cancel + remove everything
 *   fxMountPanel()             -> optional: adds a small control panel
 *
 * Requires `.card { overflow: visible }` or the flare gets clipped.
 * ===================================================================== */

const FX_CSS = `
/* IMPORTANT: no z-index / transform / opacity / filter on .fx.
   Any of those makes it a stacking context, and the flare's
   mix-blend-mode:screen would then blend against nothing instead of the card. */
.card .fx, .card .fx-lightning-layer { 
    position: absolute; 
    inset: 0; 
    pointer-events: none; 
}
.card .fx-lightning-layer { 
    position: absolute; 
    inset: 0; 
    pointer-events: none;
    overflow: visible; /* Prevents container clipping */
}

.card .fx-lightning-layer svg.fx-bolt {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    mix-blend-mode: screen;
}
.card .fx-flare { position: absolute; left: 50%; top: 50%; mix-blend-mode: screen; }
.card .fx-spokes,
.card .fx-glow { position: absolute; inset: 0; }

.card .fx-spoke {
    position: absolute;
    bottom: 50%;
    transform-origin: 50% 100%;
    background: linear-gradient(to top,
        rgba(255,255,255,0) 0%,
        rgba(255,255,255,0.95) 30%,
        rgba(190,235,255,0.35) 70%,
        rgba(255,255,255,0) 100%);
}

.card .fx-canvas-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    mix-blend-mode: screen;
}
   
.card.fx-stacking-context {
    position: relative;
    z-index: 1;
}
.card .fx-orb { position: absolute; left: 50%; top: 50%; border-radius: 50%; will-change: transform, opacity; }
.card .fx-hole { position: absolute; left: 50%; top: 50%; border-radius: 50%; background: #000; }

/* sits between .e1 and .e2 in DOM order */
.card .fx-pulse { position: absolute; inset: 0; pointer-events: none; }
.card .fx-ring { position: absolute; inset: 0; border-radius: 50%; will-change: transform, opacity; }
/* ---- CONTROL PANEL ---- */
#fxControls {
    position: fixed; 
    left: 20px; 
    top: 250px; 
    width: 280px; 
    padding: 14px 16px;
    background: rgba(0, 15, 25, 0.9); 
    border: 1px solid #31505a; 
    z-index: 1000;
    font-family: tox, sans-serif; 
    color: var(--text-main, #e1e7f0); 
    font-size: 12px;
    display: flex; 
    flex-direction: column; 
    gap: 10px;
}
#fxControls .controlTitle { 
    font-size: 13px; 
    letter-spacing: 1px; 
    text-align: center; 
    font-weight: bold; 
}
#fxControls .fx-row { 
    display: flex; 
    flex-wrap: wrap; /* Allows buttons to flow to the next row */
    gap: 6px; 
}
#fxControls button { 
    flex: 1 1 calc(33.333% - 6px); /* Fits ~3 buttons per row, wrapping as needed */
    min-width: 75px;
    padding: 6px 4px; 
    font-size: 11px; 
    background: #1a2233;
    border: 1px solid #31505a; 
    color: inherit; 
    cursor: pointer;
    text-align: center;
    box-sizing: border-box;
}
#fxControls button:hover { 
    border-color: #fff; 
    background: #243048;
}
#fxControls label { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    gap: 6px; 
}
#fxControls input[type=range] { 
    flex: 1; 
}
`;
/* ===================== CSS INJECTION FOR FX GAS ===================== */
const FX_GAS_CSS = `
.card .fx-gas-stage {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 25;
}

.card .cloud-strand {
    position: absolute;
    top: 0;
    left: 0;
    width: 350px;
    height: 300px;
    transform-origin: 0px 0px;
    will-change: transform, opacity, filter;
}

.card .cloud-shape-mask {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}

.card .cloud-path-clipper {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    will-change: clip-path;
}

.card .cloud-inner-core {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(10, 12, 16, 0.98) 0%, rgba(18, 20, 26, 0.85) 55%, rgba(0, 0, 0, 0) 100%);
    will-change: transform, filter, width, height, left, top;
}

.card .cloud-edge-clone {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(
        circle, 
        rgba(255, 255, 255, 0.2) 0%, 
        rgba(0, 230, 255, 0.15) 35%, 
        rgba(80, 220, 150, 0.08) 65%, 
        rgba(255, 255, 255, 0) 100%
    );
    mix-blend-mode: color-dodge;
    z-index: 5;
    will-change: transform, filter, width, height, left, top;
    pointer-events: none;
}
`;
/* ===================== CSS INJECTION FOR FX CANVAS HOST ===================== */
const FX_CANVAS_CSS = `
.card .fx-host-canvas {
    position: absolute !important;
    pointer-events: none !important;
    overflow: visible !important;
    mix-blend-mode: screen !important;
}
`;

function fxEnsureStyles() {
    if (document.getElementById('fx-styles')) return;
    const s = document.createElement('style');
    s.id = 'fx-styles';
    s.textContent = FX_CSS + FX_GAS_CSS + FX_CANVAS_CSS;
    document.head.appendChild(s);
}

const fxMk = cls => {
    const d = document.createElement('div');
    d.className = cls;
    return d;
};

function fxLayer(card) {
    let fx = card.querySelector(':scope > .fx');
    if (!fx) {
        fx = fxMk('fx');
        card.appendChild(fx);            // last child = paints above .ufo
    }
    return fx;
}

function fxPulseLayer(card) {
    let layer = card.querySelector(':scope > .fx-pulse');
    if (!layer) {
        layer = fxMk('fx-pulse');
        const e1 = card.querySelector(':scope > .e1');
        if (e1) e1.after(layer); else card.prepend(layer);   // between .e1 and .e2
    }
    return layer;
}/* ===================== SIGNAL: CRT POWER-ON + GLITCH + CHROMATIC SPLIT + SCANLINES =====================
 *   fxSignal(target, opts) -> Promise (resolves when everything is gone; promise.stop() cancels + restores)
 *
 * `target` can be the .card, the .img_wrap, or the <img>/<canvas> inside it.
 * It is always resolved to the .img_wrap (the "host").
 *
 *   host (.img_wrap)         gets: CRT clip-path, RGB split SVG filter, brightness, jitter
 *   host.parentElement       gets: the scanline layer (so the scanlines are NOT clipped/filtered/
 *   (.ufo_small)                   jittered by the host effects; same as the test page, where
 *                                  they were injected into the circle, not the image wrapper)

 * ======================================================================================================= */

let _fxSignalSeq = 0;

function fxSignalEnsureCSS() {
    if (document.getElementById('fx-signal-css')) return;
    const s = document.createElement('style');
    s.id = 'fx-signal-css';
    s.textContent = `
.card .img_wrap { position: absolute; inset: 0; }   /* give the wrapper a real box (clip-path + filters need one) */
.fx-signal-scanlines {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; overflow: hidden; border-radius: inherit;
    z-index: 9999; mix-blend-mode: screen;
}
.fx-signal-scanlines canvas { display: block; width: 100%; height: 100%; }
`;
    document.head.appendChild(s);
}

function fxSignalResolveHost(target) {
    if (!target) return null;
    if (target.classList?.contains('img_wrap')) return target;
    if (target.classList?.contains('card')) return target.querySelector('.img_wrap');
    return target.closest?.('.img_wrap') || target.parentElement || null;
}

/* Same scanline renderer as initScanlines(), self-contained. Returns { destroy() }. */
function _fxSignalScanlines(container, o = {}) {
    const {
        fineSpacing = 6, fineHeight = 1, fineSpeed = 10, fineOpacity = 0.8,
        coarseHeight = 20, coarseSpeed = -50, coarseCount = 2, coarseOpacity = 0.4,
        color = { r: 255, g: 255, b: 255 }
    } = o;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    container.appendChild(canvas);

    let raf = null;

    function resize() {
        const w = container.clientWidth, h = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function animate(time) {
        if (!container.isConnected) return;
        const w = container.clientWidth, h = container.clientHeight;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${fineOpacity})`;
        const fineOffset = (time / 1000 * fineSpeed) % fineSpacing;
        for (let y = fineOffset; y < h; y += fineSpacing) ctx.fillRect(0, y, w, fineHeight);

        ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${coarseOpacity})`;
        const coarseOffset = (time / 1000 * coarseSpeed) % h;
        for (let i = 0; i < coarseCount; i++) {
            let y = coarseOffset + i * (h / coarseCount);
            y = ((y % h) + h) % h;
            ctx.fillRect(0, y, w, coarseHeight);
        }
        raf = requestAnimationFrame(animate);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    raf = requestAnimationFrame(animate);

    return {
        destroy() {
            cancelAnimationFrame(raf);
            ro.disconnect();
            canvas.remove();
        }
    };
}

function fxSignal(target, o = {}) {
    const host = fxSignalResolveHost(target);
    if (!host) {
        console.warn('fxSignal: could not find an .img_wrap for', target);
        return Promise.resolve();
    }
    fxSignalEnsureCSS();
    host._fxSignal?.stop();

    // NEW: unified transition. img_wrap opens while the aeroshell collapses
    host._fxOut?.cancel();
    host._fxOut = null;
    host.style.visibility = 'visible';
    fxAeroshellOut(host.closest('.card'));

    const {
        duration = 1200,
        split = 16,
        stepMs = 55,
        jitter = false,
        brightness = [9, 3.5, 1.5, 1],
        scanlines = true,
        scanlineFade = 900,
        scanlineOpacity = 0.9,
        scanlineOptions = {}
    } = o;

    const id = 'fxChroma' + (++_fxSignalSeq);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
    svg.innerHTML = `
        <defs>
            <filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
                <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
                <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
                <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
                <feOffset id="${id}R" in="r" dx="0" dy="0" result="ro"/>
                <feOffset id="${id}B" in="b" dx="0" dy="0" result="bo"/>
                <feBlend in="ro" in2="g" mode="screen" result="rg"/>
                <feBlend in="rg" in2="bo" mode="screen"/>
            </filter>
        </defs>`;
    document.body.appendChild(svg);
    const chR = svg.querySelector('#' + id + 'R');
    const chB = svg.querySelector('#' + id + 'B');

    const prevFilter = host.style.filter;
    const prevTransform = host.style.transform;

    const offs = [0, 0.3, 0.6, 1];
    const brightAt = p => {
        for (let i = 0; i < 3; i++) {
            if (p <= offs[i + 1]) {
                const t = (p - offs[i]) / (offs[i + 1] - offs[i]);
                const e = 1 - (1 - t) * (1 - t);
                return brightness[i] + (brightness[i + 1] - brightness[i]) * e;
            }
        }
        return brightness[3];
    };

    host.style.filter = `url(#${id}) brightness(${brightness[0]})`;

    const clip = host.animate([
        { clipPath: 'inset(49.6% 47% 49.6% 47%)', easing: 'ease-out', offset: 0 },
        { clipPath: 'inset(49.6% 0% 49.6% 0%)', offset: 0.25 },
        { clipPath: 'inset(49.6% 0% 49.6% 0%)', easing: 'cubic-bezier(.3,.9,.3,1)', offset: 0.35 },
        { clipPath: 'inset(0% 0% 0% 0%)', offset: 0.8 },
        { clipPath: 'inset(0% 0% 0% 0%)', offset: 1 }
    ], { duration });

    const scanParent = host.parentElement;
    let scanEl = null, scanFade = null, scanHandle = null;
    let crtDone = false, scanDone = !(scanlines && scanParent);
    let resolveFn;
    const promise = new Promise(r => { resolveFn = r; });

    function finalizeIfDone() {
        if (!(crtDone && scanDone)) return;
        if (host._fxSignal === handle) host._fxSignal = null;
        if (typeof _fxActiveInstances !== 'undefined') {
            const card = host.closest('.card');
            const a = card && _fxActiveInstances.get(card);
            if (a && a.signal === handle) delete a.signal;
        }
        resolveFn();
    }

    function killScan() {
        if (scanDone) return;
        scanDone = true;
        scanFade?.cancel();
        scanHandle?.destroy();
        scanEl?.remove();
        finalizeIfDone();
    }

    if (scanlines && scanParent) {
        scanParent.querySelectorAll(':scope > .fx-signal-scanlines').forEach(el => el._kill?.());

        scanEl = document.createElement('div');
        scanEl.className = 'fx-signal-scanlines';
        scanEl.style.opacity = String(scanlineOpacity);
        scanEl._kill = killScan;
        scanParent.appendChild(scanEl);

        scanHandle = _fxSignalScanlines(scanEl, scanlineOptions);
        scanFade = scanEl.animate(
            [{ opacity: scanlineOpacity }, { opacity: 0 }],
            { duration: scanlineFade, easing: 'ease-in', fill: 'forwards' }
        );
        scanFade.onfinish = killScan;
    }

    let raf = null, lastStep = -1, jx = 0, jy = 0;
    const start = performance.now();

    function killCRT() {
        if (crtDone) return;
        crtDone = true;
        cancelAnimationFrame(raf);
        clip.cancel();
        host.style.filter = prevFilter;
        host.style.transform = prevTransform;
        svg.remove();
        finalizeIfDone();
    }

    const tick = now => {
        if (crtDone) return;
        const elapsed = now - start;
        const p = elapsed / duration;
        if (p >= 1) return killCRT();

        const step = Math.floor(elapsed / stepMs);
        if (step !== lastStep) {
            lastStep = step;
            jx = Math.random() * 2 - 1;
            jy = Math.random() * 2 - 1;
        }

        const amp = Math.pow(1 - p, 1.4) * split;
        chR.setAttribute('dx', amp * (0.6 + jx * 0.4));
        chR.setAttribute('dy', amp * jy * 0.15);
        chB.setAttribute('dx', -amp * (0.6 - jx * 0.4));
        chB.setAttribute('dy', -amp * jy * 0.15);

        host.style.filter = `url(#${id}) brightness(${brightAt(p).toFixed(2)})`;
        if (jitter) host.style.transform = `translateX(${(jx * amp * 0.7).toFixed(2)}px)`;

        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const handle = { stop() { killCRT(); killScan(); } };
    host._fxSignal = handle;
    if (typeof _fxActiveInstances !== 'undefined') {
        const card = host.closest('.card');
        if (card) {
            const a = _fxActiveInstances.get(card) || {};
            a.signal = handle;
            _fxActiveInstances.set(card, a);
        }
    }
    promise.stop = handle.stop;
    return promise;
}
/* ===================== NOISE + AEROSHELL ===================== */

function _fxShellCancel(shell) {
    (shell._fxAnims || []).forEach(a => a.cancel());
    shell._fxAnims = [];
}

// current CSS transform (the centering translate), so scale() can be appended. Read AFTER cancelling anims.
function _fxShellBase(el) {
    const t = getComputedStyle(el).transform;
    return t && t !== 'none' ? t + ' ' : '';
}

function _fxFillFlippers(container, lineCount = 36, duration = 8) {
    container.querySelectorAll('.circle-flipper2').forEach(el => el.remove());
    const frag = document.createDocumentFragment();
    for (let i = 0; i < lineCount; i++) {
        const f = document.createElement('div');
        f.classList.add('circle-flipper2');
        f.style.animationDelay = `${-(i / lineCount) * duration}s`;
        f.style.animationDuration = `${duration}s`;
        frag.appendChild(f);
    }
    container.appendChild(frag);
}

// Exactly ONE aeroshell per card: reuses the markup's, builds one only if missing, removes duplicates.
function fxEnsureAeroshell(card, lineCount = 36, duration = 8) {
    if (!card) return null;
    const all = card.querySelectorAll('.aeroshell');
    all.forEach((el, i) => { if (i > 0) el.remove(); });
    let shell = all[0];

    if (!shell) {
        shell = document.createElement('div');
        shell.className = 'aeroshell';
        shell.style.visibility = 'hidden';
        shell.innerHTML = `
            <div class="ring2"></div>
            <div class="ring3"></div>
            <div class="rim"></div>
            <div class="ring1"></div>
            <div class="badge"></div>
            <div class="flipper-container">
                <div class="circle"></div>
                <div class="box-top"></div>
                <div class="box-bottom"></div>
            </div>`;
        const ufo = card.querySelector('.ufo') || card;
        const shadow = ufo.querySelector(':scope > .shadow');
        if (shadow) shadow.after(shell); else ufo.appendChild(shell);
    }

    const flip = shell.querySelector('.flipper-container');
    if (flip && !flip.querySelector('.circle-flipper2')) _fxFillFlippers(flip, lineCount, duration);
    return shell;
}

// Expand: rim + rings grow, badge flashes in, flipper fades up. Shows the shell first.
function fxAeroshellIn(card) {
    const shell = card?.querySelector('.aeroshell');
    if (!shell) return Promise.resolve();

    _fxShellCancel(shell);
    shell.style.visibility = 'visible';
    const anims = [];

    const T = 'translate(-50%, 50%) ';   // centering transform from your CSS
    const grow = (sel, duration, easing, opacity) => {
        const el = shell.querySelector(sel);
        if (!el) return;
        anims.push(el.animate([
            { transform: T + 'scale(0)', opacity: 0 },
            { transform: T + 'scale(1)', opacity }
        ], { duration, easing, fill: 'backwards' }));
    };
    grow('.rim', 600, 'cubic-bezier(0.16, 1, 0.3, 1)', 1);
    grow('.ring1', 650, 'cubic-bezier(0.34, 1.26, 1, 1)', 0.2);
    grow('.ring2', 350, 'cubic-bezier(0.05, 0.7, 0.1, 1)', 0.2);
    grow('.ring3', 550, 'cubic-bezier(0.25, 1, 0.5, 1)', 0.33);
    const badge = shell.querySelector('.badge');
    
    if (badge) {
        anims.push(badge.animate([
            { mixBlendMode: 'color-dodge', backgroundColor: 'rgb(0,255,255)', opacity: 1.0, transform: 'translate(-50%, -50%) scale(0.00) rotate(-15deg)', offset: 0 },
            { mixBlendMode: 'color-dodge', backgroundColor: 'rgb(162,247,250)', opacity: .6, transform: 'translate(-50%, -50%) scale(0.09) rotate(-15deg)', offset: 0.35 },
            { mixBlendMode: 'color-dodge', backgroundColor: 'rgba(153,255,255,0.9)', opacity: 1, transform: 'translate(-50%, -50%) scale(0.08) rotate(-15deg)', offset: 0.75 },
            { mixBlendMode: 'normal', backgroundColor: 'rgba(153,255,255,0.75)', opacity: 1, offset: 1 }
        ], { duration: 800, easing: 'ease-out', fill: 'backwards' }));
    }
    const flip = shell.querySelector('.flipper-container');
    if (flip) {
        anims.push(flip.animate(
            [{ filter: 'opacity(0)' }, { filter: 'opacity(1)' }],
            { duration: 400, easing: 'ease-in', fill: 'backwards' }
        ));
    }

    shell._fxAnims = anims;
    return Promise.all(anims.map(a => a.finished.catch(() => { }))).then(() => {
        if (shell._fxAnims === anims) shell._fxAnims = [];
    });
}

// Collapse: rings + rim shrink in a stagger, badge flashes out, flipper fades. Hides the shell at the end.
function fxAeroshellOut(card) {
    const shell = card?.querySelector('.aeroshell');
    if (!shell) return Promise.resolve();

    _fxShellCancel(shell);
    const anims = [];
    const ease = 'cubic-bezier(0.55, 0, 1, 0.45)';

    const T = 'translate(-50%, 50%) ';
    const shrink = (sel, duration, delay, opacity) => {
        const el = shell.querySelector(sel);
        if (!el) return;
        anims.push(el.animate([
            { transform: T + 'scale(1)', opacity },
            { transform: T + 'scale(0)', opacity: 0 }
        ], { duration, delay, easing: ease, fill: 'both' }));
    };
    shrink('.ring1', 300, 0, 0.2);
    shrink('.rim', 300, 30, 1);
    shrink('.ring3', 280, 60, 0.33);
    shrink('.ring2', 240, 90, 0.2);
    const badge = shell.querySelector('.badge');
    if (badge) {
        anims.push(badge.animate([
            { mixBlendMode: 'normal', backgroundColor: 'rgba(153,255,255,0.75)', opacity: 1, transform: 'translate(-50%, -50%) scale(0.085) rotate(-15deg)', offset: 0 },
            { mixBlendMode: 'color-dodge', backgroundColor: 'rgb(162,247,250)', opacity: 1, transform: 'translate(-50%, -50%) scale(0.098) rotate(-15deg)', offset: 0.35 },
            { mixBlendMode: 'color-dodge', backgroundColor: 'rgb(0,255,255)', opacity: 0, transform: 'translate(-50%, -50%) scale(0.086) rotate(-15deg)', offset: 1 }
        ], { duration: 380, easing: 'ease-out', fill: 'both' }));
    }
    const flip = shell.querySelector('.flipper-container');
    if (flip) {
        anims.push(flip.animate(
            [{ filter: 'opacity(1)' }, { filter: 'opacity(0)' }],
            { duration: 250, easing: 'ease-in', fill: 'both' }
        ));
    }

    shell._fxAnims = anims;
    return Promise.all(anims.map(a => a.finished.catch(() => { }))).then(() => {
        if (shell._fxAnims !== anims) return;   // superseded by a newer in/out call
        shell.style.visibility = 'hidden';
        _fxShellCancel(shell);
    });
}

// CRT collapse: full -> line -> dot, brightness ramps up. Hides .img_wrap at the end.
function fxSignalOut(card, o = {}) {
    const host = card?.querySelector('.img_wrap');
    if (!host) return Promise.resolve();
    const { duration = 420 } = o;

    host._fxSignal?.stop();
    host._fxOut?.cancel();
    host.parentElement?.querySelectorAll(':scope > .fx-signal-scanlines').forEach(el => el._kill?.());

    const anim = host.animate([
        { clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1)', easing: 'cubic-bezier(.7,0,.84,0)', offset: 0 },
        { clipPath: 'inset(49.6% 0% 49.6% 0%)', filter: 'brightness(3.5)', easing: 'ease-in', offset: 0.55 },
        { clipPath: 'inset(49.6% 47% 49.6% 47%)', filter: 'brightness(9)', offset: 1 }
    ], { duration, fill: 'forwards' });

    host._fxOut = anim;
    return anim.finished.then(() => {
        if (host._fxOut !== anim) return;
        host.style.visibility = 'hidden';
        anim.cancel();
        host._fxOut = null;
    }).catch(() => { });
}

/* NOISE: img_wrap CRT collapses while the aeroshell expands (mirror of fxSignal). */
function fxNoise(target, o = {}) {
    const card = target?.classList?.contains('card') ? target : target?.closest?.('.card');
    if (!card) return Promise.resolve();
    fxHeatshieldNeutral(card);
    fxEnsureAeroshell(card, o.lineCount, o.animationDuration);
    const out = fxSignalOut(card);
    fxAeroshellIn(card);
    return out;
}

/* Neutral (non-themed) heatshield/spec values, copied from the base `.card .ufo` block. */
const FX_NEUTRAL_THEME = {
    '--barrier-border-color': '#009999',
    '--barrier-grad-start': 'rgba(115, 155, 165, 1)',
    '--barrier-grad-end': 'rgba(115, 145, 155, 0)',
    '--spec-edge-color': 'rgba(51, 255, 255, 0)',
    '--spec-peak-color': 'rgba(255, 255, 255, 0.66)'
};

let _fxThemePropsRegistered = false;
function _fxRegisterThemeProps() {
    if (_fxThemePropsRegistered) return;
    _fxThemePropsRegistered = true;
    if (!window.CSS || !CSS.registerProperty) return;
    Object.entries(FX_NEUTRAL_THEME).forEach(([name, initialValue]) => {
        try { CSS.registerProperty({ name, syntax: '<color>', inherits: true, initialValue }); }
        catch (e) { /* already registered */ }
    });
}

/* Noise: heatshield + spec colors fade to the neutral values, and stay there (fill: forwards)
   even if the card's theme changes while in Noise. Use duration 0 to snap. */
function fxHeatshieldNeutral(card, duration = 350) {
    const ufo = card?.querySelector('.ufo');
    if (!ufo) return;
    _fxRegisterThemeProps();

    const hs = ufo.querySelector('.heatshield');
    const b0 = ufo.querySelector('.heatshield .barrier0');

    (ufo._fxNeutral || []).forEach(a => a.cancel());
    const opts = { duration, easing: 'ease-in', fill: 'forwards' };
    const anims = [ufo.animate([{ ...FX_NEUTRAL_THEME }], opts)];

    // stellar-only extras: barrier0 gradient layer and the glow animation
    if (b0) anims.push(b0.animate([{ opacity: 0 }], opts));
    if (hs) {
        hs.style.animation = 'none';
        anims.push(hs.animate([{ filter: 'drop-shadow(0 0 0px rgba(84, 84, 55, 0))' }], opts));
    }
    ufo._fxNeutral = anims;
}

/* Signal: fade from neutral back to the card's real theme. */
function fxHeatshieldRestore(card, duration = 350) {
    const ufo = card?.querySelector('.ufo');
    if (!ufo || !ufo._fxNeutral) return;

    const hs = ufo.querySelector('.heatshield');
    const b0 = ufo.querySelector('.heatshield .barrier0');
    const old = ufo._fxNeutral;
    ufo._fxNeutral = null;

    // start at neutral, end implicitly at the underlying (themed) value
    const opts = { duration, easing: 'ease-out' };
    ufo.animate([{ ...FX_NEUTRAL_THEME, offset: 0 }], opts);
    if (b0) b0.animate([{ opacity: 0, offset: 0 }], opts);

    old.forEach(a => a.cancel());
    if (hs) hs.style.animation = '';   // stellar glow resumes
}
/* ===================== PARTICLE BURST (CANVAS 2D) =====================
 * Generates tiny flickering specs moving radially outward with sinusoidal wiggle.
 * ===================================================================== */
function fxParticleBurst(card, o = {}) {
    if (!card) return Promise.resolve();

    const {
        count = [32, 84],                               // Range [min, max] random count per call
        minSize = 1.0,                                  // Min particle size (px at 384)
        maxSize = 2.0,                                  // Max particle size (px at 384)
        duration = 1500,                                // Total animation duration in ms
        minLife = 0.4,                                  // Min lifetime ratio of total duration
        maxLife = 1.5,                                  // Max lifetime ratio of total duration
        colors = ['#ffffff', '#fff4bb', '#3af0ff'],   // Flicker color palette
        minRadiusRatio = 0.35,                          // Spawn bias inner bound
        maxRadiusRatio = 1.5,                           // Spawn bias outer bound
        biasPower = 2.5,                                // Higher = strongly biased toward outer radius
        speed = [1.2, 2.8],                             // Radial velocity range (px/frame at 384)
        wiggleFreq = [0.05, 0.12],                      // Oscillation speed for path wiggle
        wiggleAmp = [0.5, 1.8],                         // Lateral displacement amplitude
        flickerFreq = [0.1, 0.7],                       // Brightness flicker speed
        peakOpacity = 1.0,                              // Max opacity alpha
        reach = 1.95,                                   // Max radial boundary
        // --- NEW OPTIONS ---
        standalone = true,                              // If true, creates an unconstrained sub-layer under .card
        targetLayer = null                              // Custom container element if explicitly provided
    } = o;

    const cw = card.offsetWidth || 384;
    const u = cw / 384;
    const maxR = (cw / 2) * reach;

    /* --- Determine FX Target Container --- */
    let container;

    if (targetLayer) {
        container = targetLayer;
    } else if (standalone) {
        // Create an isolated, unclipped FX container directly attached to .card
        container = document.createElement('div');
        container.className = 'fx-particle-burst-container';
        container.style.cssText = `
            position: absolute;
            left: 50%; top: 50%;
            width: 0px; height: 0px;
            overflow: visible;
            pointer-events: none;
            z-index: 12;
        `;
        card.appendChild(container);
    } else {
        // Fall back to shared fxLayer
        container = fxLayer(card);
    }

    /* --- Create Overlay Canvas --- */
    const canvas = document.createElement('canvas');
    const size = Math.ceil(maxR * 2.4);
    canvas.width = size;
    canvas.height = size;

    canvas.style.cssText = `
        position: absolute;
        left: 50%; top: 50%;
        width: ${size}px; height: ${size}px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10;
        mix-blend-mode: screen;
        animation: none !important;
        transition: none !important;
    `;

    const ctx = canvas.getContext('2d');
    const center = size / 2;
    container.appendChild(canvas);

    /* --- Generate Random Spec Parameters --- */
    const numParticles = Array.isArray(count)
        ? Math.floor(count[0] + Math.random() * (count[1] - count[0] + 1))
        : count;

    const particles = [];
    for (let i = 0; i < numParticles; i++) {
        const radiusNorm = minRadiusRatio + (maxRadiusRatio - minRadiusRatio) * Math.pow(Math.random(), 1 / biasPower);
        const spawnR = radiusNorm * maxR;
        const angle = Math.random() * Math.PI * 2;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const perpX = -sinA;
        const perpY = cosA;

        const pLifeRatio = minLife + Math.random() * (maxLife - minLife);
        const pDuration = duration * pLifeRatio;

        particles.push({
            x: center + cosA * spawnR,
            y: center + sinA * spawnR,
            cosA,
            sinA,
            perpX,
            perpY,
            size: (minSize + Math.random() * (maxSize - minSize)) * u,
            speed: (speed[0] + Math.random() * (speed[1] - speed[0])) * u,
            wigglePhase: Math.random() * Math.PI * 2,
            wFreq: wiggleFreq[0] + Math.random() * (wiggleFreq[1] - wiggleFreq[0]),
            wAmp: (wiggleAmp[0] + Math.random() * (wiggleAmp[1] - wiggleAmp[0])) * u,
            duration: pDuration,
            color: colors[Math.floor(Math.random() * colors.length)],
            flickerPhase: Math.random() * Math.PI * 2,
            fFreq: flickerFreq[0] + Math.random() * (flickerFreq[1] - flickerFreq[0])
        });
    }

    /* --- Animation Loop --- */
    return new Promise((resolve) => {
        const startTime = performance.now();

        function render(now) {
            const elapsed = now - startTime;
            ctx.clearRect(0, 0, size, size);

            let activeCount = 0;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (elapsed >= p.duration) continue;

                activeCount++;
                const progress = elapsed / p.duration;

                const currentDist = p.speed * (elapsed / 16.666);
                let px = p.x + p.cosA * currentDist;
                let py = p.y + p.sinA * currentDist;

                const wiggle = Math.sin(elapsed * p.wFreq + p.wigglePhase) * p.wAmp;
                px += p.perpX * wiggle;
                py += p.perpY * wiggle;

                const envelope = Math.sin(progress * Math.PI);
                const flicker = 0.4 + 0.6 * Math.abs(Math.sin(elapsed * p.fFreq + p.flickerPhase));
                const alpha = Math.min(peakOpacity, envelope * flicker * peakOpacity);

                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(px, py, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }

            if (elapsed < duration && activeCount > 0) {
                requestAnimationFrame(render);
            } else {
                canvas.remove();
                if (standalone && container && container.parentNode) {
                    container.remove();
                }
                resolve();
            }
        }

        requestAnimationFrame(render);
    });
}

/* ===================== LENS FLARE =====================
 * flare (mix-blend-mode: screen)
 *   ├─ spokeContainer  applies STATIC outer tip feathering mask
 *   │   └─ spokesEl    128 thin rays, rotates + scales (0.33 -> 1), applies EXPANDING hole mask
 *   └─ glow            blurred wrapper holding 3 colored orbs
 * ===================================================================== */
function fxPrismaFlare(card, o = {}) {
    if (!card) return Promise.resolve();
    fxEnsureStyles();

    const {
        spokes = 128,
        spokeWidth = 3,                                      // px at 384
        spokeLength = 1.1,                                   // length multiplier
        reach = 0.95,                                       // flare radius as fraction of card width
        spin = 16,                                          // degrees turn
        duration = 1200,                                    // TOTAL animation duration in ms
        peak = 0.9,
        colors = ['#fff4bb', '#3af0ff', '#3a5cff'],   // inner -> outer
        growth = [1.5, 1.5, 1.8],                            // end scale per orb
        stagger = 45,                                        // base ms stagger
        blur = 14,                                           // px at 384
        hole = { size: 0.85, feather: 15 },                  // hole max size & feather
        edgeFeatherPct = 10,                                 // outer edge feather

        // Particle controls
        particles = true,
        particleConfig = {}
    } = o;

    const animDur = Math.max(10, Number(duration) || 1200);
    const cw = card.offsetWidth;
    const u = cw / 384;
    const R = cw * reach * spokeLength;

    /* --- Root Flare Container --- */
    const flare = fxMk('fx-flare');
    const diam = R * 2;
    flare.style.cssText = `
        position: absolute;
        left: 50%; top: 50%;
        width: ${diam}px; height: ${diam}px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        animation: none !important;
        transition: none !important;
    `;

    /* =========================================================================
     * 1. CONTAINER WITH STATIC OUTER SCATTER MASK
     * ========================================================================= */
    const spokeContainer = fxMk('fx-spoke-container');
    const staticEdgeStart = 50 - ((edgeFeatherPct / 100) * 50);
    const outerScatterMask = `radial-gradient(circle at 50% 50%, black 0%, black ${staticEdgeStart.toFixed(2)}%, transparent 50%)`;

    spokeContainer.style.cssText = `
        position: absolute; width: 100%; height: 100%;
        left: 0; top: 0;
        mix-blend-mode: screen;
        mask-image: ${outerScatterMask};
        -webkit-mask-image: ${outerScatterMask};
        animation: none !important;
        transition: none !important;
    `;

    /* =========================================================================
     * 2. SCALING SPOKE WHEEL WITH EXPANDING HOLE MASK
     * ========================================================================= */
    const spokesEl = fxMk('fx-spokes');
    spokesEl.style.cssText = `
        position: absolute; width: 100%; height: 100%;
        left: 0; top: 0;
        transform-origin: 50% 50%;
        animation: none !important;
        transition: none !important;
    `;

    const sw = spokeWidth * u;
    for (let i = 0; i < spokes; i++) {
        const s = fxMk('fx-spoke');
        const angle = (i * 360) / spokes;
        s.style.cssText = `
            position: absolute;
            width: ${sw}px;
            height: ${R}px;
            left: calc(50% - ${sw / 2}px);
            top: 50%;
            transform-origin: 50% 0%;
            transform: rotate(${angle.toFixed(3)}deg);
        `;
        spokesEl.appendChild(s);
    }

    spokeContainer.appendChild(spokesEl);

    /* =========================================================================
     * 3. IRIDESCENT SCATTER GLOW LAYER
     * ========================================================================= */
    const glow = fxMk('fx-glow');
    glow.style.cssText = `
        position: absolute; width: 100%; height: 100%;
        left: 0; top: 0;
        filter: blur(${blur * u}px);
        mix-blend-mode: screen;
        animation: none !important;
        transition: none !important;
    `;

    const orbDiam = R * 0.8;
    const orbs = colors.map(c => {
        const e = fxMk('fx-orb');
        e.style.cssText = `
            position: absolute;
            left: 50%; top: 50%;
            width: ${orbDiam}px;
            height: ${orbDiam}px;
            border-radius: 50%;
            background: radial-gradient(circle, ${c} 0%, ${c} 30%, transparent 70%);
            transform: translate(-50%, -50%) scale(0.1);
            animation: none !important;
            transition: none !important;
        `;
        return e;
    });
    [...orbs].reverse().forEach(e => glow.appendChild(e));

    flare.append(spokeContainer, glow);
    fxLayer(card).appendChild(flare);

    /* =========================================================================
     * ANIMATIONS
     * ========================================================================= */
    const anims = [];

    // 1. Spokes Scale & Spin
    const spinMid = spin * 0.4;
    anims.push(spokesEl.animate([
        { transform: 'scale(0.33) rotate(0deg)', opacity: 0 },
        { transform: `scale(0.58) rotate(${spinMid.toFixed(2)}deg)`, opacity: peak, offset: 0.4 },
        { transform: `scale(1.0) rotate(${spin}deg)`, opacity: 0 }
    ], {
        duration: animDur,
        easing: 'cubic-bezier(.25, .8, .25, 1)',
        fill: 'both'
    }));

    // 2. Expanding Center Hole Mask
    const f = (hole.feather / 100) * 50;
    const maxHolePct = hole.size * 50;

    const makeHoleMask = (currentHolePct) => {
        const innerHole = Math.max(0, currentHolePct - f);
        const outerHole = currentHolePct + f;
        return `radial-gradient(circle at 50% 50%, transparent ${innerHole.toFixed(2)}%, black ${outerHole.toFixed(2)}%)`;
    };

    const initialMask = makeHoleMask(0);
    const midMask = makeHoleMask(maxHolePct * 0.35);
    const endMask = makeHoleMask(maxHolePct);

    anims.push(spokesEl.animate([
        { maskImage: initialMask, WebkitMaskImage: initialMask },
        { maskImage: midMask, WebkitMaskImage: midMask, offset: 0.4 },
        { maskImage: endMask, WebkitMaskImage: endMask }
    ], {
        duration: animDur,
        easing: 'cubic-bezier(.25, .8, .25, 1)',
        fill: 'both'
    }));

    // 3. Orbs Growth
    const dynamicStagger = (stagger / 900) * animDur;
    orbs.forEach((e, i) => {
        const g = growth[i] ?? growth[growth.length - 1];
        const halfG = g * 0.5;
        const orbPeak = peak * 0.85;

        anims.push(e.animate([
            { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
            { transform: `translate(-50%,-50%) scale(${halfG.toFixed(2)})`, opacity: orbPeak, offset: 0.25 },
            { transform: `translate(-50%,-50%) scale(${g.toFixed(2)})`, opacity: 0 }
        ], {
            duration: animDur,
            delay: i * dynamicStagger,
            easing: 'cubic-bezier(.15,.7,.25,1)',
            fill: 'both'
        }));
    });

    // 4. Standalone Particle Call Inside Flare Lifecycle
    let particlePromise = Promise.resolve();
    if (particles) {
        particlePromise = fxParticleBurst(card, {
            duration: animDur * 1.1,
            colors: ['#ffffff', ...colors],
            reach,
            ...particleConfig
        });
    }

    return Promise.allSettled([
        ...anims.map(a => a.finished),
        particlePromise
    ]).then(() => flare.remove());
}
/* ===================== LENS FLARE FAMILY =====================
 *   fxLensFlare(card, opts)        spoke wheel + iridescent orbs + particles, with a keyed aperture hole
 *   fxOpticalFlare(card, opts)     soft, lens-like: fat soft spokes, warm orbs, halo ring, ghost discs
 *   fxAnamorphicFlare(card, opts)  horizontal blue streak (cinema anamorphic)
 *
 * Depends on your existing helpers: fxEnsureStyles, fxMk, fxLayer, fxParticleBurst.
 *
 * ---------------------------------------------------------------------
 * APERTURE (the hole that masks the spokes from the centre)
 *
 *   hole: {
 *     size:     0.6,     // max hole radius as a FRACTION OF THE FLARE RADIUS (0..1). 0 = no hole at all.
 *     feather:  10,      // soft edge width, in % of the flare radius
 *     glow:     false,   // true = also cut the centre out of the blurred orb glow (otherwise it fills the hole)
 *     easing:   'cubic-bezier(.25,.8,.25,1)',   // default easing for every segment
 *   The hole is in SCREEN space (fraction of the full flare radius); it does not scale with the spoke wheel.
 *     aperture: [[0, 0], [0.4, 0.35], [1, 1]]   // [lifetimeRatio, openRatio, optionalSegmentEasing]
 *   }
 *
 *   lifetimeRatio: 0..1 of `duration`.  openRatio: 0 = fully closed (no hole), 1 = hole at `size`.
 *   Values may go down as well as up, so an iris can open and close again:
 *     aperture: [[0, 0], [0.3, 1], [1, 0.2]]
 *     aperture: [[0, 1], [1, 0]]                       // starts wide open, irises shut
 *     aperture: [[0, 0], [0.5, 0.2, 'ease-in'], [1, 1]] // per-segment easing as the 3rd value
 * ===================================================================== */

/* --- animatable --fx-hole property (gradients themselves can't be interpolated) --- */
function _fxRegisterHoleProp() {
    if (_fxRegisterHoleProp.ok !== undefined) return _fxRegisterHoleProp.ok;
    if (!window.CSS || !CSS.registerProperty) return (_fxRegisterHoleProp.ok = false);
    try {
        CSS.registerProperty({ name: '--fx-hole', syntax: '<number>', inherits: false, initialValue: '0' });
        _fxRegisterHoleProp.ok = true;
    } catch (e) {
        _fxRegisterHoleProp.ok = (e && e.name === 'InvalidModificationError'); // already registered = fine
    }
    return _fxRegisterHoleProp.ok;
}

function _fxNormAperture(a) {
    let keys = (Array.isArray(a) && a.length ? a : [[0, 0], [0.4, 0.35], [1, 1]])
        .map(k => Array.isArray(k) ? { t: k[0], r: k[1], e: k[2] } : k)
        .map(k => ({ t: Math.min(1, Math.max(0, k.t)), r: Math.min(1, Math.max(0, k.r)), e: k.e }))
        .sort((x, y) => x.t - y.t);
    if (keys[0].t > 0) keys.unshift({ t: 0, r: keys[0].r });
    const last = keys[keys.length - 1];
    if (last.t < 1) keys.push({ t: 1, r: last.r });
    return keys;
}

function _fxApertureAt(keys, p) {            // linear sample, used only by the no-registerProperty fallback
    for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i], b = keys[i + 1];
        if (p <= b.t) return b.t === a.t ? b.r : a.r + (b.r - a.r) * ((p - a.t) / (b.t - a.t));
    }
    return keys[keys.length - 1].r;
}

/* Builds the hole mask and returns the animation(s) driving it. */
function _fxApplyAperture(el, hole, animDur) {
    const size = Math.max(0, hole.size ?? 0.6) * 100;      // % of flare radius
    if (size <= 0) return { anims: [], stop() { } };
    const feather = Math.max(0.01, hole.feather ?? 10);
    const keys = _fxNormAperture(hole.aperture);
    const easing = hole.easing || 'cubic-bezier(.25,.8,.25,1)';

    // centre of the feather band: -feather (fully closed) .. size (fully open)
    const centerAt = r => -feather + r * (size + feather);

    if (_fxRegisterHoleProp()) {
        const mask = `radial-gradient(circle closest-side at 50% 50%, ` +
            `transparent calc((var(--fx-hole) - ${feather}) * 1%), black calc((var(--fx-hole) + ${feather}) * 1%))`;
        el.style.maskImage = mask;
        el.style.webkitMaskImage = mask;
        el.style.setProperty('--fx-hole', centerAt(keys[0].r).toFixed(3));
        const anim = el.animate(
            keys.map(k => ({ '--fx-hole': centerAt(k.r).toFixed(3), offset: k.t, easing: k.e || easing })),
            { duration: animDur, fill: 'both' }
        );
        return { anims: [anim], stop() { } };
    }

    // Fallback: per-frame mask update
    let raf = 0, alive = true;
    const t0 = performance.now();
    const apply = r => {
        const c = centerAt(r);
        const m = `radial-gradient(circle closest-side at 50% 50%, transparent ${(c - feather).toFixed(2)}%, black ${(c + feather).toFixed(2)}%)`;
        el.style.maskImage = m; el.style.webkitMaskImage = m;
    };
    const done = new Promise(res => {
        const tick = now => {
            if (!alive) return res();
            const p = Math.min(1, (now - t0) / animDur);
            apply(_fxApertureAt(keys, p));
            if (p < 1) raf = requestAnimationFrame(tick); else res();
        };
        raf = requestAnimationFrame(tick);
    });
    return { anims: [{ finished: done }], stop() { alive = false; cancelAnimationFrame(raf); } };
}

/* ===================== LENS FLARE ===================== */
function fxLensFlare(card, o = {}) {
    if (!card) return Promise.resolve();
    fxEnsureStyles();

    const {
        spokes = 128,
        spokeWidth = 2,                                      // px at 384
        spokeLength = 1.3,                                   // length multiplier
        reach = 0.95,                                        // flare radius as fraction of card width
        spin = 16,                                           // degrees turn
        duration = 1700,                                     // TOTAL animation duration in ms
        peak = 0.9,
        colors = ['#fff4bb', '#3af0ff', '#3a5cff'],          // inner -> outer
        growth = [1.5, 1.5, 1.8],                            // end scale per orb
        stagger = 45,                                        // base ms stagger
        blur = 14,                                           // px at 384
        edgeFeatherPct = 10,                                 // outer edge feather
        hole: holeOpt = {},                                  // see APERTURE notes at top of file

        particles = true,
        particleConfig = {}
    } = o;

    const hole = { size: 1.2, feather: 5, aperture: [[0, 0.25], [0.4, 0.5], [1, 1]], glow: false, ...holeOpt };

    const animDur = Math.max(10, Number(duration) || 1200);
    const cw = card.offsetWidth;
    const u = cw / 384;
    const R = cw * reach * spokeLength;

    /* --- Root --- */
    const flare = fxMk('fx-flare');
    const diam = R * 2;
    flare.style.cssText = `
        position: absolute;
        left: 50%; top: 50%;
        width: ${diam}px; height: ${diam}px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        animation: none !important;
        transition: none !important;
    `;

    /* --- 1. Container with STATIC outer scatter mask --- */
    const spokeContainer = fxMk('fx-spoke-container');
    const staticEdgeStart = 50 - ((edgeFeatherPct / 100) * 50);
    const outerScatterMask = `radial-gradient(circle at 50% 50%, black 0%, black ${staticEdgeStart.toFixed(2)}%, transparent 50%)`;
    spokeContainer.style.cssText = `
        position: absolute; width: 100%; height: 100%;
        left: 0; top: 0;
        mix-blend-mode: screen;
        mask-image: ${outerScatterMask};
        -webkit-mask-image: ${outerScatterMask};
        animation: none !important;
        transition: none !important;
    `;

    /* --- 2. Spoke wheel (scales + spins) carrying the aperture mask --- */
    const spokesEl = fxMk('fx-spokes');
    spokesEl.style.cssText = `
        position: absolute; width: 100%; height: 100%;
        left: 0; top: 0;
        transform-origin: 50% 50%;
        animation: none !important;
        transition: none !important;
    `;

    const sw = spokeWidth * u;
    for (let i = 0; i < spokes; i++) {
        const s = fxMk('fx-spoke');
        const angle = (i * 360) / spokes;
        s.style.cssText = `
            position: absolute;
            width: ${sw}px;
            height: ${R}px;
            left: calc(50% - ${sw / 2}px);
            top: 50%;
            transform-origin: 50% 0%;
            transform: rotate(${angle.toFixed(3)}deg);
        `;
        spokesEl.appendChild(s);
    }
    // The aperture mask lives on this NON-scaling wrapper, so the hole is a fixed fraction of the
    // flare radius in screen space (it no longer shrinks with the 0.33 -> 1 wheel scale).
    const holeEl = fxMk('fx-spoke-hole');
    holeEl.style.cssText = `position: absolute; inset: 0; animation: none !important; transition: none !important;`;
    holeEl.appendChild(spokesEl);
    spokeContainer.appendChild(holeEl);

    /* --- 3. Iridescent glow --- */
    const glow = fxMk('fx-glow');
    glow.style.cssText = `
        position: absolute; width: 100%; height: 100%;
        left: 0; top: 0;
        filter: blur(${blur * u}px);
        mix-blend-mode: screen;
        animation: none !important;
        transition: none !important;
    `;
    const orbDiam = R * 0.8;
    const orbs = colors.map(c => {
        const e = fxMk('fx-orb');
        e.style.cssText = `
            position: absolute;
            left: 50%; top: 50%;
            width: ${orbDiam}px;
            height: ${orbDiam}px;
            border-radius: 50%;
            background: radial-gradient(circle, ${c} 0%, ${c} 30%, transparent 70%);
            transform: translate(-50%, -50%) scale(0.1);
            animation: none !important;
            transition: none !important;
        `;
        return e;
    });
    [...orbs].reverse().forEach(e => glow.appendChild(e));

    flare.append(spokeContainer, glow);
    fxLayer(card).appendChild(flare);

    /* --- Animations --- */
    const anims = [];

    // spokes: scale + spin + fade
    const spinMid = spin * 0.4;
    anims.push(spokesEl.animate([
        { transform: 'scale(0.33) rotate(0deg)', opacity: 0 },
        { transform: `scale(0.58) rotate(${spinMid.toFixed(2)}deg)`, opacity: peak, offset: 0.4 },
        { transform: `scale(1.0) rotate(${spin}deg)`, opacity: 0 }
    ], { duration: animDur, easing: 'cubic-bezier(.25, .8, .25, 1)', fill: 'both' }));

    // aperture hole (keyed over lifetime); hole.glow = true also cuts the centre out of the orb glow
    const ap = _fxApplyAperture(holeEl, hole, animDur);
    anims.push(...ap.anims);
    const apGlow = hole.glow ? _fxApplyAperture(glow, hole, animDur) : { anims: [], stop() { } };
    anims.push(...apGlow.anims);

    // orbs
    const dynamicStagger = (stagger / 900) * animDur;
    orbs.forEach((e, i) => {
        const g = growth[i] ?? growth[growth.length - 1];
        const orbPeak = peak * 0.85;
        anims.push(e.animate([
            { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
            { transform: `translate(-50%,-50%) scale(${(g * 0.5).toFixed(2)})`, opacity: orbPeak, offset: 0.25 },
            { transform: `translate(-50%,-50%) scale(${g.toFixed(2)})`, opacity: 0 }
        ], { duration: animDur, delay: i * dynamicStagger, easing: 'cubic-bezier(.15,.7,.25,1)', fill: 'both' }));
    });

    // particles
    let particlePromise = Promise.resolve();
    if (particles) {
        particlePromise = fxParticleBurst(card, {
            duration: animDur * 1.1,
            colors: ['#ffffff', ...colors],
            reach,
            ...particleConfig
        });
    }

    return Promise.allSettled([...anims.map(a => a.finished), particlePromise])
        .then(() => { ap.stop(); apGlow.stop(); flare.remove(); });
}

/* ---- small shared helpers for the variants ---- */
function _fxRgba(c, a) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) return c;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function _fxFrac(x) { return x - Math.floor(x); }

/* ===================== OPTICAL FLARE =====================
 * Glass-lens flare: the same spoke burst as fxLensFlare, plus a halo ring and a chain of ghosts.
 * The ring and the ghosts share ONE axis and ONE timeline with the spokes (same scale curve, same
 * easing, same spin), so they read as parts of a single optical system instead of separate effects.
 *
 *   axis         angle (deg) of the ghost chain and of the ring's offset
 *   ghosts       number of ghosts in the chain
 *   depth        0..1 faux 3D. 0 = flat (all ghosts alike). 1 = strong parallax: "near" ghosts are bigger,
 *                sharper, brighter and slide further along the axis; "far" ghosts are small and soft
 *   ringRatio    ring radius as a ratio of the visible spoke-tip radius (1 = ring rides exactly on the tips)
 *   ringOffset   slides the ring centre along the axis, as a fraction of R (faux perspective; depth boosts it)
 *   chainSpread  how far the ghost chain reaches from the centre, as a fraction of R
 *   drift        how far ghosts slide along the axis over the lifetime (nearer ghosts slide further)
 *   lockSpin     1 = chain + ring rotate with the spokes' spin, 0 = fixed axis
 *   ghostShapes  shapes cycled across the chain: 'ring' | 'disc' | 'hex'
 *   ringColor, ringFringe (the dispersion fringe offset behind the ring), ghostColors
 * Anything else is passed through to fxLensFlare (spokes, hole, colors, spin, ...).
 */
function fxOpticalFlare(card, o = {}) {
    if (!card) return Promise.resolve();
    fxEnsureStyles();

    const {
        ringColor = '#9be8ff',
        ringFringe = '#ff9a6b',
        ghosts = 6,
        axis = 35,
        depth = 0.6,
        ringRatio = 1,
        ringOffset = 0.18,
        chainSpread = 0.95,
        drift = 0.35,
        lockSpin = 1,
        ghostShapes = ['ring', 'disc', 'hex', 'disc', 'ring'],
        ghostColors = ['#7fb8ff', '#ffd27a', '#ff7aa8', '#7affc8', '#b08cff'],
        ...rest
    } = o;

    const duration = Math.max(10, Number(rest.duration) || 1400);
    const reach = rest.reach ?? 0.95;
    const spin = rest.spin ?? 8;
    const spokeLength = rest.spokeLength ?? 0.9;
    const peak = rest.peak ?? 0.8;
    const cw = card.offsetWidth;
    const u = cw / 384;
    const R = cw * reach * spokeLength;
    const D = Math.min(1, Math.max(0, depth));
    const tipR = R * 0.68;                       // spokes fade out at ~68% of R (the static outer mask)
    const EASE = 'cubic-bezier(.25, .8, .25, 1)'; // same curve as the spoke wheel

    const base = fxLensFlare(card, {
        spokes: 84, spokeWidth: 6, spokeLength, blur: 16, peak, spin,
        colors: ['#fffbe0', '#ffd27a', '#ff6a3a'],
        growth: [1.3, 1.6, 2.0],
        duration,
        ...rest,
        particles: false,
        hole: { size: 1.4, feather: 18, aperture: [[0, 0.3], [0.5, 0.55], [1, 1]], ...(rest.hole || {}) }
    });

    const root = fxMk('fx-optical-extras');
    root.style.cssText = `
        position: absolute; left: 50%; top: 50%; width: 0; height: 0;
        pointer-events: none; mix-blend-mode: screen; isolation: isolate;
        animation: none !important; transition: none !important;
    `;
    // the rig carries the axis angle and rotates with the spokes' spin
    const rig = fxMk('fx-optical-rig');
    rig.style.cssText = `position: absolute; left: 0; top: 0; width: 0; height: 0; transform: rotate(${axis}deg);`;
    root.appendChild(rig);

    const anims = [];
    const sp = spin * (lockSpin ? 1 : 0);
    anims.push(rig.animate([
        { transform: `rotate(${axis}deg)` },
        { transform: `rotate(${(axis + sp * 0.4).toFixed(2)}deg)`, offset: 0.4 },
        { transform: `rotate(${(axis + sp).toFixed(2)}deg)` }
    ], { duration, easing: EASE, fill: 'both' }));

    /* --- ring(s): ride the spoke tips, scale on the spokes' own 0.33 -> 0.58 -> 1 curve --- */
    const ringOff = ringOffset * R * (0.4 + 0.6 * D);
    const mkRing = (cls, color, bw, glowPx, opMul, extraX, ratio) => {
        const dia = 2 * tipR * ratio;
        const el = fxMk(cls);
        el.style.cssText = `
            position: absolute; left: ${-dia / 2}px; top: ${-dia / 2}px; width: ${dia}px; height: ${dia}px;
            border-radius: 50%; box-sizing: border-box; border: ${bw}px solid ${color};
            box-shadow: 0 0 ${glowPx}px ${color}, inset 0 0 ${glowPx * 1.4}px ${color};
            opacity: 0; transform: scale(0.33);
        `;
        rig.appendChild(el);
        const x = ringOff + extraX;
        anims.push(el.animate([
            { transform: `translateX(${(x * 0.33).toFixed(1)}px) scale(0.33)`, opacity: 0 },
            { transform: `translateX(${(x * 0.58).toFixed(1)}px) scale(0.58)`, opacity: peak * opMul, offset: 0.4 },
            { transform: `translateX(${x.toFixed(1)}px) scale(1)`, opacity: 0 }
        ], { duration, easing: EASE, fill: 'both' }));
    };
    mkRing('fx-optical-ring', ringColor, Math.max(1.5, 3 * u), 12 * u, 0.9, 0, ringRatio);
    mkRing('fx-optical-ring2', ringFringe, Math.max(1, 1.6 * u), 6 * u, 0.55, 5 * u * (0.3 + D), ringRatio * 1.035);

    /* --- ghost chain --- */
    const chainR = R * chainSpread;
    for (let i = 0; i < ghosts; i++) {
        const t = ghosts === 1 ? 0.5 : i / (ghosts - 1);
        let k = -1 + 2 * t;
        if (Math.abs(k) < 0.2) k = (k < 0 ? -1 : 1) * 0.2;           // keep ghosts off the hot centre
        const z = _fxFrac(i * 0.6180339 + 0.21);                      // per-ghost depth seed
        const nz = D * z + (1 - D) * 0.5;                             // nearness: 0.5 everywhere when flat
        const gd = (16 + ((i * 11) % 5) * 10) * u * (1 + (nz - 0.5) * 1.6);
        const blurPx = (1 + (1 - nz) * 3 * D) * u;
        const m0 = 1 - drift * nz, m1 = 1 + drift * nz * 0.6;         // slide start/end multipliers
        const x = k * chainR;
        const perp = (z - 0.5) * D * R * 0.14;                        // off-axis parallax
        const op = 0.35 + 0.35 * nz;
        const c = ghostColors[i % ghostColors.length];
        const shape = ghostShapes[i % ghostShapes.length];

        const g = fxMk('fx-optical-ghost');
        let look;
        if (shape === 'ring') {
            look = `border: ${Math.max(1, 1.6 * u)}px solid ${c}; background: ${_fxRgba(c, 0.12)};
                    box-shadow: 0 0 ${6 * u}px ${_fxRgba(c, 0.8)}; border-radius: 50%; filter: blur(${blurPx}px);`;
        } else if (shape === 'hex') {
            look = `background: linear-gradient(135deg, ${_fxRgba(c, 0.85)}, ${_fxRgba(c, 0.25)});
                    clip-path: polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%);`;
        } else {
            look = `border-radius: 50%; filter: blur(${blurPx}px);
                    background: radial-gradient(circle, ${c} 0%, ${c} 35%, transparent 72%);`;
        }
        g.style.cssText = `
            position: absolute; left: ${-gd / 2}px; top: ${-gd / 2}px; width: ${gd}px; height: ${gd}px;
            box-sizing: border-box; opacity: 0; ${look}
        `;
        rig.appendChild(g);

        const pos = m => `translate(${(x * m).toFixed(1)}px, ${(perp * m).toFixed(1)}px)`;
        anims.push(g.animate([
            { transform: `${pos(m0)} scale(0.2)`, opacity: 0 },
            { transform: `${pos((m0 + m1) / 2)} scale(1)`, opacity: op, offset: 0.3 },
            { transform: `${pos(m1)} scale(1.25)`, opacity: 0 }
        ], { duration: duration * 0.9, delay: i * duration * 0.04, easing: 'ease-out', fill: 'both' }));
    }

    fxLayer(card).appendChild(root);

    const particlePromise = (rest.particles ?? true)
        ? fxParticleBurst(card, { duration: duration * 1.1, colors: ['#ffffff', '#ffd27a', ringColor], reach, ...(rest.particleConfig || {}) })
        : Promise.resolve();

    return Promise.allSettled([base, particlePromise, ...anims.map(a => a.finished)])
        .then(() => root.remove());
}

/* ===================== ANAMORPHIC FLARE =====================
 * Crisp cinema anamorphic: one long thin bar, plus squares / rectangles strung along it that
 * blend with COLOR-DODGE, so wherever a rectangle overlaps the bar (or another rectangle) it flares hot.
 *
 *   angle       rotation of the whole rig in degrees (0 = horizontal)
 *   length      half-length of the bar as a fraction of card width
 *   thickness   bar body height in px at 384 (a crisp-edged rectangle; the squares dodge against it)
 *   rects       number of squares/rectangles
 *   rectSize    size multiplier for the rectangles
 *   rectSpread  how far along the bar they reach (fraction of the half-length)
 *   rectColors  colours cycled across the rectangles
 *   depth       0..1 faux 3D: near rects are bigger/brighter and slide further, far ones smaller/dimmer
 *   drift       how far rects slide along the bar over the lifetime (nearer ones slide further)
 *   blend       blend mode for the rectangles ('color-dodge' by default)
 *   glow        0..1 strength of the faint wide halo behind the bar (0 = none, the crispest look)
 *   blur        px blur on the bar/lines (kept tiny so edges stay sharp)
 *   spread      [[lifetimeRatio, scaleX], ...] keys for how far the bar has extended
 *   lines       extra thin offset lines above/below the bar
 */
function fxAnamorphicFlare(card, o = {}) {
    if (!card) return Promise.resolve();
    fxEnsureStyles();

    const {
        duration = 1100,
        angle = 0,
        length = 1.1,
        thickness = 16,
        color = '#3d8bff',
        core = '#e8f6ff',
        peak = 0.95,
        blur = 0.5,
        glow = 0.2,
        spread = [[0, 0.05], [0.28, 1], [1, 1.1]],
        lines = 2,
        rects = 7,
        rectSize = 1,
        rectSpread = 0.6,
        rectColors = ['#3d8bff', '#2fe3ff', '#3dc2ff', '#7b6bff', '#bfe9ff'],
        depth = 0.6,
        drift = 0.4,
        blend = 'color-dodge',
        particles = false,
        particleConfig = {}
    } = o;

    const animDur = Math.max(10, Number(duration) || 1100);
    const cw = card.offsetWidth;
    const u = cw / 384;
    const half = cw * length;
    const W = half * 2;
    const H = thickness * u;
    const D = Math.min(1, Math.max(0, depth));

    const root = fxMk('fx-anamorphic');
    root.style.cssText = `
        position: absolute; left: 50%; top: 50%; width: 0; height: 0;
        pointer-events: none; mix-blend-mode: screen; isolation: isolate;
        animation: none !important; transition: none !important;
    `;
    const rig = fxMk('fx-anamorphic-rig');
    rig.style.cssText = `position: absolute; left: 0; top: 0; width: 0; height: 0; transform: rotate(${angle}deg);`;
    root.appendChild(rig);

    const anims = [];
    const env = pk => [
        { opacity: 0, offset: 0 }, { opacity: pk, offset: 0.14 },
        { opacity: pk * 0.85, offset: 0.55 }, { opacity: 0, offset: 1 }
    ];
    const barScale = (() => {
        const f = spread.slice().sort((a, b) => a[0] - b[0]).map(k => ({
            transform: `scaleX(${k[1]})`, offset: Math.min(1, Math.max(0, k[0])), easing: k[2] || 'cubic-bezier(.2,.8,.25,1)'
        }));
        if (f[0].offset > 0) f.unshift({ ...f[0], offset: 0 });
        if (f[f.length - 1].offset < 1) f.push({ ...f[f.length - 1], offset: 1 });
        return f;
    })();
    const mkBar = (w, h, y, bg, extra, pk) => {
        const s = fxMk('fx-streak');
        s.style.cssText = `
            position: absolute; left: ${-w / 2}px; top: ${y - h / 2}px; width: ${w}px; height: ${h}px;
            background: ${bg}; transform: scaleX(0.05); opacity: 0; transform-origin: 50% 50%; ${extra}
        `;
        rig.appendChild(s);
        anims.push(s.animate(barScale, { duration: animDur, fill: 'both' }));
        anims.push(s.animate(env(pk), { duration: animDur, fill: 'both' }));
        return s;
    };
    const endFade = 'mask-image: linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%); -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%);';

    // faint wide halo (optional, off the crisp path)
    if (glow > 0) {
        mkBar(W, H * 4, 0,
            `radial-gradient(ellipse closest-side at 50% 50%, ${_fxRgba(color, 0.9)} 0%, ${_fxRgba(color, 0.25)} 45%, transparent 100%)`,
            `filter: blur(${5 * u}px);`, peak * glow);
    }
    // the long bar: a crisp-edged rectangular BODY (mid-tone, so colour-dodge has something to flare against)
    // with only the two ends feathered, plus a thin hot core line on top
    mkBar(W, H, 0,
        `linear-gradient(180deg, ${_fxRgba(color, 0.35)} 0%, ${_fxRgba(color, 0.6)} 18%, ${_fxRgba(color, 0.6)} 82%, ${_fxRgba(color, 0.35)} 100%)`,
        `filter: blur(${blur * u}px); ${endFade}`, peak);
    mkBar(W * 0.96, Math.max(1.5, 2 * u), 0,
        `linear-gradient(90deg, transparent 0%, ${core} 10%, ${core} 90%, transparent 100%)`,
        `filter: blur(${blur * u}px);`, peak);
    // thin extra lines
    for (let i = 0; i < lines; i++) {
        const dir = i % 2 ? 1 : -1;
        const y = dir * (H * 0.9 + Math.floor(i / 2) * 6 * u);
        mkBar(W * (0.72 - 0.14 * Math.floor(i / 2)), Math.max(1, 1.2 * u), y,
            `linear-gradient(90deg, transparent 0%, ${color} 30%, ${core} 50%, ${color} 70%, transparent 100%)`,
            `filter: blur(${0.3 * u}px);`, peak * 0.8);
    }

    // squares / rectangles: colour-dodge, so overlaps with the bar and with each other flare hot
    const ASPECT = [.1, 0.4, 1, 0.3, .2, 0.15, .1];
    for (let i = 0; i < rects; i++) {
        const t = rects === 1 ? 0.5 : i / (rects - 1);
        let k = -1 + 2 * t;
        k = Math.sign(k || 1) * Math.pow(Math.abs(k), 1.7);              // cluster toward the centre so they overlap
        if (Math.abs(k) < 0.06) k = 0.06 * (i % 2 ? 1 : -1);
        const z = _fxFrac(i * 0.7548776 + 0.3);
        const nz = D * z + (1 - D) * 0.5;
        const asp = ASPECT[i % ASPECT.length];
        const w = (48 + _fxFrac(i * 0.5698 + 0.11) * 70) * u * rectSize * (1 + (nz - 0.5) * 1.2);
        const h = w * asp;
        const x = k * half * rectSpread;
        const y = (z - 0.5) * D * H * 1.6;                               // straddles the bar so every rect overlaps it
        const m0 = 1 - drift * nz, m1 = 1 + drift * nz * 0.6;
        const c = rectColors[i % rectColors.length];
        const op = 0.65 + 0.3 * nz;

        const r = fxMk('fx-anamorphic-rect');
        r.style.cssText = `
            position: absolute; left: ${-w / 2}px; top: ${-h / 2}px; width: ${w}px; height: ${h}px;
            box-sizing: border-box; mix-blend-mode: ${blend}; opacity: 0;
            background: linear-gradient(90deg, ${_fxRgba(c, 0.75)}, ${_fxRgba(c, 0.4)});
            border: ${Math.max(0, u)}px solid ${_fxRgba(c, 0.9)};
        `;
        rig.appendChild(r);
        const pos = m => `translate(${(x * m).toFixed(1)}px, ${(y * m).toFixed(1)}px)`;
        anims.push(r.animate([
            { transform: `${pos(m0)} scale(0.35)`, opacity: 0 },
            { transform: `${pos((m0 + m1) / 2)} scale(1)`, opacity: op, offset: 0.3 },
            { transform: `${pos(m1)} scale(1.15)`, opacity: 0 }
        ], { duration: animDur * 0.95, delay: i * animDur * 0.03, easing: 'ease-out', fill: 'both' }));
    }

    // centre flash: a small crisp square, colour-dodged into the bar
    const fs = H * 2.4;
    const flash = fxMk('fx-anamorphic-flash');
    flash.style.cssText = `
        position: absolute; left: ${-fs / 2}px; top: ${-fs / 2}px; width: ${fs}px; height: ${fs}px;
        background: radial-gradient(circle, ${core} 0%, ${color} 55%, transparent 100%);
        mix-blend-mode: ${blend}; opacity: 0; transform: scale(0.3);
    `;
    rig.appendChild(flash);
    anims.push(flash.animate([
        { transform: 'scale(0.3)', opacity: 0 },
        { transform: 'scale(1)', opacity: peak, offset: 0.2 },
        { transform: 'scale(1.5)', opacity: 0 }
    ], { duration: animDur * 0.6, easing: 'ease-out', fill: 'both' }));

    fxLayer(card).appendChild(root);

    const particlePromise = particles
        ? fxParticleBurst(card, { duration: animDur * 1.1, colors: ['#ffffff', color], reach: 0.6, ...particleConfig })
        : Promise.resolve();

    return Promise.allSettled([...anims.map(a => a.finished), particlePromise]).then(() => root.remove());
}
/* ===================== PULSE =====================
 * Rings grow from the center out to the e1 edge, then snap back to 0.
 * Lives between .e1 and .e2 in the DOM, so e2 + barcode paint over it.
 * ================================================ */
function fxPulse(card, o = {}) {
    if (!card) return { stop() { } };
    fxEnsureStyles();

    const {
        count = 3,
        interval = 180,        // ms between rings in a burst
        grow = 520,
        snap = 140,
        color = '#7fe8ff',
        width = 3,             // px at 384
        peak = 1.15,
        snapBack = false,       // false = fade out at full size instead of snapping to 0
        loop = false,
        loopGap = 700          // ms between bursts when looping
    } = o;

    card._fxPulse?.stop();

    const u = card.offsetWidth / 384;
    const layer = fxPulseLayer(card);
    const timers = new Set();

    const later = (fn, ms) => {
        const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
        timers.add(t);
    };

    const ring = () => {
        const r = fxMk('fx-ring');
        r.style.border = `${width * u}px solid ${color}`;
        r.style.boxShadow = `0 0 ${14 * u}px ${color}, inset 0 0 ${14 * u}px ${color}`;
        layer.appendChild(r);

        const total = grow + snap;
        const end = snapBack
            ? { transform: 'scale(0)', opacity: 0 }
            : { transform: 'scale(1.06)', opacity: 0 };

        const a = r.animate([
            { transform: 'scale(0)', opacity: 0, easing: 'cubic-bezier(.1,.6,.3,1)' },
            { transform: 'scale(1)', opacity: peak, offset: grow / total, easing: 'cubic-bezier(.7,0,1,.5)' },
            end
        ], { duration: total, fill: 'both' });
        a.onfinish = () => r.remove();
    };

    const burst = () => {
        for (let i = 0; i < count; i++) later(ring, i * interval);
        if (loop) later(burst, (count - 1) * interval + grow + snap + loopGap);
    };
    burst();

    const handle = {
        stop() {
            timers.forEach(clearTimeout);
            timers.clear();
            layer.getAnimations({ subtree: true }).forEach(a => a.cancel());
            layer.replaceChildren();
            if (card._fxPulse === handle) card._fxPulse = null;
        }
    };
    card._fxPulse = handle;
    return handle;
}
/* ===================== CENTRALIZED FX CLEANUP ===================== */
const _fxActiveInstances = new WeakMap();

/**
 * Completely clears and halts all active visual effects on a card element.
 * @param {HTMLElement} cardEl - Target card DOM node
 */
function fxClear(cardEl) {
    if (!cardEl) return;

    // 1. Stop legacy direct-attached pulse handles
    if (cardEl._fxPulse) {
        cardEl._fxPulse.stop();
        delete cardEl._fxPulse;
    }

    // 2. Stop all running JS loop instances (Lightning, Solar, Fiery, Starry, Plasma, etc.)
    const active = _fxActiveInstances.get(cardEl);
    if (active) {
        Object.values(active).forEach(inst => inst?.stop?.());
        _fxActiveInstances.delete(cardEl);
    }

    // 3. Query all effect layers and hosts across all active presets
    const selector = [
        '.fx',
        '.fx-pulse',
        '.fx-lightning-layer',
        '.fx-bh-back',
        '.fx-bh-front',
        '[class*="-canvas-host"]',
        '[class*="-canvas"]'
    ].join(', ');

    const fxLayers = cardEl.querySelectorAll(selector);

    // 4. Halt Web Animations API tracks and purge DOM nodes
    fxLayers.forEach(layer => {
        layer.getAnimations({ subtree: true }).forEach(a => a.cancel());
        layer.replaceChildren();
        layer.remove();
    });
}

function fxLightning(cardEl, opts = {}) {
    if (!cardEl) return { stop: () => { }, setFrequency: () => { } };
    fxEnsureStyles();

    let layer = cardEl.querySelector('.fx-lightning-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'fx-lightning-layer';
        cardEl.appendChild(layer);
    }

    const NS = "http://www.w3.org/2000/svg";
    let isRunning = true;
    let nextBoltTimeout = null;
    let activeCleanups = [];
    let baseDelay = opts.frequency || 2000;


    function boltPoints(anchor, tip, seed) {
        const pts = [];
        const segs = 12;
        const dx = tip.x - anchor.x;
        const dy = tip.y - anchor.y;

        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const midFactor = Math.pow(Math.sin(Math.PI * t), 0.1);
            let x = anchor.x + dx * t;
            let y = anchor.y + dy * t;

            const jitter = midFactor * 18;
            const hash = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
            const r = hash - Math.floor(hash);
            const angle = r * Math.PI * 1.5;

            x += Math.cos(angle) * jitter;
            y += Math.sin(angle) * jitter;
            pts.push({ x, y });
        }
        return pts;
    }

    // Helper to snap target strictly near innerRadius endpoints
    function getInnerRadiusPoint(cx, cy, innerRadius) {
        const angle = Math.random() * Math.PI * 2;
        // Focus strictly near innerRadius boundary (between 85% and 100% of innerRadius)
        const radius = innerRadius * (0.85 + Math.random() * 0.15);
        return {
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius
        };
    }

    function spawnBolt() {
        if (!layer || !isRunning) return;

        const cw = cardEl.clientWidth || 384;
        const ch = cardEl.clientHeight || 384;
        const cx = cw / 2;
        const cy = ch / 2;

        const outerRadius = Math.min(cw, ch) * (opts.outerRadiusScale || 0.43);
        const innerRadius = Math.min(cw, ch) * (opts.innerRadiusScale || 0.45);

        const globalFlip = Math.floor(performance.now() / 2000);
        const sign = (globalFlip % 2 === 0) ? -1 : 1;

        let anchorAngle = Math.random() * 2 * Math.PI;
        let anchorSpeed = (0.1 + Math.random() * 0.4) * sign;
        let seed = Math.random() * 1000;

        const maxStrokeScale = 24 + Math.random() * 12;

        const svg = document.createElementNS(NS, "svg");
        svg.classList.add("fx-bolt");
        svg.setAttribute("viewBox", `0 0 ${cw} ${ch}`);

        const glow = document.createElementNS(NS, "path");
        glow.setAttribute("fill", "none");
        glow.setAttribute("stroke", opts.glowColor || "#3389c2");
        glow.style.filter = "drop-shadow(0 0 18px #3383fa) drop-shadow(0 0 30px #66ccff)";
        glow.style.mixBlendMode = "screen";

        const core = document.createElementNS(NS, "path");
        core.setAttribute("fill", "none");
        core.setAttribute("stroke", opts.coreColor || "#bdefff");
        core.style.mixBlendMode = "screen";

        svg.appendChild(glow);
        svg.appendChild(core);
        layer.appendChild(svg);

        const birth = performance.now();
        const activeLife = opts.boltLife || 1800;

        // --- EXTENDED FLICKER DURATION & STEPPING ---
        const flickerStepMs = 35;
        const flickerDuration = 1500; // Increased to 650ms for a more pronounced fade out
        const totalLife = activeLife + flickerDuration;

        const initForbidEnd = anchorAngle + Math.PI * 0.4;
        let targetTipPos = {
            x: cx + Math.cos(initForbidEnd + Math.random() * (Math.PI * 2 - Math.PI * 0.8)) * innerRadius * (0.85 + Math.random() * 0.15),
            y: cy + Math.sin(initForbidEnd + Math.random() * (Math.PI * 2 - Math.PI * 0.8)) * innerRadius * (0.85 + Math.random() * 0.15)
        };
        let rafId = null;
        let isCancelled = false;
        let lastFlickerStep = -1;

        const cleanupSelf = () => {
            isCancelled = true;
            if (rafId) cancelAnimationFrame(rafId);

            svg.remove();
        };
        activeCleanups.push(cleanupSelf);

        function frame(now) {
            if (isCancelled || !isRunning) return;

            const elapsed = now - birth;

            // 1. Life Cycle Complete
            if (elapsed >= totalLife) {
                cleanupSelf();
                activeCleanups = activeCleanups.filter(c => c !== cleanupSelf);
                return;
            }

            // 2. Static Flicker-Out Phase
            // 2. Static Flicker-Out Phase
            if (elapsed >= activeLife) {
                const flickerElapsed = elapsed - activeLife;
                const step = Math.floor(flickerElapsed / flickerStepMs);

                if (step !== lastFlickerStep) {
                    lastFlickerStep = step;

                    // Linear decay progress (1 -> 0)
                    const decayProgress = 1 - (flickerElapsed / flickerDuration);

                    // Fix: Use a softer drop (0.15 min threshold instead of 0) so it stutters rather than completely dying early
                    const isStrobeOff = Math.random() < 0.35; // 35% chance of a low-visibility frame
                    const rawFlicker = isStrobeOff ? 0.12 : (0.4 + Math.random() * 0.6);

                    // Apply smooth decay with a floor to guarantee visibility through full flicker duration
                    const finalOpacity = rawFlicker * Math.pow(decayProgress, 0.22);
                    svg.style.opacity = Math.max(0, finalOpacity).toString();

                    // Optional: Dynamically collapse stroke width as it dies so it thins out instead of vanishing abruptly
                    const strokeDecay = Math.max(0.2, decayProgress);
                    glow.setAttribute("stroke-width", (1.5 * strokeDecay).toString());
                    core.setAttribute("stroke-width", (0.8 * strokeDecay).toString());
                }


                rafId = requestAnimationFrame(frame);
                return;
            }

            // 3. Active Generation Phase
            anchorAngle += anchorSpeed * 0.002;
            const anchorPos = {
                x: cx + Math.cos(anchorAngle) * outerRadius,
                y: cy + Math.sin(anchorAngle) * outerRadius
            };
            if (Math.random() < 0.025) {
                const forbidStart = anchorAngle - Math.PI * 0.4;  // 72° before anchor
                const forbidEnd = anchorAngle + Math.PI * 0.3;  // 72° after anchor
                let tipAngle = forbidEnd + Math.random() * (Math.PI * 2 - Math.PI * 0.8);
                targetTipPos = {
                    x: cx + Math.cos(tipAngle) * innerRadius * (0.85 + Math.random() * 0.15),
                    y: cy + Math.sin(tipAngle) * innerRadius * (0.85 + Math.random() * 0.15)
                };
            }



            const currentTip = {
                x: targetTipPos.x + (Math.random() - 0.5) * 6,
                y: targetTipPos.y + (Math.random() - 0.5) * 6
            };

            const points = boltPoints(anchorPos, currentTip, seed);
            const d = points.map((p, i) => {
                const midFactor = Math.sin(Math.PI * i / points.length);
                const osc = Math.sin((now / 1000) * 20 + (i * 0.5)) * 8 * midFactor;
                return (i === 0 ? "M" : "L") + (p.x + osc) + "," + (p.y + osc);
            }).join("");

            glow.setAttribute("d", d);
            core.setAttribute("d", d);

            const strike = Math.sin((elapsed / activeLife) * Math.PI);
            const width = 1 + strike * maxStrokeScale;
            glow.setAttribute("stroke-width", width.toString());
            core.setAttribute("stroke-width", (width * 0.45).toString());

            const flicker = 0.65 + Math.random() * 0.35;
            svg.style.opacity = ((0.75 + strike * 0.95) * flicker).toString();

            rafId = requestAnimationFrame(frame);
        }

        rafId = requestAnimationFrame(frame);
    }

    function scheduleNext() {
        if (!isRunning) return;

        const maxActiveBolts = opts.maxSimultaneousBolts || 2;
        if (activeCleanups.length >= maxActiveBolts) {
            nextBoltTimeout = setTimeout(scheduleNext, 700);
            return;
        }

        // --- FORCED SPAWN DELAY TO ACCOUNT FOR LONGER FLICKER ---
        const isRapid = Math.random() < 0.15;
        // Increased delay floor so new bolts don't stack directly over dying flickers
        const delay = isRapid
            ? (baseDelay * 0.8) + 400 + Math.random() * 400
            : baseDelay + 750 + Math.random() * 5000;

        nextBoltTimeout = setTimeout(() => {
            spawnBolt();
            scheduleNext();
        }, delay);
    }

    scheduleNext();

    const controller = {
        stop() {
            isRunning = false;
            if (nextBoltTimeout) clearTimeout(nextBoltTimeout);
            activeCleanups.forEach(cancel => cancel());
            activeCleanups = [];
            if (layer) layer.remove();
        },
        setFrequency(ms) {
            baseDelay = ms;
        }
    };

    const active = _fxActiveInstances.get(cardEl) || {};
    active.lightning = controller;
    _fxActiveInstances.set(cardEl, active);

    return controller;
}
/* ===================== LENS LEAK FX =====================
 * One-shot CSS/JS tilde-wave lens leak burst with step flicker.
 * ======================================================== */

const LENS_LEAK_CSS = `
.fx-lens-leak-host {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 10;
}
.fx-lens-leak-strand {
    position: absolute;
    left: 50%; top: 50%;
    transform-origin: 0 0;
    pointer-events: none;
    overflow: hidden;
    mix-blend-mode: screen;
}
.fx-lens-leak-inner {
    position: absolute;
    top: 0; left: 0;
    white-space: nowrap;
    line-height: 1;
    font-family: Arial, sans-serif;
    will-change: transform;
}
.fx-lens-leak-glow {
    position: absolute;
    inset: 0;
    mix-blend-mode: screen;
    pointer-events: none;
}

/* CSS Flicker Strobe */
.fx-lens-leak-flicker {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    animation: fxLensLeakStrobe 0.75s steps(1, end) forwards;
}

@keyframes fxLensLeakStrobe {
    0%   { opacity: 0; }
    8%   { opacity: 1.0; }
    15%  { opacity: 0.05; }
    28%  { opacity: 0.95; }
    40%  { opacity: 0; }
    55%  { opacity: 1.0; }
    70%  { opacity: 0.1; }
    85%  { opacity: 0.85; }
    100% { opacity: 0; }
}
`;

function fxLensLeakEnsureCSS() {
    if (document.getElementById('fx-lens-leak-css')) return;
    const s = document.createElement('style');
    s.id = 'fx-lens-leak-css';
    s.textContent = LENS_LEAK_CSS;
    document.head.appendChild(s);
}

function _lensLeakStrand(card, opts, angleRad, onComplete) {
    const {
        colors = ['#ff9933', '#33ffee', '#aa44ff'],
        tileW = 28,
        fontSize = 28,
        dur = 750,
        blurPx = 4,
        glowBlurPx = 12,
        fadeStops = '20%, 80%',
    } = opts;

    const cw = card.offsetWidth || 384;
    const u = cw / 384;
    const fw = tileW * u;
    const fs = fontSize * u;
    const bl = blurPx * u;
    const gbl = glowBlurPx * u;

    const radiusPx = -cw * (1.0 + Math.random() * 0.35);
    const strandW = cw * (0.6 + Math.random() * 0.8);
    const strandH = fs * (0.4 + Math.random() * 0.3);
    const scaleX = 2.8 + Math.random() * 1.4;

    const c1 = colors[Math.floor(Math.random() * colors.length)];
    const c2 = colors[Math.floor(Math.random() * colors.length)];

    /* Main outer container */
    const host = document.createElement('div');
    host.className = 'fx-lens-leak-strand';
    host.style.cssText = `
        width: ${strandW}px;
        height: ${strandH}px;
        transform: rotate(${angleRad.toFixed(4)}rad) translate(${(radiusPx - 0.5).toFixed(1)}px, ${(-strandH * 0.5).toFixed(1)}px) scaleX(${scaleX.toFixed(3)});
        filter: blur(${bl.toFixed(1)}px);
        -webkit-mask-image: linear-gradient(to right, transparent 0%, black ${fadeStops}, transparent 100%);
        mask-image: linear-gradient(to right, transparent 0%, black ${fadeStops}, transparent 100%);
    `;

    /* Dedicated flicker wrapper using stylesheet keyframes */
    const strandDur = (dur + (Math.random() * 200 - 100)) / 1000;
    const flickerWrap = document.createElement('div');
    flickerWrap.className = 'fx-lens-leak-flicker';
    flickerWrap.style.animationDuration = `${strandDur.toFixed(3)}s`;

    /* Inner tilde wave text */
    const inner = document.createElement('div');
    inner.className = 'fx-lens-leak-inner';
    inner.style.cssText = `
        font-size: ${fs.toFixed(1)}px;
        color: ${c1};
        text-shadow: 0 0 ${(gbl * 0.5).toFixed(1)}px ${c2};
        width: ${(fw * 3).toFixed(1)}px;
    `;
    inner.textContent = '~~~';

    /* Radial glow orbs */
    const glowWrap = document.createElement('div');
    glowWrap.className = 'fx-lens-leak-glow';
    glowWrap.style.filter = `blur(${gbl.toFixed(1)}px)`;

    [c1, c2].forEach((c, i) => {
        const orb = document.createElement('div');
        const sz = strandH * (1.1 + i * 0.3);
        orb.style.cssText = `
            position: absolute;
            top: 50%; left: ${i === 0 ? '30%' : '70%'};
            width: ${sz.toFixed(1)}px;
            height: ${sz.toFixed(1)}px;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            background: radial-gradient(circle, ${c} 0%, ${c} 20%, transparent 70%);
            opacity: 0.6;
            mix-blend-mode: screen;
        `;
        glowWrap.appendChild(orb);
    });

    flickerWrap.appendChild(inner);
    flickerWrap.appendChild(glowWrap);
    host.appendChild(flickerWrap);

    /* 1. Horizontal wave movement */
    inner.animate(
        [
            { transform: 'translateX(0px)' },
            { transform: `translateX(${-fw * 2.5}px)` }
        ],
        { duration: dur, easing: 'ease-out', fill: 'forwards' }
    );

    /* Clean up strand on flicker end */
    flickerWrap.addEventListener('animationend', () => {
        host.remove();
        if (onComplete) onComplete();
    });

    return host;
}

function fxLensLeak(card, o = {}) {
    if (!card) return;

    /* Ensure card anchors absolutely positioned elements */
    const compStyle = window.getComputedStyle(card);
    if (compStyle.position === 'static') {
        card.style.position = 'relative';
    }

    if (typeof fxEnsureStyles === 'function') fxEnsureStyles();
    fxLensLeakEnsureCSS();

    const {
        colors = ['#ff9933', '#33ffee', '#aa44ff'],
        tileW = 28,
        fontSize = 28,
        dur = 700,
        blurPx = 4,
        glowBlurPx = 12,
        fadeStops = '20%, 80%',
        minCount = 3,
        maxCount = 7,
        count = null,
    } = o;

    const opts = { colors, tileW, fontSize, dur, blurPx, glowBlurPx, fadeStops };

    const host = document.createElement('div');
    host.className = 'fx-lens-leak-host';
    card.appendChild(host);

    const numStrands = count !== null
        ? count
        : Math.floor(minCount + Math.random() * (maxCount - minCount + 1));

    let activeStrands = numStrands;

    function strandDone() {
        activeStrands--;
        if (activeStrands <= 0) {
            host.remove();
        }
    }

    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < numStrands; i++) {
        const stepAngle = baseAngle + (i * (Math.PI * 2 / numStrands)) + (Math.random() - 0.5) * 0.5;
        const strandEl = _lensLeakStrand(card, opts, stepAngle, strandDone);
        host.appendChild(strandEl);
    }
}

/* ===================== FX GAS MODULE ===================== */
function fxGas(card, opts = {}) {
    if (!card) return Promise.resolve();
    fxEnsureStyles();

    const fxContainer = fxLayer(card);

    const PATHS = [
        {
            centroidX: 165,
            centroidY: 140,
            d: "M18.1000,113.1000 C57.250,89.917 101.250,107.083 104.000,75.1000 C106.750,44.917 94.000,25.500 113.1000,23.000 C113.1000,23.000 174.250,-15.417 195.000,7.1000 C215.750,31.417 219.750,73.583 262.1000,75.1000 C306.250,78.417 349.250,146.583 324.1000,183.000 C300.750,219.417 283.250,224.583 257.1000,238.1000 C232.750,253.417 175.250,307.083 139.000,273.1000 C102.750,240.917 74.750,223.583 40.1000,215.1000 C7.250,208.417 -19.250,138.083 18.1000,113.1000 ZM85.677,192.013 C107.614,196.942 125.814,208.209 149.377,229.713 C172.939,251.217 210.314,216.334 226.727,206.963 C243.139,197.592 254.514,194.234 270.277,170.563 C286.039,146.892 258.089,102.584 229.977,101.013 C201.864,99.442 199.264,72.034 185.777,56.813 C172.289,41.592 133.127,66.563 133.127,66.563 C120.127,68.188 128.414,80.809 126.627,101.013 C124.839,121.217 96.239,110.059 71.377,125.713 C46.514,141.367 63.739,187.084 85.677,192.013 Z"
        },
        {
            centroidX: 155,
            centroidY: 140,
            d: "M300.000,194.000 C284.750,213.917 273.250,229.083 276.000,216.000 C276.254,214.791 276.450,213.934 276.585,213.373 C276.877,212.349 276.867,212.202 276.585,213.373 C275.503,217.161 270.251,232.988 259.000,238.1000 C243.250,247.417 243.250,238.083 227.000,248.000 C210.750,257.917 211.250,280.583 178.000,278.000 C144.750,275.417 121.750,274.083 104.000,265.000 C86.250,255.917 64.250,246.583 76.000,243.000 C87.750,239.417 81.250,241.583 62.000,232.000 C42.750,222.417 24.750,214.583 19.1000,206.000 C15.250,197.417 0.750,184.583 0.1000,169.1000 C1.250,155.417 -2.250,157.583 12.1000,127.1000 C28.250,98.417 22.750,107.583 26.1000,86.1000 C31.250,66.417 28.750,80.083 36.1000,84.000 C45.250,87.917 67.750,70.583 73.1000,61.000 C80.250,51.417 126.750,18.083 119.1000,32.1000 C113.250,47.917 130.250,29.083 142.000,15.1000 C153.750,2.917 161.500,-4.000 170.1000,2.1000 C170.1000,2.1000 187.750,-2.417 201.000,25.1000 C214.250,54.417 224.250,68.583 250.000,76.1000 C275.750,85.417 292.250,88.083 296.000,115.000 C299.750,141.917 315.250,174.083 300.000,194.000 ZM249.042,122.987 C246.530,104.953 235.475,103.166 218.222,97.527 C200.970,91.888 194.270,82.396 185.392,63.357 C176.515,44.318 165.292,47.947 165.292,47.947 C158.927,43.257 153.735,47.891 145.862,56.657 C137.990,65.423 126.600,78.041 131.122,68.047 C135.645,58.053 104.490,80.386 100.302,86.807 C96.115,93.228 81.040,104.841 75.512,102.217 C69.985,99.593 71.660,90.436 68.812,104.227 C65.965,118.018 69.650,111.876 59.432,131.697 C49.215,151.518 51.560,150.066 51.392,159.837 C51.225,169.608 60.940,178.206 64.122,183.957 C67.305,189.708 79.365,194.956 92.262,201.377 C105.160,207.798 109.515,206.346 101.642,208.747 C93.770,211.148 108.510,217.401 120.402,223.487 C132.295,229.573 147.705,230.466 169.982,232.197 C192.260,233.928 191.925,218.741 202.812,212.097 C213.700,205.453 213.700,211.706 224.252,206.067 C231.790,202.039 235.309,191.435 236.034,188.897 C235.943,189.273 235.812,189.847 235.642,190.657 C233.800,199.423 241.505,189.261 251.722,175.917 C261.940,162.573 251.555,141.021 249.042,122.987 ZM236.034,188.897 C236.223,188.112 236.230,188.211 236.034,188.897 Z"
        }
    ];

    const randomRange = (min, max) => min + Math.random() * (max - min);
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    return new Promise(resolve => {
        const stage = document.createElement('div');
        stage.className = 'fx-gas-stage';
        stage.style.mixBlendMode = opts.blendMode || 'screen';
        fxContainer.appendChild(stage);

        const totalDuration = opts.duration || 2.2;
        const strandCount = opts.count || 6;

        const rect = card.getBoundingClientRect();
        const cardMaxExtent = Math.hypot(rect.width, rect.height) * 0.45;
        const maxRadius = opts.maxRadius || cardMaxExtent;

        // --- HALF-ARC PULSE LAYERS ---
        const pulseCount = opts.pulseCount || 10;
        const pulses = Array.from({ length: pulseCount }, () => {
            const arc = document.createElement('div');
            arc.className = 'gas-arc-layer';

            arc.style.position = 'absolute';
            arc.style.pointerEvents = 'none';
            arc.style.borderRadius = '50%';
            arc.style.left = '50%';
            arc.style.top = '50%';
            arc.style.boxSizing = 'border-box';

            const hue = randomRange(60, 140);
            const borderWidth = randomRange(2, 5);

            // Build half-arc using border top/left + transparent bottom/right
            arc.style.borderTop = `${borderWidth}px solid hsla(${hue}, 100%, 70%, 0.95)`;
            arc.style.borderLeft = `${borderWidth}px solid hsla(${hue}, 90%, 60%, 0.6)`;
            arc.style.borderRight = `${borderWidth}px solid transparent`;
            arc.style.borderBottom = `${borderWidth}px solid transparent`;

            arc.style.opacity = '0';
            stage.appendChild(arc);

            return {
                el: arc,
                angle: Math.random() * Math.PI * 2,
                rotationAngle: randomRange(0, 360),
                rotSpeed: randomRange(-90, 90),
                radiusFactor: randomRange(0.25, 1.05),
                baseSize: randomRange(60, 150),
                expandFactor: randomRange(1.3, 1.9),
                freq: randomRange(8, 10),
                phase: Math.random() * Math.PI * 2,
                maxOpacity: randomRange(0.4, 0.95),
                hue: hue
            };
        });

        function updatePulses(elapsedTime) {
            const linearProgress = Math.min(elapsedTime / totalDuration, 1.0);
            const easedProgress = easeOutCubic(linearProgress);

            const globalFade = linearProgress < 0.85
                ? Math.min(linearProgress / 0.15, 1.0)
                : Math.max(0, (1.0 - linearProgress) / 0.15);

            pulses.forEach(p => {
                // Expanding spawn radius outwards with time t
                const currentRadius = maxRadius * p.radiusFactor * easedProgress;
                const currentX = Math.cos(p.angle) * currentRadius;
                const currentY = Math.sin(p.angle) * currentRadius;

                const currentSize = p.baseSize * (1 + (easedProgress * p.expandFactor));
                const currentRot = p.rotationAngle + (elapsedTime * p.rotSpeed);

                // Crisp glow with low blur radius
                const blurValue = 24 + (easedProgress * 3);

                p.el.style.width = `${currentSize.toFixed(1)}px`;
                p.el.style.height = `${currentSize.toFixed(1)}px`;
                p.el.style.transform = `
                    translate(-50%, -50%) 
                    translate(${currentX.toFixed(1)}px, ${currentY.toFixed(1)}px) 
                    rotate(${currentRot.toFixed(1)}deg)
                `;

                // Crisp drop-shadow sweep off the border arc
                p.el.style.filter = `
                brightness(2.0)
                    blur(${blurValue.toFixed(1)}px) 
                    drop-shadow(0px -4px 8px hsla(${p.hue}, 100%, 65%, 0.85))
                `;

                const wave = (Math.sin(elapsedTime * p.freq + p.phase) + 1) / 2;
                p.el.style.opacity = (wave * p.maxOpacity * globalFade).toFixed(3);
            });
        }

        // --- STRANDS LAYER ---
        function createStrand() {
            const selectedPath = PATHS[Math.floor(Math.random() * PATHS.length)];
            // Crisp, crisp blur settings
            const baseBlur = randomRange(8, 12);
            const edgeOffsetPx = randomRange(10, 25);
            const orbitSpeed = randomRange(10, 45);
            const orbitDirection = Math.random() > 0.5 ? 1 : -1;
            const maxScale = randomRange(1.2, 2.2);
            const hueSpeed = randomRange(30, 120);

            const baseHue = randomRange(-20, 70);
            const initialHueOffset = Math.random() * Math.PI * 2;

            const spawnDelay = randomRange(0, totalDuration * 0.35);
            const activeDuration = totalDuration - spawnDelay;

            const angle = Math.random() * Math.PI * 2;
            const targetRadius = randomRange(maxRadius * 0.3, maxRadius);
            const endX = Math.cos(angle) * targetRadius;
            const endY = Math.sin(angle) * targetRadius;

            const startW = randomRange(160, 240);
            const startH = randomRange(120, 180);
            const expandSize = randomRange(120, 220);

            const strandEl = document.createElement('div');
            strandEl.className = 'cloud-strand';
            strandEl.style.opacity = '0';


            const maskEl = document.createElement('div');
            maskEl.className = 'cloud-shape-mask';

            const clipperEl = document.createElement('div');
            clipperEl.className = 'cloud-path-clipper';
            clipperEl.style.clipPath = `path("${selectedPath.d}")`;

            const innerCoreEl = document.createElement('div');
            innerCoreEl.className = 'cloud-inner-core';

            const edgeCloneEl = document.createElement('div');
            edgeCloneEl.className = 'cloud-edge-clone';

            clipperEl.appendChild(innerCoreEl);
            clipperEl.appendChild(edgeCloneEl);
            maskEl.appendChild(clipperEl);
            strandEl.appendChild(maskEl);
            stage.appendChild(strandEl);

            return function update(elapsedTime) {
                if (elapsedTime < spawnDelay) return;

                const localTime = elapsedTime - spawnDelay;
                const linearProgress = Math.min(localTime / activeDuration, 1.0);
                const easedProgress = easeOutCubic(linearProgress);

                let opacity = 0;
                if (linearProgress < 0.15) {
                    opacity = linearProgress / 0.15;
                } else {
                    opacity = Math.pow(1 - (linearProgress - 0.15) / 0.85, 1.25);
                }

                const currentX = endX * easedProgress;
                const currentY = endY * easedProgress;
                const currentW = startW + (easedProgress * expandSize);
                const currentH = startH + (easedProgress * expandSize * 0.75);

                innerCoreEl.style.left = `${currentX.toFixed(1)}px`;
                innerCoreEl.style.top = `${currentY.toFixed(1)}px`;
                innerCoreEl.style.width = `${currentW.toFixed(1)}px`;
                innerCoreEl.style.height = `${currentH.toFixed(1)}px`;

                const radialShift = easedProgress * edgeOffsetPx;
                edgeCloneEl.style.left = `${(currentX + radialShift).toFixed(1)}px`;
                edgeCloneEl.style.top = `${(currentY + (radialShift * 0.6)).toFixed(1)}px`;
                edgeCloneEl.style.width = `${currentW.toFixed(1)}px`;
                edgeCloneEl.style.height = `${currentH.toFixed(1)}px`;

                // Sharpened blur parameters
                const strandBlur = baseBlur + (easedProgress * 2);
                const innerBlur = 1 + (easedProgress * 2);
                const edgeBlur = 2 + (easedProgress * 4);

                innerCoreEl.style.filter = `blur(${innerBlur.toFixed(1)}px)`;

                const hueOscillation = Math.sin((localTime * (hueSpeed / 20)) + initialHueOffset);
                const hueRotation = baseHue + (hueOscillation * 40);

                edgeCloneEl.style.filter = `
                    blur(${edgeBlur.toFixed(1)}px) 
                    hue-rotate(${hueRotation.toFixed(0)}deg) 
                    drop-shadow(-2px 2px 5px rgba(0, 230, 255, 0.85))
                `;

                const currentScale = 0.2 + (easedProgress * maxScale);
                const orbitAngle = localTime * orbitSpeed * orbitDirection;

                strandEl.style.transform = `
                    translate(${currentX.toFixed(1)}px, ${currentY.toFixed(1)}px)
                    rotate(${orbitAngle.toFixed(1)}deg) 
                    scale(${currentScale.toFixed(3)}) 
                    translate(${-selectedPath.centroidX}px, ${-selectedPath.centroidY}px)
                `;
                strandEl.style.opacity = opacity.toFixed(3);
                strandEl.style.filter = `blur(${strandBlur.toFixed(1)}px)`;
            };
        }

        const strandUpdaters = Array.from({ length: strandCount }, () => createStrand());

        let startTimestamp = null;
        let animId = null;

        function step(now) {
            if (!startTimestamp) startTimestamp = now;
            const elapsedTime = (now - startTimestamp) / 1000;

            updatePulses(elapsedTime);
            strandUpdaters.forEach(update => update(elapsedTime));

            if (elapsedTime < totalDuration) {
                animId = requestAnimationFrame(step);
            } else {
                cancelAnimationFrame(animId);
                stage.remove();
                resolve();
            }
        }

        animId = requestAnimationFrame(step);
    });
}


/* ===================== BLACK HOLE FX =====================
 *   fxBlackHole(cardEl, opts) -> Promise (resolves when gone; promise.stop() cancels)
 *
 * Two parts (like the rest of the card FX, sized from card.offsetWidth via u = width/384):
 *
 *  BACK  (prepended = paints BEHIND the card's content)
 *    hole  (scaled by one master curve: grow -> hold -> collapse)
 *      ├─ disc   solid black circle
 *      └─ glow   wrapper whose filter = 2x drop-shadow, offset vector ORBITS the hole
 *           ├─ ring   border ring (the pulsing accretion edge)
 *           └─ spin   masked conic-gradient that rotates
 *
 *  FRONT (appended = paints ABOVE the card)
 *    canvas streaks. Each one:
 *      phase 1  "spec"   tiny dot flung OUTWARD from the hole edge (decelerating)
 *      phase 2  "streak" reverses and falls INWARD toward origin. Its line is a
 *               gradient (transparent tail -> white head). The tail->head length
 *               collapses to 0 as it arrives (the "stop point" shifting to 0), and
 *               it swirls slightly while falling.
 *    + fxParticleBurst() is called for extra specs flung outward.
 *
 * NOTE on "behind the card": the back layer is the first child of .card with no
 * z-index. If the card has an opaque background that hides it, pass
 * behindZ: -1 (works because .card's scale() makes it a stacking context), or
 * make sure the hole sits outside the card art. Requires .card { overflow: visible }.
 * ========================================================= */

const FX_BH_CSS = `
.card .fx-bh-back,
.card .fx-bh-front {
    position: absolute; left: 50%; top: 50%;
    width: 0; height: 0;
    pointer-events: none; overflow: visible;
}
.card .fx-bh-front { z-index: 26; }
.card .fx-bh-acc  {  position: absolute; left: 0; top: 0; border-radius: 50%; width: 100%; height: 100%; border: 1px #fff; z-index: 9999; opacity: 0.3;}
.card .fx-bh-hole  { position: absolute; border-radius: 50%; will-change: transform, opacity;  filter: blur(8px);  }
.card .fx-bh-disc  { position: absolute; inset: 0; border-radius: 50%; background: #000;}
optional.card .fx-bh-disc  { position: absolute; inset: 0; border-radius: 50%; background: #00000000; }
.card .fx-bh-glow  { position: absolute; inset: 0; border-radius: 50%; }
.card .fx-bh-ring  { position: absolute; inset: 0; border-radius: 50%; box-sizing: border-box; }
.card .fx-bh-spin  { position: absolute; inset: 0; border-radius: 50%; will-change: transform; }
.card .fx-bh-front canvas { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); mix-blend-mode: screen; }
`;

function fxBlackHoleEnsureCSS() {
    if (document.getElementById('fx-bh-styles')) return;
    const s = document.createElement('style');
    s.id = 'fx-bh-styles';
    s.textContent = FX_BH_CSS;
    document.head.appendChild(s);
}

function fxBlackHole(card, o = {}) {
    if (!card) return Promise.resolve();
    fxBlackHoleEnsureCSS();

    const {
        /* --- timing / lifecycle --- */
        duration = 2400,          // TOTAL ms (grow + hold + collapse)
        grow = 0.28,              // fraction of duration spent expanding
        hold = 0.47,              // fraction spent at full size (remainder = collapse)
        collapse = true,          // true: shrinks to a point; false: just fades out at the end
        startScale = 0.04,        // starting size as fraction of max
        size = 1.25,               // MAX hole diameter as a multiple of card width (expansion)
        behindZ = null,           // e.g. -1 to force behind the card's own background

        /* --- ring / glow --- */
        ringWidth = 3,            // px at 384
        ringColor = '#ffe2b0',
        glowColors = ['#ffa769', '#6bfd7f'],  // two drop-shadows, opposite sides
        glowBlur = 4,            // px at 384 (pulses +-25%)
        shadowOffset = 12,        // px at 384, radius of the orbiting shadow offset
        orbitSpeed = 0.4,         // revolutions/sec of the shadow offset
        pulseSpeed = 2.2,         // pulses/sec of the glow blur
        accretion = true,         // rotating conic band on the ring
        spinSpeed = 0.7,          // revolutions/sec of the conic band

        /* --- streaks --- */
        streaks = 48,
        streakColors = ['#ffffff', '#bdefff', '#fff4bb', '#7fe8ff'],
        streakWidth = [1, 2.4],        // px at 384
        streakLength = [0.22, 0.55],   // x card width at peak (before collapsing)
        outTime = [180, 340],          // ms: spec flung outward
        inTime = [550, 950],           // ms: streak falls back in
        swirl = [0.3, 1.1],            // radians of spiral while falling (sign randomized)
        apexRange = [0.55, 1.0],       // outward apex as fraction of max reach
        reach = 1.0,                   // max reach as multiple of card half-width * size
        endRadius = 0.12,              // streaks die at this fraction of current hole radius
        spawnUntil = null,             // fraction of duration streaks keep spawning (default grow+hold)

        /* --- particles (fxParticleBurst reuse) --- */
        particles = true,
        particleBursts = 4,            // number of bursts spread across grow+hold
        particleConfig = {}
    } = o;

    card._fxBlackHole?.stop();

    const TAU = Math.PI * 2;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const rr = r => rnd(r[0], r[1]);
    const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
    const hex = (h, a) => {
        const n = parseInt(h.replace('#', '').padStart(6, '0'), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };

    const cw = card.offsetWidth || 384;
    const u = cw / 384;
    const holeMaxR = (cw * size) / 2;
    const maxReach = (cw / 2) * Math.max(1, size) * reach * 1.6;
    const dur = Math.max(300, duration);
    const tHold = grow + hold;
    const spawnEnd = (spawnUntil ?? tHold) * dur;

    /* ---------- BACK layer ---------- */
    const back = document.createElement('div');
    back.className = 'fx-bh-back';
    if (behindZ !== null) back.style.zIndex = String(behindZ);
    card.prepend(back);

    const D = holeMaxR * 2;
    const hole = document.createElement('div');
    hole.className = 'fx-bh-hole';
    hole.style.cssText = `width:${D}px;height:${D}px;left:${-D / 2}px;top:${-D / 2}px;transform:scale(${startScale});`;

    const disc = document.createElement('div');
    disc.className = 'fx-bh-disc';
    disc.style.boxShadow = `0 0 ${30 * u}px ${6 * u}px #000`;

    const glow = document.createElement('div');
    glow.className = 'fx-bh-glow';

    const ring = document.createElement('div');
    ring.className = 'fx-bh-ring';
    ring.style.border = `${ringWidth * u}px solid ${ringColor}`;
    ring.style.filter = `blur(${ringWidth * u * 0.8}px) drop-shadow(0 0 ${ringWidth * u * 0.5}px ${ringColor})`;
    const spin = document.createElement('div');
    spin.className = 'fx-bh-spin';
    if (accretion) {
        const band = ringWidth * u * 2.2;
        const m = `radial-gradient(farthest-side, transparent calc(100% - ${band}px), #000 calc(100% - ${band}px + 1px))`;

        // Dynamically build conic gradient using options:
        const c1 = glowColors[0];
        const c2 = glowColors[1] ?? glowColors[0];
        spin.style.background = `conic-gradient(from 0deg, rgba(255,255,255,0.95), ${hex(c2, 0.2)} 25%, ${hex(c1, 0.9)} 50%, ${hex(c2, 0.2)} 75%, rgba(255,255,255,0.95))`;

        spin.style.webkitMaskImage = m;
        spin.style.maskImage = m;
    }
    const acc = document.createElement('div');
acc.className = 'fx-bh-acc';
acc.style.width = `${D * 1.05}px`;
acc.style.height = `${D * 1.05}px`;
acc.style.border = `${1 * u}px solid #fff`;

    glow.append(ring, spin);
    hole.append(disc, glow);
    back.appendChild(hole);

    /* ---------- FRONT layer ---------- */
    const front = document.createElement('div');
    front.className = 'fx-bh-front';
    card.appendChild(front);

    const size2 = Math.ceil(maxReach * 2.2);
    const canvas = document.createElement('canvas');
    canvas.width = size2;
    canvas.height = size2;
    canvas.style.width = size2 + 'px';
    canvas.style.height = size2 + 'px';
    front.appendChild(canvas);
      front.appendChild(acc);
    const ctx = canvas.getContext('2d');
    const c = size2 / 2;

    /* ---------- streak pool ---------- */
    const live = [];
    for (let i = 0; i < streaks; i++) {
        live.push({
            spawnAt: Math.random() * spawnEnd,
            angle: Math.random() * TAU,
            apexK: rnd(apexRange[0], apexRange[1]),
            out: rr(outTime),
            inn: rr(inTime),
            len: rr(streakLength) * cw,
            w: rr(streakWidth) * u,
            swirl: rr(swirl) * (Math.random() < 0.5 ? -1 : 1),
            col: streakColors[Math.floor(Math.random() * streakColors.length)],
            init: false,
            r0: 0,
            apex: 0
        });
    }

    /* ---------- master curve ---------- */
    function scaleAt(p) {
        if (p < grow) return startScale + (1 - startScale) * easeOutCubic(p / grow);
        if (p < tHold || !collapse) return 1 + 0.025 * Math.sin(p * 40);
        const q = (p - tHold) / (1 - tHold);
        return Math.max(0, 1 - q * q * q);           // slow start, snaps shut at the end
    }

    /* ---------- lifecycle ---------- */
    const timers = [];
    let stopped = false, rafId = null, resolveFn;
    const promise = new Promise(r => { resolveFn = r; });

    const handle = {
        stop() {
            if (stopped) return;
            stopped = true;
            if (rafId) cancelAnimationFrame(rafId);
            timers.forEach(clearTimeout);
            back.remove();
            front.remove();
            if (card._fxBlackHole === handle) card._fxBlackHole = null;
            if (typeof _fxActiveInstances !== 'undefined') {
                const a = _fxActiveInstances.get(card);
                if (a && a.blackhole === handle) delete a.blackhole;
            }
            resolveFn();
        }
    };
    card._fxBlackHole = handle;
    if (typeof _fxActiveInstances !== 'undefined') {
        const a = _fxActiveInstances.get(card) || {};
        a.blackhole = handle;
        _fxActiveInstances.set(card, a);
    }
    promise.stop = handle.stop;

    /* ---------- particle bursts (reuses fxParticleBurst) ---------- */
    if (particles && typeof fxParticleBurst === 'function') {
        const n = Math.max(1, particleBursts);
        for (let i = 0; i < n; i++) {
            const at = n === 1 ? 0 : (i / (n - 1)) * tHold * dur * 0.8;
            timers.push(setTimeout(() => {
                if (stopped) return;
                fxParticleBurst(card, {
                    duration: 1400,
                    count: [20, 50],
                    colors: ['#ffffff', ...streakColors.slice(1), ...glowColors],
                    reach: Math.max(1, size) * 1.1,
                    minRadiusRatio: 0.3,
                    maxRadiusRatio: 0.85,
                    ...particleConfig
                });
            }, at));
        }
    }

    /* ---------- frame ---------- */
    const t0 = performance.now();

    function frame(now) {
        if (stopped) return;
        const t = now - t0;
        const p = Math.min(1, t / dur);
        const s = scaleAt(p);
        const holeR = holeMaxR * s;

        /* BACK: scale + fade */
        hole.style.transform = `scale(${s.toFixed(4)})`;
        const accD = D * s;

acc.style.width = `${accD}px`;
acc.style.height = `${accD}px`;
acc.style.left = `${-accD / 2}px`;
acc.style.top = `${-accD / 2}px`;
        let op = 1;
        if (!collapse && p > 0.88) op = Math.max(0, (1 - p) / 0.12);
        hole.style.opacity = op.toFixed(3);
const pct = t / dur;

if (pct <= 0.05) {
    acc.style.opacity = 0;
} else if (pct < 0.10) {
    acc.style.opacity = (pct - 0.05) / 0.05;
} else if (pct < 0.90) {
    acc.style.opacity = 1;
} else if (pct < 0.95) {
    acc.style.opacity = 1 - ((pct - 0.90) / 0.05);
} else {
    acc.style.opacity = 0;
}
        /* BACK: orbiting drop-shadow + pulsing blur + spinning band */
        const th = (t / 1000) * orbitSpeed * TAU;
        const off = shadowOffset * u;
        const dx = Math.cos(th) * off, dy = Math.sin(th) * off;
        const blur = glowBlur * u * (10 + 0.25 * Math.sin((t / 1000) * pulseSpeed * TAU));
        const g0 = glowColors[0], g1 = glowColors[1] ?? glowColors[0];
        glow.style.filter =
            `drop-shadow(${dx.toFixed(1)}px ${dy.toFixed(1)}px ${blur.toFixed(1)}px ${g0}) ` +
            `drop-shadow(${(-dx).toFixed(1)}px ${(-dy).toFixed(1)}px ${blur.toFixed(1)}px ${g1})`;
        if (accretion) spin.style.transform = `rotate(${((t / 1000) * spinSpeed * 360).toFixed(1)}deg)`;

        /* FRONT: streaks */
        ctx.clearRect(0, 0, size2, size2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        let active = 0;

        for (let i = 0; i < live.length; i++) {
            const st = live[i];
            if (st.done) continue;
            active++;
            const lt = t - st.spawnAt;
            if (lt < 0) continue;

            if (!st.init) {
                st.init = true;
                st.r0 = Math.max(holeR, 6 * u);
                st.apex = Math.max(st.r0 + 20 * u, maxReach * st.apexK);
            }

            const cos = Math.cos(st.angle), sin = Math.sin(st.angle);
            let rHead, rTail, alpha, ang = st.angle;

            if (lt < st.out) {
                /* phase 1: spec flung outward */
                const q = lt / st.out;
                rHead = st.r0 + (st.apex - st.r0) * easeOutCubic(q);
                rTail = rHead - 3 * u * (1 - q) - 1;
                alpha = Math.min(1, q * 3) * 0.9;
            } else {
                /* phase 2: streak falls back in, gradient collapses toward the head */
                const q = (lt - st.out) / st.inn;
                if (q >= 1) { st.done = true; continue; }
                const e = Math.pow(q, 2.2);
                const endR = Math.max(holeR * endRadius, 1);
                rHead = st.apex + (endR - st.apex) * e;
                const L = st.len * Math.sin(Math.PI * Math.pow(q, 0.6));   // 0 -> peak -> 0
                rTail = rHead + Math.max(L, 1);
                ang = st.angle + st.swirl * e;
                alpha = q > 0.85 ? (1 - q) / 0.15 : 1;
            }
            if (rHead < 0) rHead = 0;

            const ca = Math.cos(ang), sa = Math.sin(ang);
            const hx = c + ca * rHead, hy = c + sa * rHead;
            const tx = c + ca * rTail, ty = c + sa * rTail;

            const grad = ctx.createLinearGradient(tx, ty, hx, hy);
            grad.addColorStop(0, hex(st.col, 0));
            grad.addColorStop(0.65, hex(st.col, 0.45));
            grad.addColorStop(1, 'rgba(255,255,255,1)');

            ctx.globalAlpha = Math.max(0, Math.min(1, alpha * op));
            ctx.strokeStyle = grad;
            ctx.lineWidth = st.w;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(hx, hy);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(hx, hy, st.w * 0.7, 0, TAU);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        if (p >= 1 && (active === 0 || t > dur + 1500)) {
            handle.stop();
            return;
        }
        rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return promise;
}
/* ===================== CANVAS HELPER (ZERO-SIZE TOP-LEFT HOST) ===================== */
function _fxGetOrCreateCanvas(cardEl, className, padding = 180, behind = false) {
    fxEnsureStyles();

    // 1. Zero-size host container pinned to card top-left (0, 0)
    const hostClass = className + '-host';
    let host = cardEl.querySelector(`.${hostClass}`);
    if (!host) {
        host = document.createElement('div');
        host.className = hostClass;

        Object.assign(host.style, {
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '0px',
            height: '0px',
            margin: '0px',
            padding: '0px',
            border: 'none',
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: behind ? '-1' : '1',
            mixBlendMode: 'screen'
        });

        if (behind) {
            cardEl.prepend(host);
        } else {
            cardEl.appendChild(host);
        }
    }

    // 2. Canvas layer inside zero-size host
    let canvas = host.querySelector(`.${className}`);
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = `${className} fx-host-canvas`;
        host.appendChild(canvas);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cardEl.offsetWidth || 384;
    const h = cardEl.offsetHeight || 537;

    const totalW = w + padding * 2;
    const totalH = h + padding * 2;

    if (canvas.width !== Math.round(totalW * dpr) || canvas.height !== Math.round(totalH * dpr)) {
        canvas.width = Math.round(totalW * dpr);
        canvas.height = Math.round(totalH * dpr);

        Object.assign(canvas.style, {
            width: `${totalW}px`,
            height: `${totalH}px`,
            position: 'absolute',
            left: `${-padding}px`,
            top: `${-padding}px`,
            transform: 'none',
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            maxWidth: 'none',
            maxHeight: 'none',
            overflow: 'visible'
        });
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Set (0,0) of context to match card (0,0)
    ctx.translate(padding, padding);

    return { canvas, ctx, width: w, height: h, u: w / 384 };
}
/* ===================== FX SOLAR FLARE (CORONAL PROMINENCE ARCS) ===================== */
/**
 * Generates true sinuous solar prominence loops and whip tendrils with dual-wave distortion,
 * radial opacity attenuation, smooth decay envelope, and arc flickering.
 */
function fxSolarFlare(cardEl, opts = {}) {
    fxEnsureStyles();

    const config = {
        originX: opts.originX ?? 0.5,
        originY: opts.originY ?? 0.5,
        behind: opts.behind ?? true,            // Render behind card
        arcCount: opts.arcCount ?? 16,           // Tuned default count
        reach: opts.reach ?? 320,               // Prominence reach distance
        speed: opts.speed ?? 0.4,               // Slower growth velocity
        distortion: opts.distortion ?? 1.3,      // Multiplier for 2nd wave distortion
        flickerArcs: opts.flickerArcs ?? true,   // Arc-level brightness/alpha flicker
        coreColor: opts.coreColor || '#ffffff',
        midColor: opts.midColor || '#fffb00',
        outerColor: opts.outerColor || '#ff2200'
    };

    let active = true;
    let rafId = null;

    function createArc(u) {
        const baseAngle = (Math.random() * Math.PI * 2);
        const isLoop = Math.random() < 0.65; // 65% loops back, 35% whips into space
        return {
            baseAngle,
            reach: (config.reach * (0.65 + Math.random() * 0.6)) * u,
            spanAngle: (0.4 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1),
            isLoop,
            life: Math.random() * 0.15, // Stagger birth phases
            decay: 0.0008 + Math.random() * 0.0015, // Slower lifetime progression for smoother fade

            // Primary Sine Frequencies
            freq1: 2 + Math.random() * 3,
            freq2: 4 + Math.random() * 4,
            amp1: (6 + Math.random() * 10) * u,
            amp2: (3 + Math.random() * 6) * u,

            // Secondary Layer Distortion Wave
            freq3: 6 + Math.random() * 6,
            amp3: (2.5 + Math.random() * 4.5) * u * config.distortion,

            // Ribbons per prominence bundle
            strands: Math.floor(1 + Math.random() * 4),
            seed: Math.random() * 1000,
            flickerSpeed: 0.03 + Math.random() * 0.05
        };
    }

    let arcs = [];

    function render(now) {
        if (!active) return;

        // Clean canvas helper with 180px overflow padding buffer
        const { ctx, width, height, u } = _fxGetOrCreateCanvas(cardEl, 'fx-solar-canvas', 180, config.behind);
        ctx.clearRect(-180, -180, width + 360, height + 360);

        if (arcs.length === 0) {
            arcs = Array.from({ length: config.arcCount }, () => createArc(u));
        }

        const cx = width * config.originX;
        const cy = height * config.originY;
        const tSec = now * 0.001 * config.speed;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineCap = 'round';

        arcs.forEach((arc, idx) => {
            arc.life += arc.decay * config.speed;
            if (arc.life >= 1) {
                arcs[idx] = createArc(u);
                return;
            }

            // 1. SMOOTH TERMINAL DECAY ENVELOPE:
            // Fast ease-in upon spawn, long gentle cubic tail as life approaches 1.0
            const fadeIn = Math.min(1, arc.life * 4.0);
            const fadeOut = Math.pow(1 - arc.life, 0.8);
            let arcAlpha = fadeIn * fadeOut;

            // 2. ARC-LEVEL FLICKER
            if (config.flickerArcs) {
                const flickerNoise = Math.sin(now * arc.flickerSpeed + arc.seed) * 0.25
                    + Math.cos(now * arc.flickerSpeed * 2.3) * 0.15;
                const flickerFactor = Math.max(0.75, Math.min(1.2, 1.0 + flickerNoise));
                arcAlpha *= flickerFactor;
            }

            const segments = 16;

            // Render bundled plasma tendrils per arc spine
            for (let s = 0; s < arc.strands; s++) {
                const strandOffset = (s - arc.strands / 2) * (2.5 * u);

                for (let i = 0; i < segments; i++) {
                    const p1 = i / segments;
                    const p2 = (i + 1) / segments;

                    // Height factors along arc
                    const hFactor1 = arc.isLoop ? Math.sin(p1 * Math.PI) : Math.pow(p1, 0.75);
                    const hFactor2 = arc.isLoop ? Math.sin(p2 * Math.PI) : Math.pow(p2, 0.75);

                    const r1 = arc.reach * hFactor1 * Math.min(1, arc.life * 1.5);
                    const r2 = arc.reach * hFactor2 * Math.min(1, arc.life * 1.5);

                    const angle1 = arc.baseAngle + (arc.spanAngle * p1);
                    const angle2 = arc.baseAngle + (arc.spanAngle * p2);

                    // Wave displacements
                    const wiggle1 = (Math.sin(tSec * 3 + p1 * arc.freq1 + arc.seed + s) * arc.amp1
                        + Math.cos(tSec * 2 - p1 * arc.freq2 + arc.seed) * arc.amp2
                        + Math.sin(tSec * 5 - p1 * arc.freq3 + arc.seed * 0.5) * arc.amp3) * hFactor1;

                    const wiggle2 = (Math.sin(tSec * 3 + p2 * arc.freq1 + arc.seed + s) * arc.amp1
                        + Math.cos(tSec * 2 - p2 * arc.freq2 + arc.seed) * arc.amp2
                        + Math.sin(tSec * 5 - p2 * arc.freq3 + arc.seed * 0.5) * arc.amp3) * hFactor2;

                    const normAngle1 = angle1 + Math.PI / 2;
                    const normAngle2 = angle2 + Math.PI / 2;

                    const x1 = cx + Math.cos(angle1) * r1 + Math.cos(normAngle1) * (wiggle1 + strandOffset);
                    const y1 = cy + Math.sin(angle1) * r1 + Math.sin(normAngle1) * (wiggle1 + strandOffset);

                    const x2 = cx + Math.cos(angle2) * r2 + Math.cos(normAngle2) * (wiggle2 + strandOffset);
                    const y2 = cy + Math.sin(angle2) * r2 + Math.sin(normAngle2) * (wiggle2 + strandOffset);

                    // 3. RADIAL ALPHA ATTENUATION ALONG ARC REACH:
                    // Alpha falls off smoothly as radial distance approaches arc limit
                    const segmentMidR = (r1 + r2) * 0.5;
                    const radialRatio = Math.min(1, segmentMidR / arc.reach);
                    const radialAlpha = Math.pow(1 - radialRatio, 1.2);

                    const segAlpha = arcAlpha * radialAlpha;
                    if (segAlpha <= 0.01) continue;

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);

                    // 1. Outer Flame Glow
                    ctx.strokeStyle = config.outerColor;
                    ctx.lineWidth = (6 + s) * u;
                    ctx.globalAlpha = segAlpha * 0.35;
                    ctx.stroke();

                    // 2. Mid Plasma Ribbon
                    ctx.strokeStyle = config.midColor;
                    ctx.lineWidth = (3 + s * 0.5) * u;
                    ctx.globalAlpha = segAlpha * 0.7;
                    ctx.stroke();

                    // 3. Bright White Core Spine
                    if (s === Math.floor(arc.strands / 2)) {
                        ctx.strokeStyle = config.coreColor;
                        ctx.lineWidth = 1.5 * u;
                        ctx.globalAlpha = segAlpha * 0.95;
                        ctx.stroke();
                    }
                }
            }
        });

        // Surface Emission Base Glow
        const baseGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 * u);
        baseGlow.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        baseGlow.addColorStop(0.5, 'rgba(255, 120, 0, 0.5)');
        baseGlow.addColorStop(1, 'rgba(255, 30, 0, 0)');

        ctx.beginPath();
        ctx.arc(cx, cy, 40 * u, 0, Math.PI * 2);
        ctx.fillStyle = baseGlow;
        ctx.globalAlpha = 0.95;
        ctx.fill();

        ctx.restore();
        rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return {
        stop() {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            const host = cardEl.querySelector('.fx-solar-canvas-host');
            if (host) host.remove();
            else {
                const canvas = cardEl.querySelector('.fx-solar-canvas');
                if (canvas) canvas.remove();
            }
        }
    };
}
/* ===================== FX HEAT STRANDS ===================== */
/**
 * Emits independent sinuous heat tendrils radiating outward with continuous velocity,
 * customizable root/tip stroke tapering, wave distortion, and radial fading.
 */
function fxHeatStrands(cardEl, opts = {}) {
    fxEnsureStyles();

    const config = {
        originX: opts.originX ?? 0.5,
        originY: opts.originY ?? 0.5,
        behind: opts.behind ?? true,            // Render behind card by default
        strandCount: opts.strandCount ?? 24,    // Total emitting heat strands
        reach: opts.reach ?? 380,               // Maximum radial reach
        speed: opts.speed ?? 0.5,               // Outward propagation velocity
        startWidth: opts.startWidth ?? 8.0,     // Root stroke thickness at emission point
        endWidth: opts.endWidth ?? 0.5,         // Tip stroke thickness at maximum reach
        distortion: opts.distortion ?? 5.5,      // Wave displacement intensity
        flicker: opts.flicker ?? true,          // Strand brightness oscillation
        coreColor: opts.coreColor || '#ffffff',
        midColor: opts.midColor || '#ffaa00',
        outerColor: opts.outerColor || '#ff2200'
    };

    let active = true;
    let rafId = null;

    function createStrand(u) {
        return {
            angle: Math.random() * Math.PI * 2,
            reach: (config.reach * (0.7 + Math.random() * 0.5)) * u,
            life: Math.random() * 0.2, // Stagger initial birth phase
            decay: 0.001 + Math.random() * 0.002,

            // Sinuous wave frequencies & amplitudes
            freq1: 3 + Math.random() * 4,
            freq2: 6 + Math.random() * 5,
            amp1: (4 + Math.random() * 8) * u * config.distortion,
            amp2: (2 + Math.random() * 4) * u * config.distortion,

            seed: Math.random() * 1000,
            flickerSpeed: 0.04 + Math.random() * 0.06
        };
    }

    let strands = [];

    function render(now) {
        if (!active) return;

        // Clean canvas helper with 180px overflow padding buffer
        const { ctx, width, height, u } = _fxGetOrCreateCanvas(cardEl, 'fx-heat-canvas', 180, config.behind);
        ctx.clearRect(-180, -180, width + 360, height + 360);

        if (strands.length === 0) {
            strands = Array.from({ length: config.strandCount }, () => createStrand(u));
        }

        const cx = width * config.originX;
        const cy = height * config.originY;
        const tSec = now * 0.001 * config.speed;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineCap = 'round';

        strands.forEach((s, idx) => {
            s.life += s.decay * config.speed;
            if (s.life >= 1) {
                strands[idx] = createStrand(u);
                return;
            }

            // Life Envelope: Quick ignition -> smooth, gradual fade out
            const fadeIn = Math.min(1, s.life * 5.0);
            const fadeOut = Math.pow(1 - s.life, 1.2);
            let strandAlpha = fadeIn * fadeOut;

            // Optional Flicker Modulation
            if (config.flicker) {
                const flickerNoise = Math.sin(now * s.flickerSpeed + s.seed) * 0.2
                    + Math.cos(now * s.flickerSpeed * 2.1) * 0.1;
                strandAlpha *= Math.max(0.7, Math.min(1.2, 1.0 + flickerNoise));
            }

            const segments = 18;

            for (let i = 0; i < segments; i++) {
                const p1 = i / segments;
                const p2 = (i + 1) / segments;

                // Expand outward radially over lifetime
                const currentReach = s.reach * Math.min(1, s.life * 1.4);
                const r1 = currentReach * p1;
                const r2 = currentReach * p2;

                // Sinuous wave displacement perpendicular to angle vector
                const wiggle1 = (Math.sin(tSec * 4 + p1 * s.freq1 + s.seed) * s.amp1
                    + Math.cos(tSec * 3 - p1 * s.freq2 + s.seed) * s.amp2) * p1;
                const wiggle2 = (Math.sin(tSec * 4 + p2 * s.freq1 + s.seed) * s.amp1
                    + Math.cos(tSec * 3 - p2 * s.freq2 + s.seed) * s.amp2) * p2;

                const normAngle = s.angle + Math.PI / 2;

                const x1 = cx + Math.cos(s.angle) * r1 + Math.cos(normAngle) * wiggle1;
                const y1 = cy + Math.sin(s.angle) * r1 + Math.sin(normAngle) * wiggle1;

                const x2 = cx + Math.cos(s.angle) * r2 + Math.cos(normAngle) * wiggle2;
                const y2 = cy + Math.sin(s.angle) * r2 + Math.sin(normAngle) * wiggle2;

                // Radial distance attenuation fade
                const midR = (r1 + r2) * 0.5;
                const radialRatio = Math.min(1, midR / s.reach);
                const radialAlpha = Math.pow(1 - radialRatio, 1.1);

                const segAlpha = strandAlpha * radialAlpha;
                if (segAlpha <= 0.01) continue;

                // Calculate radial stroke tapering from startWidth to endWidth
                const avgP = (p1 + p2) * 0.5;
                const strokeThickness = ((config.startWidth * (1 - avgP)) + (config.endWidth * avgP)) * u;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);

                // 1. Outer Heat Halo
                ctx.strokeStyle = config.outerColor;
                ctx.lineWidth = strokeThickness * 2.2;
                ctx.globalAlpha = segAlpha * 0.35;
                ctx.stroke();

                // 2. Mid Plasma Body
                ctx.strokeStyle = config.midColor;
                ctx.lineWidth = strokeThickness * 1.2;
                ctx.globalAlpha = segAlpha * 0.7;
                ctx.stroke();

                // 3. Hot Core Spine
                ctx.strokeStyle = config.coreColor;
                ctx.lineWidth = Math.max(0.8 * u, strokeThickness * 0.4);
                ctx.globalAlpha = segAlpha * 0.95;
                ctx.stroke();
            }
        });

        // Surface Core Heat Emission Glow
        const baseGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35 * u);
        baseGlow.addColorStop(0, 'rgba(255, 255, 220, 0.95)');
        baseGlow.addColorStop(0.4, 'rgba(255, 140, 0, 0.6)');
        baseGlow.addColorStop(1, 'rgba(255, 30, 0, 0)');

        ctx.beginPath();
        ctx.arc(cx, cy, 35 * u, 0, Math.PI * 2);
        ctx.fillStyle = baseGlow;
        ctx.globalAlpha = 0.9;
        ctx.fill();

        ctx.restore();
        rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return {
        stop() {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            const host = cardEl.querySelector('.fx-heat-canvas-host');
            if (host) host.remove();
            else {
                const canvas = cardEl.querySelector('.fx-heat-canvas');
                if (canvas) canvas.remove();
            }
        }
    };
}


/* ===================== FX OIL SLICK EMISSION ===================== */
/**
 * Emits iridescent oil-in-water shear sheets radially outward from an origin.
 * Each emission is a quarter/half ARC sheet (filled region between a leading
 * and trailing edge). A sine wave (smooth / sawtooth / pointed teeth / ragged)
 * is applied to the outline of the whole sheet, and nested contour layers
 * carry the thin-film color banding. Slight spin + shear, fades out by `reach`.
 *
 * Hue shift: the palette is a set of colors; each sheet slowly drifts through
 * that set on its own (random rate/direction), and color also shifts along the arc.
 *
 * Light sweep: a thin, blurred, wavy radial wavefront (color-dodge) travels outward
 * through each sheet, clipped to its outline. It runs on its own real-time clock
 * (independent of `speed`) with downtime between sweeps.
 *
 * Palettes: 'rainbow' | 'solar' | 'cyanic' (cyan-white-yellow) | 'optical' (blue-white-yellow)
 * opts.palette: a name, an array of names (random per sheet), or an array of
 * custom hex colors (one custom palette).
 */
function fxPlasma(cardEl, opts = {}) {
    fxEnsureStyles();

    const PALETTES = {
        rainbow: ['#ff3b5c', '#ff9a1f', '#ffe14a', '#4ee08a', '#2fd6e8', '#3d6bff', '#a14dff', '#ff4fd0'],
        solar: ['#7a2a00', '#d9650a', '#ffb226', '#fff0a8', '#ffc24a', '#e07410'],
        cyanic: ['#19d9ee', '#e8fcff', '#ffffff', '#fff3a0', '#ffe14a', '#8aeaf5'],
        optical: ['#1f4dff', '#6fa4ff', '#ffffff', '#fff6b0', '#ffe14a', '#4f86ff']
    };

    const config = {
        originX: opts.originX ?? 0.5,
        originY: opts.originY ?? 0.5,
        behind: opts.behind ?? false,
        plumeCount: opts.plumeCount ?? opts.ribbonCount ?? 7,   // Sheets alive at once
        reach: opts.reach ?? 220,               // Radius where sheets have fully faded
        speed: opts.speed ?? 1.35,              // Overall animation speed multiplier (emission only; NOT the light sweep)
        lifetime: opts.lifetime ?? 9,           // Seconds per sheet at speed 1
        spinSpeed: opts.spinSpeed ?? 1.5,       // Slight angular spin while expanding
        thickness: opts.thickness ?? 0.15,      // Sheet thickness as a fraction of its radius
        arcMin: opts.arcMin ?? 0.5,             // Min arc span (in half-turns of PI): 0.5 = quarter circle
        arcMax: opts.arcMax ?? 1.5,             // Max arc span: 1.0 = half circle
        distortion: opts.distortion ?? 0.1,     // Sine wave amplitude on the outline
        jagged: opts.jagged ?? 0.4,             // 0 = all smooth sines, 1 = all teeth/jagged
        edgeRoughness: opts.edgeRoughness ?? 0.4, // Fine ragged detail on the edge
        bands: opts.bands ?? 4,                 // Nested color contour layers
        colorDrift: opts.colorDrift ?? 0.12,    // Thin-film shimmer speed
        intensity: opts.intensity ?? 0.7,       // Overall alpha
        palette: opts.palette ?? 'solar',       // name | [names] | [hex colors]
        blendMode: opts.blendMode || 'color-dodge',
        edgeLine: opts.edgeLine ?? true,        // Faint bright rim on the leading edge
        originGlow: opts.originGlow ?? true,

        // ---- Start radius / reveal ----
        spawnRadius: opts.spawnRadius ?? 0,     // Sheets are born at this radius instead of the center (0 = center)
        revealRadius: opts.revealRadius ?? 120,   // Hidden inside this radius (0 = off). Emission itself is NOT changed.
        revealFade: opts.revealFade ?? 30,      // Fade-in distance beyond revealRadius


        // ---- Hue shift (per-sheet drift through the palette) ----
        hueShiftSpeed: opts.hueShiftSpeed ?? opts.colorDrift ?? 0.08, // Palette cycles/sec at speed 1 (each sheet randomizes around this)
        hueSpread: opts.hueSpread ?? 1.0,       // How much the color shifts across the arc within one sheet

        // ---- Light sweep (thin, blurred radial emissive wavefront; own real-time clock) ----
        lightSweep: opts.lightSweep ?? true,
        sweepSpeed: opts.sweepSpeed ?? 0.2,         // Passes per second while sweeping (pass takes 1/sweepSpeed sec). Independent of `speed`.
        sweepDelay: opts.sweepDelay ?? 4.5,         // Seconds of downtime between sweeps (randomized per sheet)
        sweepWidth: opts.sweepWidth ?? 0.22,        // Core band width as a fraction of sheet thickness
        sweepSoftness: opts.sweepSoftness ?? 6.0,   // Blur multiplier (higher = softer, always)
        sweepBlur: opts.sweepBlur ?? 15,             // Base blur radius in px (scaled by sweepSoftness and card scale)
        sweepIntensity: opts.sweepIntensity ?? 0.9, // Strength of the reflection
        sweepWave: opts.sweepWave ?? 0.6,           // Waviness of the front
        sweepBlend: opts.sweepBlend || 'color-dodge' // 'color-dodge' | 'lighter' | 'overlay'
    };


    // ---- Palette helpers ----
    function hexToRgb(h) {
        const s = h.replace('#', '');
        const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
        const n = parseInt(f, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function buildPalette(list) { return list.map(hexToRgb); }

    function resolvePalettePool() {
        const p = config.palette;
        if (typeof p === 'string') return [buildPalette(PALETTES[p] || PALETTES.solar)];
        if (Array.isArray(p) && p.length) {
            if (typeof p[0] === 'string' && p[0].startsWith('#')) return [buildPalette(p)];
            return p.map(name => buildPalette(PALETTES[name] || PALETTES.solar));
        }
        return [buildPalette(PALETTES.solar)];
    }
    const palettePool = resolvePalettePool();

    function sampleColor(pal, t) {
        t = t - Math.floor(t);
        const n = pal.length;
        const x = t * n;
        const i = Math.floor(x) % n;
        let f = x - Math.floor(x);
        f = f * f * (3 - 2 * f);
        const a = pal[i], b = pal[(i + 1) % n];
        return [
            a[0] + (b[0] - a[0]) * f,
            a[1] + (b[1] - a[1]) * f,
            a[2] + (b[2] - a[2]) * f
        ];
    }

    // ---- Wave shapes: smooth sine <-> sawtooth / pointed teeth ----
    // style: 0 = sawtooth, 1 = pointed (triangle) teeth
    function shapedWave(x, jag, style) {
        const s = Math.sin(x);
        const frac = (x / (Math.PI * 2)) - Math.floor(x / (Math.PI * 2));
        const saw = 2 * frac - 1;
        const tri = 1 - 4 * Math.abs(frac - 0.5);
        const sharp = style < 0.5 ? saw : tri;
        return s * (1 - jag) + sharp * jag;
    }

    let active = true;
    let rafId = null;
    let lastNow = null;

    function createSheet(u, initialLife) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const jag = Math.random() < 0.5
            ? Math.random() * 0.3 * config.jagged                       // mostly smooth
            : (0.4 + Math.random() * 0.6) * config.jagged;              // teeth / jagged
        return {
            baseAngle: Math.random() * Math.PI * 2,
            spinDir: dir,
            spinRate: (0.6 + Math.random() * 0.9) * config.spinSpeed,
            span: Math.PI * (config.arcMin + Math.random() * Math.max(0, config.arcMax - config.arcMin)),
            reach: config.reach * (0.7 + Math.random() * 0.45) * u,
            life: initialLife,
            lifeRate: 1 / (config.lifetime * (0.7 + Math.random() * 0.6)),
            shear: (0.25 + Math.random() * 0.5) * dir,       // trailing edge angular lag
            thick: config.thickness * (0.7 + Math.random() * 0.6),

            // Sine wave on the outline (cycles across the arc)
            waveFreq: 3 + Math.random() * 6,
            waveFreq2: 8 + Math.random() * 10,
            wavePhase: Math.random() * Math.PI * 2,
            wavePhase2: Math.random() * Math.PI * 2,
            waveAmp: (0.05 + Math.random() * 0.09) * config.distortion,   // fraction of sheet scale
            waveAmp2: (0.015 + Math.random() * 0.03) * config.distortion,
            jag: jag,
            style: Math.random(),
            waveTravel: (0.6 + Math.random() * 1.2) * dir,

            // Color + per-sheet hue drift
            pal: palettePool[Math.floor(Math.random() * palettePool.length)],
            hue: Math.random(),                                    // Current position in the palette (advances over time)
            hueRate: (0.5 + Math.random() * 1.0) * (Math.random() < 0.5 ? 1 : -1),
            cycWid: 0.5 + Math.random() * 0.9,                     // Color span through the nested layers
            cycArc: 0.25 + Math.random() * 0.5,                    // Color span along the arc
            seed: Math.random() * 1000,

            // Light sweep (always outward, own clock)
            sweepPhase: Math.random(),                             // Where in its cycle this sheet starts
            sweepRate: 0.85 + Math.random() * 0.3,                 // Per-sheet pass speed variation
            sweepGapScale: 0.6 + Math.random() * 0.8,              // Per-sheet downtime variation
            sweepFreq: 1.5 + Math.random() * 3
        };
    }

    let sheets = [];

    function render(now) {
        if (!active) return;

        const { ctx, width, height, u } = _fxGetOrCreateCanvas(cardEl, 'fx-plasma-canvas', 180, config.behind);
        ctx.clearRect(-180, -180, width + 360, height + 360);

        const dt = lastNow === null ? 0.016 : Math.min(0.05, (now - lastNow) * 0.001);
        lastNow = now;

        if (sheets.length === 0) {
            sheets = Array.from({ length: config.plumeCount }, () => createSheet(u, Math.random() * 0.7));
        }

        const cx = width * config.originX;
        const cy = height * config.originY;
        const tSec = now * 0.001 * config.speed;     // Emission clock (scaled by speed)
        const realSec = now * 0.001;                 // Light sweep clock (independent of speed)
        const dpr = window.devicePixelRatio || 1;    // shadowBlur ignores the ctx transform

        const N = 72;                                   // Samples along the arc
        const L = Math.max(2, Math.floor(config.bands)); // Nested contour layers

        ctx.save();
        ctx.globalCompositeOperation = config.blendMode;
        ctx.lineJoin = 'round';

        sheets.forEach((r, idx) => {
            r.life += dt * r.lifeRate * config.speed;
            if (r.life >= 1) {
                sheets[idx] = createSheet(u, 0);
                return;
            }

            // Slow per-sheet hue drift through its palette
            r.hue += dt * config.speed * config.hueShiftSpeed * r.hueRate;

            // Expansion: fast bloom, decelerating spread
            const ease = 1 - Math.pow(1 - Math.min(1, r.life * 1.05), 2.2);

            // Spawn ring: sheets are born at r0 and travel out to r.reach
            const r0 = Math.min(config.spawnRadius * u, r.reach * 0.85);
            const travelSpan = r.reach - r0;
            const R = r0 + travelSpan * (0.06 + 0.94 * ease);   // Center radius of the sheet
            const travel = R - r0;                               // Distance travelled from the spawn ring
            // Sheet scale: equals R when r0 = 0; grows from distance travelled when spawning on a ring
            const S = R * 0.35 + travel * 0.65;
            const T = S * r.thick * (0.5 + 0.5 * ease);          // Sheet thickness grows as it shears out

            // Alpha: quick bloom, then fade as it approaches reach
            const radial = Math.max(0, 1 - (travel / travelSpan) * 0.98);
            const fadeIn = Math.min(1, r.life * 6);
            const baseAlpha = fadeIn * Math.pow(radial, 0.9) * Math.pow(1 - r.life, 0.6) * config.intensity;
            if (baseAlpha <= 0.004) return;

            // Slight spin
            const a0 = r.baseAngle + r.spinDir * r.spinRate * r.life * Math.PI * 0.35;
            const halfSpan = r.span * (0.55 + 0.45 * ease) * 0.5;

            let clipOuter = null, clipInner = null;   // Outline of the outermost layer (used to clip the sweep)

            // Nested contour layers, largest (outer) first
            for (let j = 0; j < L; j++) {
                const f = j / (L - 1);                    // 0 = outermost layer, 1 = innermost
                const layerThick = T * (1 - f * 0.82);
                const layerSpan = halfSpan * (1 - f * 0.42);
                // Inner layers hug the leading edge, so contours follow the outline
                const layerR = R + (T - layerThick) * 0.5;
                const phaseOff = f * 0.9;                 // Contours get slightly different ripple phase

                const outerPts = [];
                const innerPts = [];

                for (let i = 0; i <= N; i++) {
                    const q = i / N;                      // 0..1 across the arc
                    const uu = q * 2 - 1;                 // -1..1
                    const th = a0 + uu * layerSpan;

                    // Crescent envelope: thickest in the middle, pinched at the arc ends
                    const env = Math.pow(Math.max(0, Math.cos(uu * Math.PI * 0.5)), 0.65);

                    // Sine wave on the whole outline (smooth <-> teeth), traveling outward over time
                    const ph = tSec * r.waveTravel * 2 + r.wavePhase + phaseOff;
                    const w1 = shapedWave(uu * r.waveFreq * Math.PI + ph, r.jag, r.style) * r.waveAmp * S;
                    const w2 = Math.sin(uu * r.waveFreq2 * Math.PI + r.wavePhase2 - tSec * 1.7 * r.waveTravel + phaseOff * 2)
                        * r.waveAmp2 * S;
                    // Fine ragged edge detail
                    const rag = (Math.sin(q * 41 + r.seed + tSec * 0.9) * 0.5 +
                        Math.sin(q * 87 - r.seed * 0.7 - tSec * 1.4) * 0.5)
                        * 0.012 * S * config.edgeRoughness;

                    const wave = (w1 + w2) * env + rag;

                    // Clamp to the spawn ring so nothing leaks inside it
                    const rOut = Math.max(r0, layerR + layerThick * 0.5 * env + wave);
                    // Trailing edge uses a different wave phase and lags angularly (shear)
                    const wIn = shapedWave(uu * r.waveFreq * Math.PI * 0.9 + ph + 1.7, r.jag * 0.8, 1 - r.style)
                        * r.waveAmp * S * 0.8 * env;
                    const rIn = Math.max(r0, layerR - layerThick * 0.5 * env + wIn + rag * 0.6);
                    const thIn = th - r.shear * (layerThick / Math.max(1, R)) * (0.5 + 0.5 * env) * 1.4;

                    outerPts.push([cx + Math.cos(th) * rOut, cy + Math.sin(th) * rOut]);
                    innerPts.push([cx + Math.cos(thIn) * Math.max(0, rIn), cy + Math.sin(thIn) * Math.max(0, rIn)]);
                }

                if (j === 0) { clipOuter = outerPts; clipInner = innerPts; }

                // Thin-film color: per-sheet hue + layer offset (+ shift along the arc via gradient)
                const t = r.hue + f * r.cycWid;
                const layerAlpha = baseAlpha * (0.55 + 0.45 * (1 - f * 0.5));

                const gx0 = outerPts[0][0], gy0 = outerPts[0][1];
                const gx1 = outerPts[N][0], gy1 = outerPts[N][1];
                const chord = Math.hypot(gx1 - gx0, gy1 - gy0);

                let fill;
                if (chord > 1) {
                    fill = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
                    const GS = 5;
                    for (let g = 0; g <= GS; g++) {
                        const gp = g / GS;
                        const gc = sampleColor(r.pal, t + (gp - 0.5) * r.cycArc * config.hueSpread);
                        fill.addColorStop(gp, `rgb(${gc[0] | 0},${gc[1] | 0},${gc[2] | 0})`);
                    }
                } else {
                    const gc = sampleColor(r.pal, t);
                    fill = `rgb(${gc[0] | 0},${gc[1] | 0},${gc[2] | 0})`;
                }

                ctx.beginPath();
                ctx.moveTo(outerPts[0][0], outerPts[0][1]);
                for (let i = 1; i <= N; i++) ctx.lineTo(outerPts[i][0], outerPts[i][1]);
                for (let i = N; i >= 0; i--) ctx.lineTo(innerPts[i][0], innerPts[i][1]);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.globalAlpha = layerAlpha;
                ctx.fill();

                // Faint bright rim on the leading edge of the outermost layer
                if (config.edgeLine && j === 0) {
                    const rc = sampleColor(r.pal, t + 0.35);
                    ctx.beginPath();
                    ctx.moveTo(outerPts[0][0], outerPts[0][1]);
                    for (let i = 1; i <= N; i++) ctx.lineTo(outerPts[i][0], outerPts[i][1]);
                    ctx.strokeStyle = `rgb(${rc[0] | 0},${rc[1] | 0},${rc[2] | 0})`;
                    ctx.lineWidth = Math.max(0.8, 1.4 * u);
                    ctx.globalAlpha = baseAlpha * 0.9;
                    ctx.stroke();
                }
            }

            // ---- Light sweep: thin, blurred radial wavefront travelling outward through the sheet ----
            // Runs on its own real-time clock: [ sweep pass (dur) | downtime (gap) ] repeating per sheet.
            if (config.lightSweep && clipOuter) {
                const dur = 1 / Math.max(0.01, config.sweepSpeed * r.sweepRate);
                const gap = Math.max(0, config.sweepDelay) * r.sweepGapScale;
                const cycle = dur + gap;
                const cyc = (realSec + r.sweepPhase * cycle) % cycle;

                if (cyc < dur) {
                    const s = cyc / dur;                                       // 0 -> 1 inner edge to outer edge
                    const sweepEnv = Math.pow(Math.sin(s * Math.PI), 1.2);     // fade in/out at both ends of travel
                    const sweepAlpha = baseAlpha * config.sweepIntensity * sweepEnv * 2.4;

                    if (sweepAlpha > 0.004) {
                        ctx.save();

                        // Clip to the outermost sheet outline
                        ctx.beginPath();
                        ctx.moveTo(clipOuter[0][0], clipOuter[0][1]);
                        for (let i = 1; i <= N; i++) ctx.lineTo(clipOuter[i][0], clipOuter[i][1]);
                        for (let i = N; i >= 0; i--) ctx.lineTo(clipInner[i][0], clipInner[i][1]);
                        ctx.closePath();
                        ctx.clip();

                        ctx.globalCompositeOperation = config.sweepBlend;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';

                        // Radius of the front: sweeps from inside the sheet to outside it
                        const rr = R + (s * 1.3 - 0.65) * T;
                        const bandW = Math.max(1.2 * u, T * config.sweepWidth);

                        // Wavy arc across the full angular extent of the sheet
                        const P = 44;
                        const pts = [];
                        for (let k = 0; k <= P; k++) {
                            const uu = k / P * 2 - 1;
                            const th = a0 + uu * halfSpan * 1.1;
                            const wv = (Math.sin(uu * r.sweepFreq * Math.PI + tSec * 2.4 + r.seed) * 0.5
                                + shapedWave(uu * r.waveFreq * Math.PI + tSec * r.waveTravel * 2 + r.wavePhase, r.jag, r.style) * 0.5)
                                * T * 0.2 * config.sweepWave;
                            const rad = rr + wv;
                            pts.push([cx + Math.cos(th) * rad, cy + Math.sin(th) * rad]);
                        }

                        // Light tint from the sheet's current hue, pushed toward white
                        const tc = sampleColor(r.pal, r.hue + 0.5);
                        const lr = (tc[0] * 0.35 + 255 * 0.65) | 0;
                        const lg = (tc[1] * 0.35 + 255 * 0.65) | 0;
                        const lb = (tc[2] * 0.35 + 55 * 0.65) | 0;

                        // Gradients that fade the front out toward both ends of the arc
                        function endFade(cr, cg, cb) {
                            const gr = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[P][0], pts[P][1]);
                            gr.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
                            gr.addColorStop(0.18, `rgba(${cr},${cg},${cb},0.7)`);
                            gr.addColorStop(0.5, `rgba(${cr},${cg},${cb},1)`);
                            gr.addColorStop(0.82, `rgba(${cr},${cg},${cb},0.7)`);
                            gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
                            return gr;
                        }
                        const tintGrad = endFade(lr, lg, lb);
                        const whiteGrad = endFade(255, 255, 255);

                        // Real gaussian blur via shadowBlur (not affected by ctx transform, so scale by dpr).
                        // Big soft halo -> medium glow -> small glow -> tight white core.
                        const B = config.sweepBlur * config.sweepSoftness * u * dpr;
                        const passes = [
                            { w: 2.6, blur: B * 1.00, a: 0.55, grad: tintGrad, shadow: `rgb(${lr},${lg},${lb})` },
                            { w: 1.6, blur: B * 0.55, a: 0.60, grad: tintGrad, shadow: `rgb(${lr},${lg},${lb})` },
                            { w: 0.9, blur: B * 0.25, a: 0.70, grad: tintGrad, shadow: `rgb(${lr},${lg},${lb})` },
                            { w: 0.35, blur: B * 0.10, a: 0.90, grad: whiteGrad, shadow: '#ffffff' }
                        ];

                        passes.forEach(ps => {
                            ctx.beginPath();
                            ctx.moveTo(pts[0][0], pts[0][1]);
                            for (let k = 1; k <= P; k++) ctx.lineTo(pts[k][0], pts[k][1]);
                            ctx.strokeStyle = ps.grad;
                            ctx.shadowColor = ps.shadow;
                            ctx.shadowBlur = ps.blur;
                            ctx.lineWidth = Math.max(0.6 * u, bandW * ps.w);
                            ctx.globalAlpha = Math.min(1, sweepAlpha * ps.a);
                            ctx.stroke();
                        });

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'transparent';
                        ctx.restore();   // also restores blend mode + clip
                    }
                }
            }
        });

        // ---- Reveal mask: hidden inside revealRadius, fades in over revealFade beyond it ----
        // Emission is untouched; this only controls where it becomes visible.
        if (config.revealRadius > 0) {
            const rv = config.revealRadius * u;
            const rf = Math.max(1, config.revealFade * u);
            const mask = ctx.createRadialGradient(cx, cy, rv, cx, cy, rv + rf);
            mask.addColorStop(0, 'rgba(0,0,0,0)');
            mask.addColorStop(1, 'rgba(0,0,0,1)');
            ctx.globalCompositeOperation = 'destination-in';
            ctx.globalAlpha = 1;
            ctx.fillStyle = mask;
            ctx.fillRect(-180, -180, width + 360, height + 360);
            ctx.globalCompositeOperation = config.blendMode;
        }

        // Subtle emission source glow (turn off with originGlow:false when using spawnRadius / revealRadius)
        if (config.originGlow) {
            const glowR = 38 * u;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
            g.addColorStop(0, 'rgba(255, 244, 210, 0.7)');
            g.addColorStop(0.4, 'rgba(255, 190, 80, 0.3)');
            g.addColorStop(1, 'rgba(255, 150, 40, 0)');
            ctx.beginPath();
            ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.globalAlpha = 0.7;
            ctx.fill();
        }

        ctx.restore();
        rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return {
        stop() {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            const host = cardEl.querySelector('.fx-plasma-canvas-host');
            if (host) host.remove();
            else {
                const canvas = cardEl.querySelector('.fx-plasma-canvas');
                if (canvas) canvas.remove();
            }
        }
    };
}

/* ===================== FX PLASMA LITE (HIGH INTENSITY INITIAL EMISSION) ===================== */
/* ===================== FX PLASMA LITE (HIGH INTENSITY INITIAL EMISSION) ===================== */
function fxPlasmaLite(cardEl, opts = {}) {
    fxEnsureStyles();

    const PALETTES = {
        rainbow: ['#ff3b5c', '#ff9a1f', '#ffe14a', '#4ee08a', '#2fd6e8', '#3d6bff', '#a14dff', '#ff4fd0'],
        solar: ['#f11a9f', '#eef866', '#ffb226', '#ffeb86', '#ff4a62', '#eb42aa'],
        cyanic: ['#19d9ee', '#e8fcff', '#ffffff', '#fff3a0', '#ffee9b', '#8aeaf5'],
        optical: ['#1f4dff', '#6fa4ff', '#ffffff', '#fff6b0', '#ffe14a', '#4f86ff']
    };

    const SWEEP_COLORS = {
        solar: { core: '#ffe875', glow: '#ff0095' },
        rainbow: { core: '#e6e6e6', glow: '#ff4fd0' },
        cyanic: { core: '#b3f5ff', glow: '#00d9ff' },
        optical: { core: '#dbe4ff', glow: '#3d6bff' }
    };

    const config = {
        originX: opts.originX ?? 0.5,
        originY: opts.originY ?? 0.5,
        behind: opts.behind ?? false,
        plumeCount: opts.plumeCount ?? 5,
        minRadius: opts.minRadius ?? 140,
        reach: opts.reach ?? 220,
        speed: opts.speed ?? 1.35,
        lifetime: opts.lifetime ?? 7,
        spinSpeed: opts.spinSpeed ?? 1.5,
        intensity: opts.intensity ?? 1.0,
        blur: opts.blur ?? 4,
        palette: opts.palette ?? 'optical',
        blendMode: opts.blendMode || 'color-dodge',
        lightSweep: opts.lightSweep ?? true,
        sweepSpeed: opts.sweepSpeed ?? 0.2,
        sweepDelay: opts.sweepDelay ?? 4.5,
        fadeIn: opts.fadeIn ?? 1.5
    };

    function getPaletteKey() {
        const p = config.palette;
        if (typeof p === 'string') return PALETTES[p] ? p : 'solar';
        if (Array.isArray(p) && p.length && typeof p[0] === 'string') {
            return PALETTES[p[0]] ? p[0] : 'solar';
        }
        return 'solar';
    }

    const paletteKey = getPaletteKey();
    const palette = PALETTES[paletteKey] || PALETTES.solar;
    const sweepTint = SWEEP_COLORS[paletteKey] || SWEEP_COLORS.solar;

    let container = cardEl.querySelector('.fx-plasma-lite-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'fx-plasma-lite-container';
        Object.assign(container.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: config.behind ? '0' : '2',
            mixBlendMode: config.blendMode,
            filter: config.blur ? `blur(${config.blur}px)` : 'none'
        });
        cardEl.appendChild(container);
    } else {
        container.style.filter = config.blur ? `blur(${config.blur}px)` : 'none';
    }

    if (getComputedStyle(cardEl).overflow === 'hidden' && !config.behind) {
        cardEl.style.overflow = 'visible';
    }

    if (!document.getElementById('fx-plasma-lite-styles')) {
        const style = document.createElement('style');
        style.id = 'fx-plasma-lite-styles';
        style.innerHTML = `
            .fx-plasma-arc-node {
                position: absolute;
                border-radius: 50%;
                background: transparent;
                border: 6px solid transparent;
                box-sizing: border-box;
                overflow: visible;
                will-change: transform, filter, opacity;
            }
            .fx-plasma-glow-edge {
                position: absolute;
                inset: 0;
                border-radius: 50%;
                pointer-events: none;
                border-right-style: solid;
                border-top-style: solid;
                border-left: transparent;
                border-bottom: transparent;
            }
            .fx-plasma-sweep-layer {
                position: absolute;
                inset: -6px;
                border-radius: 50%;
                pointer-events: none;
                filter: blur(5px);
                mix-blend-mode: color-dodge;
            }
        `;
        document.head.appendChild(style);
    }

    let active = true;
    let rafId = null;
    let lastNow = null;
    let startNow = null;

    // Dynamically calculate reach target so it is guaranteed on initial spawn and every loop reset
    function rollMaxRadius(index = -1) {
        const targetReach = config.reach;
        const u = index >= 0 ? (index + Math.random()) / config.plumeCount : Math.random();
        return targetReach * (0.69 + u * 0.45);
    }

    function createArcNode(index) {
        const node = document.createElement('div');
        node.className = 'fx-plasma-arc-node';
        node.style.opacity = '0';

        const glowEdge = document.createElement('div');
        glowEdge.className = 'fx-plasma-glow-edge';
        node.appendChild(glowEdge);

        let sweep = null;
        if (config.lightSweep) {
            sweep = document.createElement('div');
            sweep.className = 'fx-plasma-sweep-layer';
            node.appendChild(sweep);
        }

        container.appendChild(node);

        return {
            element: node,
            glowEdge,
            sweep,
            angle: Math.random() * Math.PI * 2,
            spinDir: Math.random() < 0.5 ? 1 : -1,
            spinRate: (0.6 + Math.random() * 0.9) * config.spinSpeed,
            life: Math.random(),
            lifeRate: 1 / (config.lifetime * (0.7 + Math.random() * 0.6)),
            maxRadius: rollMaxRadius(index),
            colorOffset: Math.floor(Math.random() * palette.length),
            sweepTimer: Math.random() * (1 / config.sweepSpeed)
        };
    }

    const arcs = Array.from({ length: config.plumeCount }, createArcNode);

    function animate(now) {
        if (!active) return;

        if (startNow === null) startNow = now;

        const dt = lastNow === null ? 0.016 : Math.min(0.05, (now - lastNow) * 0.001);
        lastNow = now;

        let fade = 1;
        if (config.fadeIn > 0) {
            const t = Math.min(1, Math.max(0, ((now - startNow) * 0.001) / config.fadeIn));
            fade = t * t * (3 - 2 * t);
        }

        const cardWidth = cardEl.clientWidth || 300;
        const cardHeight = cardEl.clientHeight || 400;
        const cx = cardWidth * config.originX;
        const cy = cardHeight * config.originY;

        arcs.forEach((s) => {
            s.life += dt * s.lifeRate * config.speed;
            if (s.life >= 1) {
                s.life = 0;
                s.angle = Math.random() * Math.PI * 2;
                s.colorOffset = Math.floor(Math.random() * palette.length);
                // Guaranteed reach check on loop reset
                s.maxRadius = rollMaxRadius();
            }

            const ease = 1 - Math.pow(1 - s.life, 2.2);
            const currentRadius = s.maxRadius * ease;

            if (currentRadius < config.minRadius) {
                s.element.style.opacity = '0';
                return;
            }

            const maxVisibleSpan = Math.max(1, s.maxRadius - config.minRadius);
            const radiusProgress = (currentRadius - config.minRadius) / maxVisibleSpan;

            const emissionBurst = Math.pow(1 - Math.min(1, radiusProgress * 2.5), 1.8);
            const fadeInRadial = Math.min(1, radiusProgress * 4.0);
            const fadeOut = Math.pow(1 - s.life, 0.75);

            const intensityMultiplier = 1.0 + (emissionBurst * 0.6);
            const alpha = Math.min(1.0, fadeInRadial * fadeOut * config.intensity * intensityMultiplier) * fade;

            const c1 = palette[s.colorOffset % palette.length];
            const c2 = palette[(s.colorOffset + 1) % palette.length];

            const currentAngle = s.angle + s.spinDir * s.spinRate * s.life * (Math.PI * 0.5);
            const deg = (currentAngle * 180) / Math.PI;

            const shadowOffset = Math.min(currentRadius * 0.5, 32);
            const blurSize = Math.min(currentRadius * 0.2, 14) + (emissionBurst * 10);

            const size = currentRadius * 2;
            const posX = cx - currentRadius;
            const posY = cy - currentRadius;

            Object.assign(s.element.style, {
                width: `${size}px`,
                height: `${size}px`,
                left: `${posX}px`,
                top: `${posY}px`,
                opacity: alpha.toFixed(3),
                transform: `rotate(${deg}deg)`,
                filter: `drop-shadow(${shadowOffset.toFixed(1)}px 0px ${blurSize.toFixed(1)}px ${c1}) drop-shadow(${(shadowOffset * 0.6).toFixed(1)}px 0px ${(blurSize * 1.3).toFixed(1)}px ${c2})`
            });

            const edgeThicknessRight = (2.0 + emissionBurst * 3.5).toFixed(1);
            const edgeThicknessTop = (1.5 + emissionBurst * 2.5).toFixed(1);
            const edgeGlowRadius = (6 + emissionBurst * 12).toFixed(1);

            Object.assign(s.glowEdge.style, {
                borderRightWidth: `${edgeThicknessRight}px`,
                borderTopWidth: `${edgeThicknessTop}px`,
                borderRightColor: c1,
                borderTopColor: c2,
                filter: `drop-shadow(0 0 ${edgeGlowRadius}px ${c1}) drop-shadow(0 0 ${(edgeGlowRadius * 0.5).toFixed(1)}px ${sweepTint.core})`
            });

            if (s.sweep) {
                s.sweepTimer += dt;
                const dur = 1 / config.sweepSpeed;
                const totalCycle = dur + config.sweepDelay;
                const cyc = s.sweepTimer % totalCycle;

                if (cyc < dur) {
                    const sweepProgress = cyc / dur;
                    const sweepAlpha = Math.sin(sweepProgress * Math.PI);

                    Object.assign(s.sweep.style, {
                        display: 'block',
                        opacity: (sweepAlpha * 0.9).toFixed(2),
                        boxShadow: `inset -4px 0 10px 1px ${sweepTint.core}, 4px 0 12px ${sweepTint.glow}`,
                        transform: `scale(${(0.4 + sweepProgress * 0.7).toFixed(2)})`
                    });
                } else {
                    s.sweep.style.display = 'none';
                }
            }
        });

        rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);

    return {
        stop() {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (container) container.remove();
        }
    };
}
/* ===================== CORE PARTICLE ENGINE ===================== */
function fxParticleEngine(cardEl, opts = {}) {
    fxEnsureStyles();

    const config = {
        canvasClass: opts.canvasClass || 'fx-particle-canvas',
        originX: opts.originX ?? 0.5,
        originY: opts.originY ?? 0.5,
        behind: opts.behind ?? false,
        count: opts.count ?? 48,
        spread: opts.spread ?? 200,             // Total radial outward drift distance (in px)
        speed: opts.speed ?? 0.4,              // Speed scale factor
        lifetime: opts.lifetime ?? 4,
        turbulence: opts.turbulence ?? 1.0,
        coreColor: opts.coreColor || '#ffffff',
        haloColor: opts.haloColor || 'rgba(255, 255, 255, 0.8)',
        shadowColor: opts.shadowColor || '#ffffff',
        flicker: opts.flicker ?? true,
        flickerSpeed: opts.flickerSpeed ?? 1.0,
        flickerMin: opts.flickerMin ?? 0.35,
        shape: opts.shape || 'ember',          // 'ember' | 'crossStar'
        spin: opts.spin ?? false,
        maxSpinSpeed: opts.maxSpinSpeed ?? 1.5,
        minRadius: opts.minRadius ?? 0,        // Emission inner boundary (in px)
        minReveal: opts.minReveal ?? 0,        // Visibility threshold distance (in px)
        fadeIn: opts.fadeIn ?? 1.5             // Seconds for the whole effect to fade in when called
    };

    let active = true;
    let rafId = null;
    let startTime = null;

    const { ctx, width, height, u } = _fxGetOrCreateCanvas(cardEl, config.canvasClass, 140, config.behind);

    function spawnParticle(uScale, isInitial = false) {
        const variance = 0.7 + Math.random() * 0.6;
        const targetLifetimeSec = Math.max(0.1, config.lifetime * variance);
        const decayRate = 1 / (targetLifetimeSec * 60);

        // Evenly stagger initial life between 0.0 and 0.8 so they don't all pop in at once
        const initialLife = isInitial ? Math.random() * 0.8 : 0;

        // Speed multiplier for speed variance per particle
        const speedMult = (0.6 + Math.random() * 0.8) * config.speed;

        return {
            angle: Math.random() * Math.PI * 2,
            speedMult: speedMult,
            coreRadius: (0.8 + Math.random() * 1.2) * uScale,
            haloScale: 2.5 + Math.random() * 2.0,
            life: initialLife,
            decay: decayRate,
            seed: Math.random() * 1000,
            flickerSeed: Math.random() * 100,
            flickerFreq: (0.012 + Math.random() * 0.02) * config.flickerSpeed,
            rotation: Math.random() * Math.PI * 2,
            spinRate: (Math.random() - 0.5) * config.maxSpinSpeed * 0.02
        };
    }

    let particles = Array.from({ length: config.count }, () => spawnParticle(u, true));

    // --- Shape Drawing Functions ---
    function drawEmber(ctx, px, py, cR, hR, alpha, u) {
        ctx.beginPath();
        ctx.arc(px, py, hR, 0, Math.PI * 2);
        const haloGrad = ctx.createRadialGradient(px, py, 0, px, py, hR);
        haloGrad.addColorStop(0, config.haloColor);
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.globalAlpha = alpha * 0.7;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, cR, 0, Math.PI * 2);
        ctx.fillStyle = config.coreColor;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = config.shadowColor;
        ctx.shadowBlur = 4 * u;
        ctx.fill();
    }

    function draw8PointStar(ctx, px, py, cR, hR, alpha, u, rotation) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rotation);

        const haloGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, hR * 1.5);
        haloGrad.addColorStop(0, config.haloColor);
        haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, hR * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = config.coreColor;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = config.shadowColor;
        ctx.shadowBlur = 6 * u;

        const pLen = cR * 3.8;
        const pTh = cR * 0.45;
        const dLen = cR * 1.9;
        const dTh = cR * 0.35;

        ctx.beginPath();
        ctx.moveTo(0, -pLen);
        ctx.lineTo(pTh, -pTh);
        ctx.lineTo(pLen, 0);
        ctx.lineTo(pTh, pTh);
        ctx.lineTo(0, pLen);
        ctx.lineTo(-pTh, pTh);
        ctx.lineTo(-pLen, 0);
        ctx.lineTo(-pTh, -pTh);
        ctx.fill();

        ctx.beginPath();
        ctx.rotate(Math.PI / 4);
        ctx.moveTo(0, -dLen);
        ctx.lineTo(dTh, -dTh);
        ctx.lineTo(dLen, 0);
        ctx.lineTo(dTh, dTh);
        ctx.lineTo(0, dLen);
        ctx.lineTo(-dTh, dTh);
        ctx.lineTo(-dLen, 0);
        ctx.lineTo(-dTh, -dTh);
        ctx.fill();

        ctx.restore();
    }

    function render(timestamp) {
        if (!active) return;
        if (!startTime) startTime = timestamp;

        const elapsed = timestamp - startTime;

        // Global fade-in envelope (smoothstep 0 -> 1 over config.fadeIn seconds)
        let fade = 1;
        if (config.fadeIn > 0) {
            const t = Math.min(1, Math.max(0, (elapsed * 0.001) / config.fadeIn));
            fade = t * t * (3 - 2 * t);
        }

        const { ctx, width, height, u: currentU } = _fxGetOrCreateCanvas(cardEl, config.canvasClass, 140, config.behind);
        ctx.clearRect(-140, -140, width + 280, height + 280);

        const cx = width * config.originX;
        const cy = height * config.originY;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        particles.forEach((p, idx) => {
            p.life += p.decay;
            if (p.life >= 1) {
                particles[idx] = spawnParticle(currentU, false);
                return;
            }

            if (config.spin) {
                p.rotation += p.spinRate;
            }

            // Calculate distance smooth-scaled to particle's normalized lifetime
            const currentDistance = p.life * (config.spread * currentU * p.speedMult);

            const minRadScaled = config.minRadius * currentU;
            const travel = minRadScaled + currentDistance;

            const minRevealScaled = config.minReveal * currentU;
            if (travel < minRevealScaled) return;

            const turbX = Math.sin(elapsed * 0.002 + p.seed) * (8 * config.turbulence * currentU);
            const turbY = Math.cos(elapsed * 0.0025 + p.seed) * (8 * config.turbulence * currentU);

            const px = cx + Math.cos(p.angle) * travel + turbX;
            const py = cy + Math.sin(p.angle) * travel + turbY;

            // Smooth bell curve alpha fade: fades in at spawn, fades out at max distance
            const baseAlpha = Math.sin(p.life * Math.PI);

            let flickerMod = 1.0;
            if (config.flicker) {
                const t = elapsed * p.flickerFreq + p.flickerSeed;
                const rawFlicker = (Math.sin(t) * 0.5 + Math.sin(t * 2.33) * 0.3 + Math.cos(t * 5.71) * 0.2);
                flickerMod = (1 - config.flickerMin) + rawFlicker * config.flickerMin;
            }

            const alpha = Math.max(0, baseAlpha * flickerMod) * fade;
            if (alpha <= 0.001) return;

            const cR = p.coreRadius;
            const hR = cR * p.haloScale;

            if (config.shape === 'crossStar') {
                draw8PointStar(ctx, px, py, cR, hR, alpha, currentU, p.rotation);
            } else {
                drawEmber(ctx, px, py, cR, hR, alpha, currentU);
            }
        });

        ctx.restore();
        rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return {
        stop() {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            const host = cardEl.querySelector(`.${config.canvasClass}-host`);
            if (host) host.remove();
            else {
                const canvas = cardEl.querySelector(`.${config.canvasClass}`);
                if (canvas) canvas.remove();
            }
        }
    };
}

/* ===================== PRESET WRAPPERS ===================== */

function fxFiery(cardEl, opts = {}) {
    // Use "solar" in fxPlasmaLite for Stellar and Superstellar rarity
    return fxParticleEngine(cardEl, {
        canvasClass: 'fx-fiery-canvas',
        shape: 'ember',
        spin: false,
        turbulence: 1.2,
        spread: 250,             // Reasonable max radial drift distance
        speed: 0.5,
        coreColor: '#ffffff',
        haloColor: 'rgba(255, 140, 0, 0.8)',
        shadowColor: '#ffaa00',
        minRadius: 100,
        ...opts
    });
}

function fxStarry(cardEl, opts = {}) {
    // Use "optical" in fxPlasmaLite for Cosmic rarity
    return fxParticleEngine(cardEl, {
        canvasClass: 'fx-starry-canvas',
        shape: 'crossStar',
        spin: true,
        lifetime: 2.5,
        maxSpinSpeed: 1.2,
        turbulence: 0.8,
        spread: 300,              // Realistic pixel radius for card aura
        speed: 0.3,
        flickerMin: 0.45,
        coreColor: '#f0fbff',
        haloColor: 'rgba(80, 200, 255, 0.85)',
        shadowColor: '#00e1ff',
        minRadius: 120,
        ...opts
    });
}

/* ===================== PANEL BINDING =====================

 * ======================================================== */

const FX_PANEL_HTML = `
    <div class="controlTitle">CARD FX</div>
    <div class="fx-row">
    <button type="button" id="btnSignalFx">Signal CRT</button>
      <button type="button" id="btnPFlare">Prisma Flare</button>
        <button type="button" id="btnFlare">Lens Flare</button>
          <button type="button" id="btnOFlare">Optical Flare</button>
              <button type="button" id="btnAFlare">Anamorphic Flare</button>
        <button type="button" id="btnPulse">Pulse</button>
        <button type="button" id="btnLightning">Lightning</button>
        <button type="button" id="btnGas">Gas</button>
        <button type="button" id="btnLeak">LensLeak</button>
        <button type="button" id="btnBH">Black hole</button>
        <button type="button" id="btnSolar">Solar Flare</button>
        <button type="button" id="btnHeatWave">Heatwave</button>
        <button type="button" id="btnPlasma">Plasma</button>
        <button type="button" id="btnPlasmaLite">Plasma Lite</button>
        <button type="button" id="btnFiery">Fiery Particles</button>
        <button type="button" id="btnStarry">Starry Particles</button>
    </div>
    <label>Black hole ms <span id="fxBHDurVal">3400</span>
        <input id="fxBHDur" type="range" min="1200" max="8000" step="100" value="3400"></label>
    <label><input type="checkbox" id="fxLoop"> Loop pulses</label>
    <label><input type="checkbox" id="fxOnSignal" checked> Flare on Noise &rarr; Signal</label>
    <label>Flare ms <span id="fxDurVal">900</span>
        <input id="fxDur" type="range" min="300" max="2500" step="50" value="900"></label>
    <label>Lightning Delay <span id="fxFreqVal">2000</span>ms
        <input id="fxFreq" type="range" min="300" max="4000" step="100" value="2000"></label>
    <button type="button" id="btnFxStop">Clear</button>`;


/* ===================== PANEL BINDING ===================== */
function fxBindPanel() {
    fxEnsureStyles();
    let p = document.getElementById('fxControls');

    if (!p) {
        p = document.createElement('div');
        p.id = 'fxControls';
        p.innerHTML = FX_PANEL_HTML;
        document.body.appendChild(p);
    } else if (!p.querySelector('#btnStarry')) {
        p.innerHTML = FX_PANEL_HTML;
    }

    const $ = id => document.getElementById(id);

    if ($('fxDur')) $('fxDur').oninput = e => { $('fxDurVal').textContent = e.target.value; };
    if ($('fxFreq')) $('fxFreq').oninput = e => {
        $('fxFreqVal').textContent = e.target.value;
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.lightning) {
            active.lightning.setFrequency(Number(e.target.value));
        }
    };
    if ($('btnSignalFx')) $('btnSignalFx').onclick = () => fxSignal(fxTarget());
    if ($('btnPFlare')) $('btnPFlare').onclick = () => fxPrismaFlare(fxTarget());
    if ($('btnFlare')) $('btnFlare').onclick = () => fxLensFlare(fxTarget());
    if ($('btnOFlare')) $('btnOFlare').onclick = () => fxOpticalFlare(fxTarget());
    if ($('btnAFlare')) $('btnAFlare').onclick = () => fxAnamorphicFlare(fxTarget());
    if ($('btnPulse')) $('btnPulse').onclick = () => fxPulse(fxTarget(), { loop: $('fxLoop').checked });
    if ($('btnLightning')) $('btnLightning').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.lightning) {
            active.lightning.stop();
            delete active.lightning;
            $('btnLightning').textContent = 'Lightning';
        } else {
            fxLightning(card, { frequency: Number($('fxFreq').value) }); $('btnLightning').textContent = 'Stop Lightning';
        }
    };
    if ($('btnGas')) $('btnGas').onclick = () => fxGas(fxTarget());
    if ($('btnBH')) $('btnBH').onclick = () => {
        const target = fxTarget();
        if (!target) return;

        // Check if either the target or its card wrapper has the 'stellar' class
        const isStellar = target.classList.contains('stellar') || !!target.closest('.card.stellar');
const ringColor = isStellar ?
  '#ffe2b0' : '#6ec0e0';
        const glowColors = isStellar
            ? ['#ffa769', '#6bfd7f']            // Orange/Green for Stellar (Rarity 1, 2)
            : ['#ffffff', '#2fd6e8'];           // Cyan/white for non-Stellar

        const streakColors = isStellar
            ? ['#ffffff', '#ffef95', '#fff4bb', '#7fe8ff']
            : ['#ffffff', '#e8ffec', '#8aeaf5', '#19d9ee'];

        fxBlackHole(target, {
                        ringColor,
            duration: 1600,
            glowColors,
            streakColors
        });
    };

    if ($('btnFxStop')) $('btnFxStop').onclick = () => fxClear(fxTarget());
    if ($('btnLeak')) $('btnLeak').onclick = () => fxLensLeak(fxTarget());

    if ($('btnSolar')) $('btnSolar').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.solar) {
            active.solar.stop();
            delete active.solar;
            $('btnSolar').textContent = 'Solar Flare';
        } else {
            const inst = fxSolarFlare(card);
            if (!_fxActiveInstances.has(card)) _fxActiveInstances.set(card, {});
            _fxActiveInstances.get(card).solar = inst;
            $('btnSolar').textContent = 'Stop Solar';
        }
    };

    if ($('btnHeatWave')) $('btnHeatWave').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.heatwave) {
            active.heatwave.stop();
            delete active.heatwave;
            $('btnHeatWave').textContent = 'Heatwave';
        } else {
            const inst = fxHeatStrands(card);
            if (!_fxActiveInstances.has(card)) _fxActiveInstances.set(card, {});
            _fxActiveInstances.get(card).heatwave = inst;
            $('btnHeatWave').textContent = 'Stop Heatwave';
        }
    };

    if ($('btnPlasma')) $('btnPlasma').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.Plasma) {
            active.Plasma.stop();
            delete active.Plasma;
            $('btnPlasma').textContent = 'Plasma';
        } else {
            const inst = fxPlasma(card);
            if (!_fxActiveInstances.has(card)) _fxActiveInstances.set(card, {});
            _fxActiveInstances.get(card).Plasma = inst;
            $('btnPlasma').textContent = 'Stop Plasma';
        }
    };

    if ($('btnPlasmaLite')) $('btnPlasmaLite').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.PlasmaLite) {
            active.PlasmaLite.stop();
            delete active.PlasmaLite;
            $('btnPlasmaLite').textContent = 'PlasmaLite';
        } else {
            const inst = fxPlasmaLite(card);
            if (!_fxActiveInstances.has(card)) _fxActiveInstances.set(card, {});
            _fxActiveInstances.get(card).PlasmaLite = inst;
            $('btnPlasmaLite').textContent = 'Stop PlasmaLite';
        }
    };

    if ($('btnFiery')) $('btnFiery').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.fiery) {
            active.fiery.stop();
            delete active.fiery;
            $('btnFiery').textContent = 'Fiery Particles';
        } else {
            const inst = fxFiery(card);
            if (!_fxActiveInstances.has(card)) _fxActiveInstances.set(card, {});
            _fxActiveInstances.get(card).fiery = inst;
            $('btnFiery').textContent = 'Stop Fiery';
        }
    };

    if ($('btnStarry')) $('btnStarry').onclick = () => {
        const card = fxTarget();
        const active = _fxActiveInstances?.get(card);
        if (active?.starry) {
            active.starry.stop();
            delete active.starry;
            $('btnStarry').textContent = 'Starry Particles';
        } else {
            const inst = fxStarry(card);
            if (!_fxActiveInstances.has(card)) _fxActiveInstances.set(card, {});
            _fxActiveInstances.get(card).starry = inst;
            $('btnStarry').textContent = 'Stop Starry';
        }
    };
}

function fxTarget() {
    return document.querySelector('.card'); // or your active card selector
}

function fxUfo() {
    return document.querySelector('.card .ufo_small'); // or your active card selector
}


function fxFlareMs() {
    const el = document.getElementById('fxDur');
    return el ? Number(el.value) : 900;
}


/* ===================== EXPORT SHIM (added for cartoon-reorbit) =====================
   card-fx.js is loaded as a classic script; top-level `const`/`let` aren't reachable from app code,
   so expose what lib/gtoonCardEngine.js needs. Everything above this block is the unmodified prototype. */
window.GtoonFx = {
    fxSignal, fxNoise, fxHeatshieldNeutral, fxHeatshieldRestore,
    fxPrismaFlare, fxLensFlare, fxOpticalFlare, fxAnamorphicFlare, fxPulse, fxGas, fxLensLeak, fxBlackHole,
    fxLightning, fxSolarFlare, fxHeatStrands, fxPlasma, fxPlasmaLite, fxFiery, fxStarry,
    fxClear, fxEnsureStyles, fxEnsureAeroshell,
    active: _fxActiveInstances
};
