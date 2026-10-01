import { gsap } from 'gsap';

const FADE_S = 0.8;             // overlay + audio fade-out duration
const START_TIMEOUT_MS = 8000;  // never trap the user: if playback hasn't started by then, move on

// false: if unmuted autoplay is blocked, start MUTED and offer a "Sound on" button.
// true:  if unmuted autoplay is blocked, show "Click to Start" so the intro plays WITH sound.
const REQUIRE_TAP_FOR_SOUND = false;

export class Intro {
    constructor({ overlay = document.getElementById('intro-overlay') } = {}) {
        this.overlay = overlay;
        this.video = overlay?.querySelector('#intro-video') ?? null;
        this.skipBtn = overlay?.querySelector('#intro-skip') ?? null;
        this.soundBtn = overlay?.querySelector('#intro-sound') ?? null;
        this.startGate = overlay?.querySelector('#intro-start') ?? null;
        this.startBtn = overlay?.querySelector('#intro-start-btn') ?? null;

        // Everything the intro covers; kept inert so keyboard users can't trigger it underneath
        this.behind = ['site-nav', 'app']
            .map((id) => document.getElementById(id))
            .filter(Boolean);

        this.abort = new AbortController();
        this.started = false;
        this.finished = false;
        this.startTimer = 0;
    }

    init() {
        if (!this.overlay || !this.video) return this;
        const { signal } = this.abort;

        // Locked until the loader is gone: the page AND the intro's own controls
        this.behind.forEach((el) => { el.inert = true; });
        this.overlay.inert = true;

        this.skipBtn?.addEventListener('click', this.dismiss, { signal });
        this.soundBtn?.addEventListener('click', this.unmute, { signal });
        this.startBtn?.addEventListener('click', this.onStartClick, { signal });
        this.video.addEventListener('ended', this.dismiss, { signal });
        this.video.addEventListener('error', this.dismiss, { signal }); // 404 / undecodable: skip the intro
        this.video.addEventListener('playing', this.onPlaying, { signal });
        this.video.addEventListener('volumechange', this.syncSoundButton, { signal });
        document.addEventListener('keydown', this.onKeydown, { signal });

        if (document.getElementById('global-loader')) {
            document.addEventListener('loader:complete', this.begin, { once: true, signal });
        } else {
            this.begin(); // no loader on the page, so nothing to wait for
        }
        return this;
    }

    /* ---------- Start-up ---------- */

    begin = async () => {
        if (this.started || this.finished) return;
        this.started = true;

        // Loader.dispose() just cleared its own scroll lock, so take it over
        document.documentElement.style.overflow = 'hidden';
        this.overlay.inert = false;
        this.skipBtn?.focus({ preventScroll: true });
        this.startTimer = setTimeout(this.dismiss, START_TIMEOUT_MS);

        await this.start();
    };

    async start() {
        // 1) Best case: unmuted autoplay is allowed
        if ((await this.tryPlay(false)) || this.finished) return;

        // 2) Blocked: fall back to muted playback (a "Sound on" button appears)
        if (!REQUIRE_TAP_FOR_SOUND) {
            if ((await this.tryPlay(true)) || this.finished) return;
        }

        // 3) Still blocked (or sound required): ask for a tap, which counts as a user gesture
        this.showStartGate();
    }

    async tryPlay(muted) {
        this.video.muted = muted;
        try {
            await this.video.play();
            return true;
        } catch {
            return false; // NotAllowedError (policy), AbortError (dismissed mid-load), etc.
        }
    }

    /* ---------- UI state ---------- */

    onPlaying = () => {
        clearTimeout(this.startTimer);
        this.hideStartGate();
        this.syncSoundButton();
    };

    syncSoundButton = () => {
        const show = !this.video.paused && this.video.muted;
        this.soundBtn?.classList.toggle('hidden', !show);
    };

    unmute = () => {
        this.video.muted = false; // volumechange then hides the button
    };

    showStartGate() {
        clearTimeout(this.startTimer); // waiting on the user, not on the network
        if (!this.startGate) return this.dismiss();
        this.startGate.classList.remove('hidden');
        this.startGate.classList.add('flex');
        this.startBtn?.focus({ preventScroll: true });
    }

    hideStartGate() {
        this.startGate?.classList.add('hidden');
        this.startGate?.classList.remove('flex');
    }

    onStartClick = async () => {
        this.hideStartGate();
        this.startTimer = setTimeout(this.dismiss, START_TIMEOUT_MS);
        if (!(await this.tryPlay(false)) && !this.finished) this.dismiss();
    };

    onKeydown = (event) => {
        if (event.key === 'Escape' && this.started) this.dismiss();
    };

    /* ---------- Exit ---------- */

    dismiss = () => {
        if (this.finished) return;
        this.finished = true;

        clearTimeout(this.startTimer);
        this.hideStartGate();
        this.soundBtn?.classList.add('hidden');
        if (this.skipBtn) this.skipBtn.disabled = true;

        gsap
            .timeline({ onComplete: this.cleanup })
            .to(this.overlay, { opacity: 0, duration: FADE_S, ease: 'power2.inOut' }, 0)
            .to(this.video, { volume: 0, duration: FADE_S, ease: 'none' }, 0); // audio fades with the picture
    };

    cleanup = () => {
        this.abort.abort(); // drops every listener, including a pending loader:complete

        // Release the buffered data and decoder, then drop the node
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        this.overlay.remove();

        this.behind.forEach((el) => { el.inert = false; });
        if (this.started) document.documentElement.style.overflow = ''; // only release a lock we took

        document.dispatchEvent(new CustomEvent('intro:complete'));
    };
}