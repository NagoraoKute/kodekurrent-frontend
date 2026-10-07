import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const WALK_UNITS = 12;     // timeline length of the whole walk (split across legs by their pixel length)
const DWELL = 1.6;         // timeline length of each stop in a town (scroll distance he stands still)
const MOVE_EPSILON = 0.3;  // px moved per update below which he counts as standing still
const IDLE_MS = 140;       // no timeline update for this long => stop the walk cycle
const FOOT_INSET = 6;      // px: his feet sit this far below the town's dot
const TIME_EPS = 1e-3;

export class Schedule {
    constructor(section = document.getElementById('schedule')) {
        this.section = section;
        this.track = section?.querySelector('[data-schedule-track]') ?? null;
        this.map = section?.querySelector('[data-schedule-map]') ?? null;
        this.sprite = section?.querySelector('#ash-sprite') ?? null;
        this.hint = section?.querySelector('[data-map-hint]') ?? null;
        this.towns = section ? [...section.querySelectorAll('[data-town]')] : [];
        this.cards = this.towns.map((town) => town.querySelector('.town__card'));

        this.pct = [];   // waypoints in % of the map: { x, y, town } (town = index, or null for a bend)
        this.px = [];    // the same in pixels; re-measured on every ScrollTrigger refresh
        this.sw = 0;     // sprite size in px
        this.sh = 0;

        this.tl = null;
        this.dwells = []; // [{ town, start, end }]: timeline windows in which he stands in a town
        this.prev = { x: 0, y: 0 };
        this.dir = 'down';
        this.walking = false;
        this.idleTimer = 0;
        this.view = { active: -2, visited: -2, hintHidden: false }; // what the DOM currently shows
        this.io = null;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    init() {
        if (!this.section || !this.track || !this.map || !this.sprite || this.towns.length < 2) return this;

        this.pct = this.readRoute();
        if (this.pct.some((p) => Number.isNaN(p.x) || Number.isNaN(p.y))) {
            console.warn('[Schedule] A town has a missing/invalid --x, --y or data-via; the map is disabled.');
            return this;
        }

        // The section is display:none until Transitions reveals it, and ScrollTrigger can't measure
        // hidden elements. So the scroll animation only exists while the track is actually displayed:
        // armed the moment it appears (still under the screen wipe, so Ash is in place when the wipe
        // lifts) and torn down when another section takes over.
        this.io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? this.arm() : this.disarm()));
        this.io.observe(this.track);
        return this;
    }

    /* ---------- Route ---------- */

    /** Towns in order, joined by straight lines. A town can add bends via data-via="x,y x,y" (in %). */
    readRoute() {
        const points = [];
        this.towns.forEach((town, i) => {
            if (i > 0) points.push(...this.readVia(town));
            const style = getComputedStyle(town);
            points.push({
                x: parseFloat(style.getPropertyValue('--x')),
                y: parseFloat(style.getPropertyValue('--y')),
                town: i,
            });
        });
        return points;
    }

    readVia(town) {
        return (town.dataset.via ?? '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((pair) => {
                const [x, y] = pair.split(',').map(parseFloat);
                return { x, y, town: null };
            });
    }

    /* ---------- Arm / disarm ---------- */

    arm() {
        if (this.tl) return;

        this.measure();
        this.buildTimeline();
        // Re-measure before every refresh (window resize, rotation...); invalidateOnRefresh re-reads the values
        ScrollTrigger.addEventListener('refreshInit', this.measure);

        this.sprite.classList.add('is-ready');
        this.prev = { x: gsap.getProperty(this.sprite, 'x'), y: gsap.getProperty(this.sprite, 'y') };
        this.updateState();
        ScrollTrigger.refresh();
    }

    disarm() {
        if (!this.tl) return;

        ScrollTrigger.removeEventListener('refreshInit', this.measure);
        this.tl.scrollTrigger?.kill();
        this.tl.kill();
        this.tl = null;

        clearTimeout(this.idleTimer);
        gsap.set(this.sprite, { clearProps: 'transform' });
        this.sprite.classList.remove('is-ready');
        this.setWalking(false);
        this.face('down');

        this.cards.forEach((card) => {
            if (!card) return;
            gsap.killTweensOf(card);
            gsap.set(card, { clearProps: 'opacity,transform' }); // back to the CSS default: hidden
        });
        this.towns.forEach((town) => town.classList.remove('is-active', 'is-visited'));
        this.hint?.classList.remove('is-hidden');
        this.view = { active: -2, visited: -2, hintHidden: false };
    }

    /** Waypoints in px for the current map size (also called by ScrollTrigger before each refresh). */
    measure = () => {
        const w = this.map.clientWidth;
        const h = this.map.clientHeight;
        this.px = this.pct.map((p) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h }));
        this.sw = this.sprite.offsetWidth;
        this.sh = this.sprite.offsetHeight;
    };

    /** Sprite x/y (its top-left, since it's absolutely positioned at 0,0) that puts his feet on waypoint k. */
    anchor(k) {
        return { x: this.px[k].x - this.sw / 2, y: this.px[k].y - this.sh + FOOT_INSET };
    }

    /* ---------- Scroll-linked timeline ---------- */

    buildTimeline() {
        const last = this.px.length - 1;
        const len = (k) => Math.hypot(this.px[k + 1].x - this.px[k].x, this.px[k + 1].y - this.px[k].y);
        let total = 0;
        for (let k = 0; k < last; k++) total += len(k);

        // Function-based values + invalidateOnRefresh: positions are recomputed whenever the layout changes
        const at = (k) => ({ x: () => this.anchor(k).x, y: () => this.anchor(k).y });

        const tl = gsap.timeline({
            defaults: { ease: 'none' },
            onUpdate: this.onUpdate,
            scrollTrigger: {
                trigger: this.track,
                start: 'top top',
                end: 'bottom bottom', // the whole tall track = the whole walk
                scrub: 1,
                invalidateOnRefresh: true,
            },
        });

        this.dwells = [];
        // Stand still in a town (from = to). The first one also places him on the map immediately.
        const dwell = (k, town, first = false) => {
            const start = tl.duration();
            tl.fromTo(this.sprite, at(k), { ...at(k), duration: DWELL, immediateRender: first });
            this.dwells.push({ town, start, end: start + DWELL });
        };

        dwell(0, 0, true);
        for (let k = 0; k < last; k++) {
            // Leg duration is proportional to its length, so he walks at a constant speed
            // (a leg of length 0, e.g. two towns sharing a dot, takes no time)
            tl.fromTo(this.sprite, at(k), {
                ...at(k + 1),
                duration: total > 0 ? (len(k) / total) * WALK_UNITS : 0,
                immediateRender: false,
            });
            const town = this.pct[k + 1].town;
            if (town !== null) dwell(k + 1, town);
        }

        this.tl = tl;
    }

    /* ---------- Direction, walking state, town state ---------- */

    onUpdate = () => {
        const x = gsap.getProperty(this.sprite, 'x');
        const y = gsap.getProperty(this.sprite, 'y');
        const dx = x - this.prev.x;
        const dy = y - this.prev.y;
        this.prev.x = x;
        this.prev.y = y;

        if (Math.hypot(dx, dy) > MOVE_EPSILON) {
            // The dominant axis of movement decides which way he faces (also when scrolling back up)
            if (Math.abs(dx) >= Math.abs(dy)) this.face(dx > 0 ? 'right' : 'left');
            else this.face(dy > 0 ? 'down' : 'up');
            this.setWalking(true);
        } else {
            this.setWalking(false); // not moving (e.g. standing in a town)
        }

        this.updateState();

        // The scrubbed timeline stops updating once it settles, so a final update never arrives with
        // "speed 0". If nothing updates for a moment, he has stopped.
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.setWalking(false), IDLE_MS);
    };

    face(direction) {
        if (direction === this.dir) return;
        this.sprite.classList.remove(`facing-${this.dir}`);
        this.sprite.classList.add(`facing-${direction}`);
        this.dir = direction;
    }

    setWalking(isWalking) {
        if (isWalking === this.walking) return;
        this.walking = isWalking;
        this.sprite.classList.toggle('is-walking', isWalking);
    }

    /** Active = the town he is standing in (its card is up); visited = every town he has reached. */
    updateState() {
        if (!this.tl) return;

        const t = this.tl.time();
        const current = this.dwells.find((d) => t >= d.start - TIME_EPS && t <= d.end + TIME_EPS);
        const active = current ? current.town : -1;
        let visited = -1;
        this.dwells.forEach((d) => {
            if (t >= d.start - TIME_EPS) visited = d.town;
        });

        if (active !== this.view.active) {
            if (this.view.active >= 0) this.hideCard(this.view.active);
            if (active >= 0) this.showCard(active);
        }
        if (active !== this.view.active || visited !== this.view.visited) {
            this.towns.forEach((town, i) => {
                town.classList.toggle('is-active', i === active);
                town.classList.toggle('is-visited', i <= visited);
            });
            this.view.active = active;
            this.view.visited = visited;
        }

        const hintHidden = this.tl.progress() > 0.02;
        if (hintHidden !== this.view.hintHidden) {
            this.hint?.classList.toggle('is-hidden', hintHidden);
            this.view.hintHidden = hintHidden;
        }
    }

    /* ---------- Event cards ---------- */

    /** Pop the card up while Ash stands in its town. */
    showCard(index) {
        const card = this.cards[index];
        if (!card) return;
        gsap.killTweensOf(card); // a rapid scroll through several towns can't leave stale tweens behind
        if (this.reducedMotion.matches) {
            gsap.set(card, { opacity: 1, scale: 1, y: 0 });
            return;
        }
        gsap.fromTo(
            card,
            { opacity: 0, scale: 0.6, y: 10 },
            { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: 'back.out(1.7)' }
        );
    }

    /** Fold it away as soon as he walks on (or back). */
    hideCard(index) {
        const card = this.cards[index];
        if (!card) return;
        gsap.killTweensOf(card);
        if (this.reducedMotion.matches) {
            gsap.set(card, { opacity: 0 });
            return;
        }
        gsap.to(card, { opacity: 0, scale: 0.85, duration: 0.18, ease: 'power2.in' });
    }

    destroy() {
        this.io?.disconnect();
        this.disarm();
    }
}