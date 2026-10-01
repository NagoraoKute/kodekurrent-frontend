import { gsap } from 'gsap';

const BASE_DELAY_MS = 28;   // ~36 characters per second
const START_DELAY_MS = 250; // let the pop-in land before the first letter
const PAUSE_MS = { '.': 220, '!': 220, '?': 220, ',': 90, ';': 90, ':': 90 }; // extra beat after punctuation

export class OakChat {
    constructor(root = document.getElementById('oak-chat')) {
        this.root = root;
        this.toggleEl = root?.querySelector('[data-oak-toggle]') ?? null;
        this.closeEl = root?.querySelector('[data-oak-close]') ?? null;
        this.boxEl = root?.querySelector('[data-oak-box]') ?? null;
        this.ghostEl = root?.querySelector('[data-oak-ghost]') ?? null;
        this.typedEl = root?.querySelector('[data-oak-typed]') ?? null;
        this.srEl = root?.querySelector('[data-oak-sr]') ?? null;
        this.badgeEl = root?.querySelector('[data-oak-badge]') ?? null;

        this.message = '';
        this.node = null;       // the single text node that typing mutates
        this.isOpen = false;
        this.hasTyped = false;  // the message types out once; later opens show it in full
        this.job = null;        // current typing job, or null when idle
        this.raf = 0;
        this.abort = new AbortController();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    init() {
        if (!this.root || !this.toggleEl || !this.boxEl || !this.ghostEl || !this.typedEl) return this;
        const { signal } = this.abort;

        this.message = this.ghostEl.textContent.trim();
        this.node = document.createTextNode('');
        this.typedEl.replaceChildren(this.node);

        this.toggleEl.addEventListener('click', this.toggle, { signal });
        this.closeEl?.addEventListener('click', this.close, { signal });
        document.addEventListener('keydown', this.onKeydown, { signal });

        // The intro and loader overlays block the mouse, but not keyboard focus.
        // Keep the widget out of the tab order until the intro is gone.
        if (document.getElementById('intro-overlay')) {
            this.root.inert = true;
            document.addEventListener(
                'intro:complete',
                () => { this.root.inert = false; },
                { once: true, signal }
            );
        }
        return this;
    }

    /* ---------- Open / close ---------- */

    toggle = () => (this.isOpen ? this.close() : this.open());

    open = () => {
        if (this.isOpen) return;
        this.isOpen = true;

        this.toggleEl.setAttribute('aria-expanded', 'true');
        this.badgeEl?.classList.add('is-seen'); // the "!" nudge has done its job

        gsap.killTweensOf(this.boxEl); // rapid toggling can't leave a stale tween running
        this.boxEl.classList.remove('hidden');
        if (this.reducedMotion.matches) {
            gsap.set(this.boxEl, { autoAlpha: 1, scale: 1 });
        } else {
            gsap.fromTo(
                this.boxEl,
                { autoAlpha: 0, scale: 0.6, transformOrigin: '90% 100%' }, // grows out of the avatar
                { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(1.7)', clearProps: 'transform' }
            );
        }

        this.announce();
        if (this.hasTyped) this.showFull();
        else this.startTyping();
    };

    close = () => {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.finishTyping(); // no typing loop running behind a closed box
        this.toggleEl.setAttribute('aria-expanded', 'false');

        gsap.killTweensOf(this.boxEl);
        if (this.reducedMotion.matches) {
            gsap.set(this.boxEl, { autoAlpha: 0 });
            this.boxEl.classList.add('hidden');
            return;
        }
        gsap.to(this.boxEl, {
            autoAlpha: 0,
            scale: 0.8,
            transformOrigin: '90% 100%',
            duration: 0.18,
            ease: 'power2.in',
            onComplete: () => this.boxEl.classList.add('hidden'), // skipped if a re-open killed this tween
        });
    };

    onKeydown = (event) => {
        if (event.key === 'Escape' && this.isOpen) {
            this.close();
            this.toggleEl.focus();
        }
    };

    /** Re-announces the message to screen readers (clear, then set, so repeats are spoken). */
    announce() {
        if (!this.srEl) return;
        this.srEl.textContent = '';
        requestAnimationFrame(() => { this.srEl.textContent = this.message; });
    }

    /* ---------- Typewriter ---------- */

    startTyping() {
        this.hasTyped = true;

        if (this.reducedMotion.matches) {
            this.showFull();
            return;
        }

        // Precompute when each character appears; punctuation adds a short pause
        const chars = Array.from(this.message);
        const times = [];
        let t = START_DELAY_MS;
        for (const ch of chars) {
            times.push(t);
            t += BASE_DELAY_MS + (PAUSE_MS[ch] ?? 0);
        }

        this.cancelLoop(); // at most one loop is ever alive
        this.node.data = '';
        this.job = { chars, times, shown: 0, start: null };
        this.root.classList.remove('is-done');
        this.root.classList.add('is-typing');
        this.raf = requestAnimationFrame(this.tick);
    }

    tick = (now) => {
        const job = this.job;
        if (!job) return;

        job.start ??= now;
        const elapsed = now - job.start;

        let count = job.shown;
        while (count < job.chars.length && job.times[count] <= elapsed) count++;

        if (count !== job.shown) {
            job.shown = count;
            this.node.data = job.chars.slice(0, count).join('');
        }

        if (count >= job.chars.length) {
            this.cancelLoop();
            this.root.classList.add('is-done'); // shows the blinking ▼
            return;
        }
        this.raf = requestAnimationFrame(this.tick);
    };

    /** Jump to the full message and stop the loop. */
    finishTyping() {
        if (!this.job) return;
        this.showFull();
    }

    showFull() {
        this.cancelLoop();
        this.node.data = this.message;
        this.root.classList.add('is-done');
    }

    cancelLoop() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.job = null;
        this.root?.classList.remove('is-typing');
    }

    destroy() {
        this.abort.abort();
        this.cancelLoop();
        gsap.killTweensOf(this.boxEl);
    }
}