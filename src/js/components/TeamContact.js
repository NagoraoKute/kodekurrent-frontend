import VanillaTilt from 'vanilla-tilt';

/**
 * Where the contact form POSTs (Formspree, Web3Forms, a Google Apps Script URL, ...).
 * LEFT EMPTY: demo mode. The retro "Message sent!" box shows, but NOTHING IS DELIVERED.
 */
const ENDPOINT = '';

const TILT = {
    max: 14,
    speed: 400,
    scale: 1.05,
    perspective: 900,
    glare: false,     // the holographic foil is our own CSS (it follows --mx/--my below)
    gyroscope: false, // no device-orientation listeners on 20 cards
};

export class TeamContact {
    constructor(root = document.getElementById('contact')) {
        this.root = root;
        this.marquee = root?.querySelector('[data-marquee]') ?? null;
        this.track = root?.querySelector('[data-marquee-track]') ?? null;
        this.group = root?.querySelector('[data-marquee-group]') ?? null;
        this.form = root?.querySelector('[data-contact-form]') ?? null;
        this.statusEl = root?.querySelector('[data-contact-status]') ?? null;
        this.submitBtn = root?.querySelector('[data-contact-submit]') ?? null;

        this.cards = [];
        this.sending = false;
        this.abort = new AbortController();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    init() {
        if (!this.root) return this;
        this.initMarquee();
        this.initTilt();
        this.initForm();
        return this;
    }

    /* ---------- Marquee ---------- */

    initMarquee() {
        if (!this.marquee || !this.track || !this.group) return;

        if (!this.reducedMotion.matches) {
            // A second copy makes the loop seamless: translateX(-50%) lands exactly where copy 1 began.
            // The copy is hidden from assistive tech and out of the tab order (not `inert`, which
            // would also kill its hover and tilt).
            const copy = this.group.cloneNode(true);
            copy.removeAttribute('data-marquee-group');
            copy.setAttribute('aria-hidden', 'true');
            copy.querySelectorAll('[tabindex]').forEach((el) => el.removeAttribute('tabindex'));
            this.track.appendChild(copy);
            this.marquee.classList.add('is-running'); // CSS starts the animation
        }

        // Tabbing to a card pauses the marquee, and the browser scrolls the card into view.
        // Reset that scroll offset when focus leaves so the loop can't drift out of alignment.
        this.marquee.addEventListener(
            'focusout',
            (event) => {
                if (!this.marquee.contains(event.relatedTarget)) this.marquee.scrollLeft = 0;
            },
            { signal: this.abort.signal }
        );
    }

    /* ---------- 3D tilt + foil ---------- */

    initTilt() {
        if (!this.marquee) return;
        this.cards = [...this.marquee.querySelectorAll('.tcg')]; // originals and clones
        if (this.reducedMotion.matches) return; // the CSS hover foil still works, just without movement

        VanillaTilt.init(this.cards, TILT);
        this.cards.forEach((card) => {
            card.addEventListener('tiltChange', this.onTilt, { signal: this.abort.signal });
        });
    }

    /** vanilla-tilt reports the pointer as a 0-100% position on the card; the foil CSS reads it. */
    onTilt = (event) => {
        const { percentageX, percentageY } = event.detail;
        event.currentTarget.style.setProperty('--mx', `${percentageX}%`);
        event.currentTarget.style.setProperty('--my', `${percentageY}%`);
    };

    /* ---------- Contact form ---------- */

    initForm() {
        if (!this.form) return;
        const { signal } = this.abort;
        this.form.addEventListener('submit', this.onSubmit, { signal });
        this.form.addEventListener('reset', this.clearStatus, { signal });
    }

    onSubmit = async (event) => {
        event.preventDefault(); // no page reload, ever
        if (this.sending) return;

        if (!this.form.checkValidity()) {
            this.form.reportValidity();
            return;
        }

        const data = new FormData(this.form);
        const name = String(data.get('name') ?? '').trim() || 'Trainer';

        this.setSending(true);
        try {
            await this.send(data);
            this.form.reset(); // fires `reset`, which clears the status, so show the message afterwards
            this.showStatus(`Message sent! Thanks, ${name}.`);
        } catch (err) {
            console.error('[TeamContact] Sending failed.', err);
            this.showStatus('Oh no! The message got away. Please try again.', true);
        } finally {
            this.setSending(false);
        }
    };

    async send(data) {
        if (!ENDPOINT) {
            console.warn('[TeamContact] No ENDPOINT configured: the message was NOT delivered anywhere.');
            await new Promise((resolve) => setTimeout(resolve, 600)); // pretend to send, so the UI can be reviewed
            return;
        }
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            body: data,
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }

    setSending(isSending) {
        this.sending = isSending;
        if (!this.submitBtn) return;
        if (isSending) this.submitLabel = this.submitBtn.textContent;
        this.submitBtn.disabled = isSending;
        this.submitBtn.textContent = isSending ? 'Sending...' : this.submitLabel;
    }

    showStatus(message, isError = false) {
        if (!this.statusEl) return;
        this.statusEl.textContent = message; // textContent, never innerHTML: the name is user input
        this.statusEl.classList.toggle('pc__status--error', isError);
    }

    clearStatus = () => {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.classList.remove('pc__status--error');
    };

    destroy() {
        this.abort.abort();
        this.cards.forEach((card) => card.vanillaTilt?.destroy());
    }
}