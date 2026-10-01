const BASE_DELAY_MS = 22; // ~45 characters per second
const PAUSE_MS = { '.': 220, '!': 220, '?': 220, ',': 90, ';': 90, ':': 90 }; // extra beat after punctuation

export class Pokedex {
    constructor(root = document.querySelector('[data-pokedex]')) {
        this.root = root;
        this.buttons = root ? [...root.querySelectorAll('[data-faq]')] : [];
        this.titleEl = root?.querySelector('[data-pokedex-title]') ?? null;
        this.numberEl = root?.querySelector('[data-pokedex-number]') ?? null;
        this.ghostEl = root?.querySelector('[data-pokedex-ghost]') ?? null;
        this.typedEl = root?.querySelector('[data-pokedex-typed]') ?? null;
        this.srEl = root?.querySelector('[data-pokedex-sr]') ?? null;

        this.node = null;        // the single text node that typing mutates
        this.activeIndex = -1;
        this.job = null;         // current typing job, or null when idle
        this.raf = 0;
        this.io = null;
        this.abort = new AbortController();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    init() {
        if (!this.root || !this.typedEl || this.buttons.length === 0) return this;
        const { signal } = this.abort;

        // One persistent text node: typing only changes its .data and never rebuilds DOM
        this.node = document.createTextNode(this.typedEl.textContent.trim());
        this.typedEl.replaceChildren(this.node);

        this.root.addEventListener('click', this.handleClick, { signal });
        this.root.addEventListener('keydown', this.handleKeydown, { signal });

        // If the section is swapped out mid-sentence, finish instantly instead of
        // running a rAF loop in the background (claude.md: no hidden CPU use).
        this.io = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) this.finishTyping();
        });
        this.io.observe(this.root);

        return this;
    }

    handleClick = (event) => {
        const button = event.target.closest('[data-faq]');
        if (!button || !this.root.contains(button)) return;
        this.select(this.buttons.indexOf(button));
    };

    /** Up/Down move focus through the question list (Enter/Space activate natively). */
    handleKeydown = (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const current = this.buttons.indexOf(document.activeElement);
        if (current === -1) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.buttons[(current + step + this.buttons.length) % this.buttons.length].focus();
    };

    select(index) {
        if (index < 0) return;

        // Re-clicking the open entry mid-sentence completes it, like pressing A in the games
        if (index === this.activeIndex) {
            this.finishTyping();
            return;
        }
        this.activeIndex = index;

        this.buttons.forEach((button, i) => {
            const isActive = i === index;
            button.classList.toggle('is-active', isActive);
            if (isActive) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
        });

        const button = this.buttons[index];
        const title = button.dataset.title ?? button.textContent.trim();
        const entry = button.dataset.entry ?? String(index + 1).padStart(3, '0');
        const answer = button.dataset.answer ?? '';

        if (this.titleEl) this.titleEl.textContent = title;
        if (this.numberEl) this.numberEl.textContent = `No. ${entry}`;
        this.type(answer, `${title}. ${answer}`);
    }

    /* ---------- Typewriter ---------- */

    type(text, announcement = text) {
        // Cancelling first guarantees at most one loop is ever alive, so rapid clicks can't interleave text
        this.cancel();

        if (this.ghostEl) this.ghostEl.textContent = text; // reserves the final height (no layout jump)
        if (this.srEl) this.srEl.textContent = announcement;

        if (this.reducedMotion.matches) {
            this.node.data = text;
            return;
        }

        // Precompute when each character appears; punctuation adds a short pause
        const chars = Array.from(text);
        const times = [];
        let t = 0;
        for (const ch of chars) {
            times.push(t);
            t += BASE_DELAY_MS + (PAUSE_MS[ch] ?? 0);
        }

        this.node.data = '';
        this.job = { chars, times, shown: 0, start: null };
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
            this.cancel(); // done
            return;
        }
        this.raf = requestAnimationFrame(this.tick);
    };

    finishTyping() {
        if (!this.job) return;
        this.node.data = this.job.chars.join('');
        this.cancel();
    }

    cancel() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.job = null;
        this.root?.classList.remove('is-typing');
    }

    destroy() {
        this.abort.abort();
        this.cancel();
        this.io?.disconnect();
    }
}