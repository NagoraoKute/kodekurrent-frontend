import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Pops the route's nodes and cards in as they scroll into view.
 *
 * The section is display:none until Transitions reveals it, and ScrollTrigger can't measure
 * a display:none element: triggers created then would see zero positions and fire instantly,
 * so every card would animate unseen. Therefore triggers only exist while the section is on
 * screen: built on `transition:complete` for this section (after the wipe has lifted, so the
 * first cards pop in visibly) and killed when another section takes over.
 */
export class Schedule {
    constructor(section = document.getElementById('schedule')) {
        this.section = section;
        this.items = section ? [...section.querySelectorAll('[data-schedule-item]')] : [];
        this.triggers = [];
        this.played = new WeakSet(); // items that have already popped in; they never replay
        this.abort = new AbortController();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    init() {
        if (!this.section || this.items.length === 0) return this;
        if (this.reducedMotion.matches) return this; // everything stays visible, nothing to animate

        // Start hidden. Opacity only (not visibility), so screen readers still reach every card.
        this.items.forEach((item) => gsap.set(this.partsOf(item), { opacity: 0 }));

        document.addEventListener('transition:complete', this.onTransitionComplete, {
            signal: this.abort.signal,
        });
        if (this.isVisible()) this.arm(); // e.g. the section was un-hidden without a transition
        return this;
    }

    partsOf(item) {
        return [item.querySelector('[data-schedule-card]'), item.querySelector('[data-schedule-node]')].filter(Boolean);
    }

    isVisible() {
        return this.section.offsetParent !== null; // null while display:none
    }

    onTransitionComplete = (event) => {
        if (event.detail?.target === this.section.id) this.arm();
        else this.disarm();
    };

    /** Create triggers for the items that haven't popped yet (the section is visible now). */
    arm() {
        this.disarm(); // never double-register
        const pending = this.items.filter((item) => !this.played.has(item));
        if (pending.length > 0) {
            this.triggers = ScrollTrigger.batch(pending, {
                start: 'top 85%',
                once: true,
                interval: 0.1, // items entering within 100ms are animated together, staggered
                onEnter: this.pop,
            });
        }
        ScrollTrigger.refresh(); // re-measure now that the section is displayed
    }

    disarm() {
        this.triggers.forEach((trigger) => trigger.kill());
        this.triggers = [];
    }

    pop = (items) => {
        items.forEach((item) => this.played.add(item));

        const desktop = window.matchMedia('(min-width: 768px)').matches;
        const cards = items.map((item) => item.querySelector('[data-schedule-card]')).filter(Boolean);
        const nodes = items.map((item) => item.querySelector('[data-schedule-node]')).filter(Boolean);
        // Cards fly in from their own side on desktop; on mobile they all sit right of the route
        const fromX = (i) => (desktop && items[i].dataset.side === 'left' ? -48 : 48);

        gsap
            .timeline()
            .fromTo(
                nodes,
                { opacity: 0, scale: 0 },
                { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)', stagger: 0.12, clearProps: 'transform' },
                0
            )
            .fromTo(
                cards,
                { opacity: 0, x: fromX, scale: 0.92 },
                { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)', stagger: 0.12, clearProps: 'transform' },
                0.08
            );
    };

    destroy() {
        this.abort.abort();
        this.disarm();
    }
}