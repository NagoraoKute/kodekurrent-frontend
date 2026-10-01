import { gsap } from 'gsap';

/* ==========================================================================
   Tunables
   ========================================================================== */
const HOLD_S = 0.3;              // beat between "Pokémon fully appeared" and the attack
const SPRITE_TIMEOUT_MS = 2000;  // give up waiting for a GIF after this long
const SPRITE_URL = (name) => `/pokemon/${name}.gif`; // served from public/pokemon/

/* ==========================================================================
   Tiny DOM helpers (all wipe visuals are generated here: pure CSS)
   ========================================================================== */
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const div = (parent, styles = {}) => {
    const node = document.createElement('div');
    Object.assign(node.style, styles);
    parent.appendChild(node);
    return node;
};

/** Full-screen absolutely positioned layer. */
const layer = (parent, styles = {}) =>
    div(parent, { position: 'absolute', inset: '0', ...styles });

/* ==========================================================================
   Phase 1: The Summon
   red beam (clicked Pokéball -> screen centre) -> white/red pop -> Pokémon bounces in
   `path` = { x0, y0, x1, y1 } in overlay pixels: beam start (the Pokéball) and end (centre).
   Returns a timeline that ends once the Pokémon has fully scaled up.
   ========================================================================== */
function summon(stage, sprite, { x0, y0, x1, y1 }) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.max(Math.hypot(dx, dy), 1);
    // The beam is built pointing straight up, then rotated about its base.
    // 0deg = up, clockwise positive, so the angle to (dx, dy) is atan2(dx, -dy).
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;

    const beam = div(stage, {
        position: 'absolute',
        left: `${x0}px`,
        top: `${y0 - length}px`, // base (bottom-centre) sits exactly on the Pokéball
        width: '2.2vmin',
        height: `${length}px`,
        marginLeft: '-1.1vmin',
        borderRadius: '1.1vmin 1.1vmin 0 0',
        // Base starts semi-solid (not transparent) so the beam visibly leaves the ball
        background:
            'linear-gradient(to top, rgba(255,40,40,0.75) 0%, #ff2a2a 35%, #ffd0d0 85%, #fff 100%)',
        boxShadow: '0 0 2.5vmin 0.8vmin rgba(255,40,40,0.85)',
    });
    const pop = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '70vmin',
        height: '70vmin',
        margin: '-35vmin 0 0 -35vmin',
        borderRadius: '50%',
        background:
            'radial-gradient(circle, #fff 0%, #fff 38%, rgba(255,110,110,0.95) 58%, rgba(255,0,0,0) 72%)',
    });
    gsap.set(beam, { scaleY: 0, rotation: angle, transformOrigin: '50% 100%' });
    gsap.set(pop, { scale: 0 });

    const tl = gsap.timeline();
    tl.to(beam, { scaleY: 1, duration: 0.35, ease: 'power2.in' }) // shoot toward the centre
        .addLabel('pop')
        .to(beam, { opacity: 0, duration: 0.12 }, 'pop')
        .to(pop, { scale: 1.25, duration: 0.2, ease: 'power3.out' }, 'pop') // burst into a flash
        .to(pop, { scale: 1, duration: 0.15, ease: 'sine.inOut' });

    if (sprite) {
        Object.assign(sprite.style, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            height: '40vh',
            width: 'auto',
            maxWidth: '80vw',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none',
            filter: 'drop-shadow(0 1vmin 1.2vmin rgba(0,0,0,0.35))',
        });
        stage.appendChild(sprite); // appended last, so it sits above the flash
        gsap.set(sprite, { xPercent: -50, yPercent: -50, scale: 0 });
        tl.to(sprite, { scale: 1, duration: 0.6, ease: 'back.out(1.5)' }, 'pop+=0.1');
    }

    return tl;
}

/* ==========================================================================
   Phase 2: Elemental attacks
   Contract: effect(stage, { W, H, D }) -> { cover, reveal }
     - cover:  timeline that ends with the screen FULLY masked
     - reveal: timeline that starts fully masked and ends fully transparent
   Effects are always built inside a gsap.context, so every tween (including
   the infinite flame flickers) is killed by ctx.revert() in cleanup.
   Every effect must be invisible at rest: it now sits behind the summon.
   ========================================================================== */

/* ---------- Pikachu: Thunderbolt ---------- */
function boltPolygon(steps = 14, amp = 18, thick = 4) {
    const left = [];
    const right = [];
    let cx = 50;
    for (let i = 0; i <= steps; i++) {
        const y = (i / steps) * 100;
        cx = clamp(cx + rand(-amp, amp), 18, 82);
        left.push(`${(cx - thick).toFixed(1)}% ${y.toFixed(1)}%`);
        right.push(`${(cx + thick).toFixed(1)}% ${y.toFixed(1)}%`);
    }
    return `polygon(${[...left, ...right.reverse()].join(',')})`;
}

function makeBolt(stage, xPct) {
    const widthVw = 18;
    // The glow lives on the wrapper because clip-path would cut off a filter on the same node
    const outer = div(stage, {
        position: 'absolute',
        top: '0',
        left: `${xPct}%`,
        width: `${widthVw}vw`,
        height: '100%',
        marginLeft: `${-widthVw / 2}vw`,
        opacity: '0',
        filter: 'drop-shadow(0 0 0.8vmin #fff) drop-shadow(0 0 2.4vmin #ffd400)',
    });
    div(outer, {
        width: '100%',
        height: '100%',
        background: 'linear-gradient(180deg, #fff, #fff8b0)',
        clipPath: boltPolygon(),
    });
    return outer;
}

function thunderbolt(stage) {
    const fill = layer(stage, {
        background: 'radial-gradient(circle at 50% 50%, #fff7a8, #ffe600 55%, #ffc400)',
        opacity: '0',
    });
    const flash = layer(stage, { background: '#fff', opacity: '0' });
    const bolts = Array.from({ length: 6 }, (_, i) =>
        makeBolt(stage, ((i + 0.5) / 6) * 100 + rand(-5, 5))
    );

    const cover = gsap.timeline();
    bolts.forEach((bolt, i) => {
        cover.fromTo(
            bolt,
            { scaleY: 0, opacity: 1, transformOrigin: '50% 0%' },
            { scaleY: 1, duration: 0.1, ease: 'power4.in' },
            i * 0.05
        );
    });
    cover
        .to(flash, { opacity: 1, duration: 0.05 }, 0.3)
        .set(fill, { opacity: 1 })
        .to(flash, { opacity: 0.15, duration: 0.06 })
        .to(flash, { opacity: 1, duration: 0.04 })
        .to(flash, { opacity: 0, duration: 0.18 });

    const reveal = gsap.timeline();
    reveal
        .to(flash, { opacity: 1, duration: 0.05 })
        .set([fill, ...bolts], { opacity: 0 })
        .to(flash, { opacity: 0.3, duration: 0.07 })
        .to(flash, { opacity: 1, duration: 0.04 })
        .to(flash, { opacity: 0, duration: 0.3, ease: 'power2.out' });

    return { cover, reveal };
}

/* ---------- Charizard: Flamethrower (a fireball grows from a single point at the centre) ---------- */
function flamethrower(stage, { D }) {
    // Circle large enough that the screen corners sit at ~83% of its radius,
    // i.e. still inside the opaque part of the gradient (it only feathers out past 90%).
    const size = D * 1.2;
    const R = size / 2;

    // Main fireball: yellow-white core -> bright yellow -> orange -> red-orange -> deep crimson
    const fire = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${size}px`,
        height: `${size}px`,
        margin: `${-R}px 0 0 ${-R}px`,
        borderRadius: '50%',
        background:
            'radial-gradient(circle, #fffbd0 0%, #ffe94d 10%, #ffb31f 26%, #ff7a12 44%, #e8350a 62%, #b3140a 78%, #7a0d00 90%, rgba(122,13,0,0) 100%)',
    });

    // Flicker layer 1: a hot, breathing halo around the core
    const heatSize = size * 0.7;
    const heat = div(fire, {
        position: 'absolute',
        left: `${R - heatSize / 2}px`,
        top: `${R - heatSize / 2}px`,
        width: `${heatSize}px`,
        height: `${heatSize}px`,
        borderRadius: '50%',
        background:
            'radial-gradient(circle, rgba(255,251,208,0.95) 0%, rgba(255,210,31,0.8) 22%, rgba(255,122,18,0.55) 48%, rgba(255,90,0,0) 70%)',
    });
    gsap.to(heat, { scale: 1.12, opacity: 0.75, duration: 0.09, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    // Flicker layer 2: a small white-hot core, pulsing faster
    const coreSize = size * 0.26;
    const core = div(fire, {
        position: 'absolute',
        left: `${R - coreSize / 2}px`,
        top: `${R - coreSize / 2}px`,
        width: `${coreSize}px`,
        height: `${coreSize}px`,
        borderRadius: '50%',
        background: 'radial-gradient(circle, #ffffff 0%, #fff3a0 35%, rgba(255,233,77,0) 70%)',
    });
    gsap.to(core, { scale: 0.8, duration: 0.06, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    // Flicker layer 3: flame tongues around the rim, stretching and shrinking along their radius
    const tonguePalettes = [
        'radial-gradient(ellipse, #ffe94d 0%, #ff9a1f 45%, rgba(232,53,10,0) 75%)',
        'radial-gradient(ellipse, #ffb31f 0%, #ff5a12 45%, rgba(179,20,10,0) 75%)',
    ];
    const tongueCount = 18;
    for (let i = 0; i < tongueCount; i++) {
        const angle = (i / tongueCount) * Math.PI * 2 + rand(-0.12, 0.12);
        const dist = R * rand(0.55, 0.85);
        const w = size * rand(0.16, 0.24); // length along the radius
        const h = size * rand(0.07, 0.11);
        const tongue = div(fire, {
            position: 'absolute',
            left: `${R + Math.cos(angle) * dist - w / 2}px`,
            top: `${R + Math.sin(angle) * dist - h / 2}px`,
            width: `${w}px`,
            height: `${h}px`,
            borderRadius: '50%',
            background: tonguePalettes[i % 2],
        });
        gsap.set(tongue, { rotation: (angle * 180) / Math.PI }); // long axis points away from the centre
        gsap.to(tongue, {
            scaleX: rand(0.7, 1.4),
            scaleY: rand(0.8, 1.25),
            opacity: rand(0.65, 0.95),
            duration: rand(0.08, 0.2),
            delay: rand(0, 0.1),
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
        });
    }

    // At scale 0 the whole fireball (children included) is a single invisible point at the centre
    gsap.set(fire, { scale: 0, rotation: 0 });

    const cover = gsap
        .timeline()
        .to(fire, { scale: 1, rotation: 100, duration: 0.95, ease: 'power2.in' }); // builds, then blasts outward
    // The fireball collapses back into the centre, revealing the page from the edges inward
    const reveal = gsap
        .timeline()
        .to(fire, { scale: 0, rotation: 200, duration: 0.85, ease: 'power2.inOut' });
    return { cover, reveal };
}

/* ---------- Dragonite: Hyper Beam ---------- */
function hyperBeam(stage) {
    const beam = layer(stage, {
        background:
            'linear-gradient(180deg, #0089b8 0%, #00e5ff 30%, #fff 50%, #00e5ff 70%, #0089b8 100%)',
    });
    const pulse = layer(stage, { background: '#e8fdff', opacity: '0' });
    const orb = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '22vmin',
        height: '22vmin',
        margin: '-11vmin 0 0 -11vmin',
        borderRadius: '50%',
        background:
            'radial-gradient(circle, #fff 0%, #aef4ff 35%, #00d8ff 65%, rgba(0,200,255,0) 72%)',
        boxShadow: '0 0 6vmin 2vmin rgba(0,229,255,0.8)',
    });
    gsap.set(beam, { scaleX: 0, scaleY: 0.07 });
    gsap.set(orb, { scale: 0 });

    const cover = gsap.timeline();
    cover
        .to(orb, { scale: 1, duration: 0.3, ease: 'back.out(2)' }) // charge
        .to(orb, { scale: 1.25, duration: 0.07, repeat: 3, yoyo: true, ease: 'sine.inOut' })
        .to(beam, { scaleX: 1, duration: 0.22, ease: 'power4.out' }) // fire
        .to(orb, { opacity: 0, duration: 0.1 }, '<')
        .to(beam, { scaleY: 1, duration: 0.5, ease: 'power3.in' }) // widen to fill the screen
        .to(pulse, { opacity: 0.75, duration: 0.06, repeat: 5, yoyo: true }, '<0.1');

    const reveal = gsap.timeline();
    reveal
        .to(pulse, { opacity: 0.9, duration: 0.06, repeat: 1, yoyo: true }, 0)
        .to(beam, { scaleY: 0.07, duration: 0.5, ease: 'power3.out' }, 0)
        .to(beam, { scaleX: 0, duration: 0.2, ease: 'power3.in' });

    return { cover, reveal };
}

/* ---------- Meowth: Pay Day ---------- */
function payDay(stage, { W, H }) {
    const maxR = Math.hypot(W, H) / 2;
    const fill = layer(stage, {
        background: 'linear-gradient(135deg, #ffb300, #ffd700 50%, #ffb300)',
        opacity: '0',
    });

    const coins = Array.from({ length: 36 }, () => {
        const size = rand(9, 18); // vmin
        const el = div(stage, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${size}vmin`,
            height: `${size}vmin`,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #fff6b0, #ffd700 45%, #b8860b 100%)',
            border: '0.5vmin solid #8a6100',
            boxShadow: '0 0 2vmin rgba(255,215,0,0.8)',
        });
        div(el, {
            position: 'absolute',
            inset: '18%',
            borderRadius: '50%',
            border: '0.4vmin solid rgba(138,97,0,0.65)',
        });
        const angle = rand(0, Math.PI * 2);
        const dist = rand(0.12, 1) * maxR;
        gsap.set(el, { xPercent: -50, yPercent: -50, scale: 0, transformPerspective: 700 });
        return { el, tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist };
    });

    // The shimmer is a tall, rotated bar. Park it far enough away that no corner
    // of the rotated bar pokes into view while the summon plays (matters on portrait phones).
    const sw = Math.max(W, H) * 0.3;
    const sx0 = -(sw + H * 0.4);
    const sx1 = W + H * 0.4;
    const shimmer = div(stage, {
        position: 'absolute',
        top: '-50%',
        left: '0',
        width: `${sw}px`,
        height: '200%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
    });
    gsap.set(shimmer, { rotation: 20, x: sx0 });

    const cover = gsap.timeline();
    coins.forEach(({ el, tx, ty }, i) => {
        cover.to(
            el,
            { x: tx, y: ty, scale: 1, rotationY: rand(360, 900), duration: 0.65, ease: 'power3.out' },
            i * 0.012
        );
    });
    cover
        .to(fill, { opacity: 1, duration: 0.35 }, 0.45)
        .to(shimmer, { x: sx1, duration: 0.7, ease: 'power1.inOut' }, 0.4);

    const reveal = gsap.timeline();
    coins.forEach(({ el, tx, ty }) => {
        reveal.to(
            el,
            { x: tx * 2, y: ty * 2, scale: 1.5, opacity: 0, duration: 0.6, ease: 'power2.in' },
            0
        );
    });
    reveal
        .to(fill, { opacity: 0, duration: 0.5 }, 0.1)
        .fromTo(
            shimmer,
            { x: sx0 },
            { x: sx1, duration: 0.6, ease: 'power1.inOut', immediateRender: false },
            0
        );

    return { cover, reveal };
}

/* ---------- Blastoise: Hydro Pump (point -> jet down -> fills like a glass) ---------- */
function hydroPump(stage, { W }) {
    const tile = W * 0.14; // width of one wave bump, in px

    // Stage 1: a jet shoots from the centre point straight down to the bottom edge.
    // Drawn first, so the rising water naturally covers it from the bottom up.
    const jet = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '10vmin',
        height: 'calc(50% + 6vh)',
        marginLeft: '-5vmin',
        borderRadius: '0 0 5vmin 5vmin',
        // Foam-white core, cyan highlights, ocean-blue edges: reads as a cylinder of water
        background: 'linear-gradient(90deg, #0b64c9 0%, #5cdcff 28%, #e4fcff 50%, #5cdcff 72%, #0b64c9 100%)',
        boxShadow: '0 0 3vmin rgba(92, 220, 255, 0.7)',
    });
    gsap.set(jet, { scaleY: 0, transformOrigin: '50% 0%' });
    gsap.to(jet, { scaleX: 1.15, duration: 0.07, repeat: -1, yoyo: true, ease: 'sine.inOut' }); // jittery stream

    // The droplet at the centre point the jet fires from
    const orb = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '14vmin',
        height: '14vmin',
        margin: '-7vmin 0 0 -7vmin',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #e4fcff 0%, #5cdcff 35%, #1da1f2 65%, #0b64c9 100%)',
    });
    gsap.set(orb, { scale: 0 });

    // Impact splash where the jet hits the bottom
    const splash = div(stage, {
        position: 'absolute',
        left: '50%',
        bottom: '-3vh',
        width: '70vmin',
        height: '18vmin',
        marginLeft: '-35vmin',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, #e4fcff 0%, #5cdcff 40%, rgba(29,161,242,0) 70%)',
    });
    gsap.set(splash, { scale: 0 });

    // Stage 2: the water body fills the screen bottom to top, like a glass.
    // Light cyan at the surface, ocean blue in the middle, navy at the depths.
    const water = layer(stage, {
        background:
            'linear-gradient(to bottom, #5cdcff 0%, #1da1f2 12%, #0b64c9 35%, #08408f 65%, #031a4d 100%)',
    });
    gsap.set(water, { yPercent: 120 }); // fully below the screen, crests included

    // Scalloped crests ride on the rising surface: foam behind, cyan in front
    // (the front colour matches the top of the body's gradient).
    const makeCrest = (color, heightVh, startX) =>
        div(water, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '100%',
            marginBottom: '-1px', // hide the seam
            height: `${heightVh}vh`,
            background: `radial-gradient(ellipse 50% 100% at 50% 100%, ${color} 97%, transparent 100%)`,
            backgroundSize: `${tile}px 100%`,
            backgroundRepeat: 'repeat-x',
            backgroundPosition: `${startX}px 0px`,
        });
    const foam = makeCrest('#e4fcff', 16, tile * 0.5);
    const crest = makeCrest('#5cdcff', 11, 0);

    // Seamless horizontal rush: one tile of travel = one pattern period
    gsap.to(crest, { backgroundPositionX: `${-tile}px`, duration: 0.45, repeat: -1, ease: 'none' });
    gsap.to(foam, { backgroundPositionX: `${tile * 1.5}px`, duration: 0.7, repeat: -1, ease: 'none' });

    const cover = gsap.timeline();
    cover
        .to(orb, { scale: 1, duration: 0.2, ease: 'back.out(2)' }, 0)          // a droplet appears at the centre
        .to(jet, { scaleY: 1, duration: 0.35, ease: 'power2.in' }, 0.12)       // and fires straight down
        .to(splash, { scale: 1, duration: 0.25, ease: 'power2.out' }, 0.45)    // slams into the bottom
        .to(water, { yPercent: 0, duration: 0.9, ease: 'power1.inOut' }, 0.47) // then the glass fills
        .to(splash, { opacity: 0, duration: 0.3 }, 0.7);

    // The glass drains: the level drops, dragging the crest edge down across the new page.
    // The jet, droplet and splash are hidden first so they don't reappear behind the falling water.
    const reveal = gsap.timeline();
    reveal
        .set([jet, orb, splash], { autoAlpha: 0 }, 0)
        .to(water, { yPercent: 120, duration: 0.85, ease: 'power2.inOut' }, 0);

    return { cover, reveal };
}

/* ---------- Venusaur: Leaf Storm ---------- */
function leafStorm(stage, { D }) {
    const size = D * 1.08; // circle large enough to cover the corners
    const vortex = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${size}px`,
        height: `${size}px`,
        margin: `${-size / 2}px 0 0 ${-size / 2}px`,
        borderRadius: '50%',
        background: [
            'radial-gradient(circle, #0d3b12 0%, rgba(13,59,18,0) 35%)',
            'conic-gradient(from 0deg, #1b5e20, #4caf50, #1b5e20, #81c784, #1b5e20, #388e3c, #1b5e20)',
        ].join(','),
    });
    gsap.set(vortex, { scale: 0 });

    const leaves = Array.from({ length: 30 }, () => ({
        el: div(stage, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '5vmin',
            height: '3vmin',
            margin: '-1.5vmin 0 0 -2.5vmin',
            borderRadius: '0 100% 0 100%',
            background: 'linear-gradient(135deg, #b6e36a, #2e7d32)',
            boxShadow: '0 0 1vmin rgba(0,0,0,0.3)',
            opacity: '0',
        }),
        a0: rand(0, Math.PI * 2),
        turns: rand(1.2, 2.2),
        rMax: rand(0.45, 1.05) * (D / 2),
    }));

    // One proxy value drives every leaf along its own spiral
    const state = { p: 0 };
    const place = () => {
        leaves.forEach((leaf) => {
            const angle = leaf.a0 + state.p * leaf.turns * Math.PI * 2;
            const r = state.p * leaf.rMax;
            leaf.el.style.transform =
                `translate3d(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px, 0) ` +
                `rotate(${(angle * 180) / Math.PI + 90}deg)`;
            leaf.el.style.opacity = state.p > 0.02 ? '1' : '0';
        });
    };

    const cover = gsap.timeline();
    cover.to(vortex, { scale: 1, rotation: 540, duration: 0.9, ease: 'power2.in' }, 0);
    cover.to(state, { p: 1, duration: 0.9, ease: 'power1.in', onUpdate: place }, 0);

    const reveal = gsap.timeline();
    reveal.to(vortex, { scale: 0, rotation: 1080, duration: 0.8, ease: 'power2.inOut' }, 0);
    reveal.to(state, { p: 0, duration: 0.8, ease: 'power1.inOut', onUpdate: place }, 0);

    return { cover, reveal };
}

/* ---------- Gengar: Shadow Ball ---------- */
function shadowBall(stage, { W, H, D }) {
    const size = D * 1.1;
    const orbPx = Math.min(W, H) * 0.16;
    const maxR = D / 2;

    const voidEl = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${size}px`,
        height: `${size}px`,
        margin: `${-size / 2}px 0 0 ${-size / 2}px`,
        borderRadius: '50%',
        background:
            'radial-gradient(circle at 50% 50%, #0b0014 0%, #1d0536 50%, #3d0f6b 85%, #7b1fa2 100%)',
    });
    gsap.set(voidEl, { scale: orbPx / size, opacity: 0 });

    const wisps = Array.from({ length: 14 }, () => {
        const s = rand(8, 16); // vmin
        const el = div(stage, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${s}vmin`,
            height: `${s}vmin`,
            margin: `${-s / 2}vmin 0 0 ${-s / 2}vmin`,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #b266ff 0%, rgba(106,27,154,0.8) 40%, rgba(0,0,0,0) 70%)',
            filter: 'blur(1vmin)',
            opacity: '0',
        });
        const angle = rand(0, Math.PI * 2);
        const dist = rand(0.3, 1) * maxR;
        return { el, tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist };
    });

    const orb = div(stage, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${orbPx}px`,
        height: `${orbPx}px`,
        margin: `${-orbPx / 2}px 0 0 ${-orbPx / 2}px`,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #c9a7ff 0%, #7b1fa2 35%, #1a0033 100%)',
        boxShadow: '0 0 5vmin 1.5vmin rgba(171,71,188,0.85)',
    });
    gsap.set(orb, { scale: 0 });

    const cover = gsap.timeline();
    cover
        .to(orb, { scale: 1, duration: 0.35, ease: 'back.out(2)' }) // charge the ball
        .to(orb, { scale: 1.2, duration: 0.08, repeat: 3, yoyo: true, ease: 'sine.inOut' })
        .set(voidEl, { opacity: 1 })
        .addLabel('burst')
        .to(voidEl, { scale: 1, duration: 0.75, ease: 'power3.in' }, 'burst') // the void swallows the screen
        .to(orb, { opacity: 0, duration: 0.1 }, 'burst');
    wisps.forEach(({ el, tx, ty }, i) => {
        cover.fromTo(
            el,
            { x: 0, y: 0, scale: 0.3, opacity: 0.9 },
            { x: tx, y: ty, scale: 1.4, opacity: 0, duration: 0.55, ease: 'power2.out', immediateRender: false },
            `burst+=${i * 0.012}`
        );
    });

    const reveal = gsap.timeline().to(voidEl, { scale: 0, duration: 0.7, ease: 'power3.out' });
    return { cover, reveal };
}

/* ---------- Fallback / reduced motion ---------- */
function fade(stage) {
    const fill = layer(stage, { background: '#0b1020', opacity: '0' });
    return {
        cover: gsap.timeline().to(fill, { opacity: 1, duration: 0.18 }),
        reveal: gsap.timeline().to(fill, { opacity: 0, duration: 0.25 }),
    };
}

const EFFECTS = {
    pikachu: thunderbolt,
    charizard: flamethrower,
    dragonite: hyperBeam,
    meowth: payDay,
    blastoise: hydroPump,
    venusaur: leafStorm,
    gengar: shadowBall,
};

/* ==========================================================================
   Transitions controller
   Sequence: [summon] -> hold -> [attack/cover] -> fade summon -> swap -> [reveal]
   ========================================================================== */
export class Transitions {
    constructor({ app = document.getElementById('app'), nav = document.getElementById('site-nav') } = {}) {
        this.app = app;
        this.nav = nav;
        this.overlay = null;
        this.ctx = null;
        this.sprite = null;
        this.busy = false;
        this.destroyed = false;
        this.currentTarget = null;
        this.abort = new AbortController();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    init() {
        if (!this.app) {
            console.warn('[Transitions] #app not found; transitions disabled.');
            return this;
        }

        this.overlay = this.createOverlay();
        const { signal } = this.abort;

        document.addEventListener('navigation:change', this.handleChange, { signal });
        // Capture phase on the nav root runs BEFORE Navigation's own click handler,
        // so a blocked click never changes the active tab or emits an event.
        this.nav?.addEventListener('click', this.guardClicks, { capture: true, signal });
        // Warm the HTTP cache once the loader is gone so the first summon doesn't wait on the network
        document.addEventListener('loader:complete', this.preloadSprites, { once: true, signal });
        return this;
    }

    createOverlay() {
        const overlay = document.getElementById('transition-overlay') ?? document.createElement('div');
        overlay.id = 'transition-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '999',
            overflow: 'hidden',
            display: 'none',
            pointerEvents: 'none',
        });
        if (!overlay.isConnected) document.body.appendChild(overlay);
        return overlay;
    }

    preloadSprites = () => {
        const run = () => Object.keys(EFFECTS).forEach((name) => { new Image().src = SPRITE_URL(name); });
        if ('requestIdleCallback' in window) requestIdleCallback(run);
        else setTimeout(run, 500);
    };

    /** Creates the <img> and resolves once its first frame is decoded; null on failure/timeout. */
    async loadSprite(pokemon) {
        const img = new Image();
        img.alt = '';
        img.draggable = false;
        img.src = SPRITE_URL(pokemon);

        let timer;
        try {
            await Promise.race([
                img.decode(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('timeout')), SPRITE_TIMEOUT_MS);
                }),
            ]);
            return img;
        } catch (err) {
            console.warn(`[Transitions] Sprite for "${pokemon}" unavailable; summoning without it.`, err);
            img.removeAttribute('src');
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Swallow nav clicks (mouse or keyboard Enter) while a transition is in flight. */
    guardClicks = (event) => {
        if (!this.busy) return;
        if (event.target.closest('[data-target]')) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };

    getSections() {
        const direct = [...this.app.querySelectorAll(':scope > section')];
        return direct.length ? direct : [...this.app.querySelectorAll('section[id]')];
    }

    /** The nav tab whose data-target matches (i.e. the one just clicked). */
    findTab(target) {
        const root = this.nav ?? document;
        return root.querySelector(`[data-target="${CSS.escape(target)}"]`);
    }

    /**
     * Beam path in overlay pixels: from the centre of the tab's Pokéball to the
     * centre of the screen. Falls back to the old bottom-centre origin if the
     * ball can't be measured (missing or hidden nav).
     */
    getBeamPath(tab, box) {
        const x1 = box.width / 2;
        const y1 = box.height / 2;
        const ball = tab?.querySelector('.nav-ball') ?? tab;
        const rect = ball?.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
            return { x0: x1, y0: box.height, x1, y1 };
        }
        return {
            x0: rect.left + rect.width / 2 - box.left,
            y0: rect.top + rect.height / 2 - box.top,
            x1,
            y1,
        };
    }

    handleChange = (event) => {
        if (this.busy) return;

        const { target, pokemon } = event.detail ?? {};
        const next = target ? document.getElementById(target) : null;
        if (!next || !this.app.contains(next)) {
            console.warn(`[Transitions] No section found for target "${target}".`);
            return;
        }

        const current = this.getSections().find((s) => !s.classList.contains('hidden'));
        if (current === next) return;

        this.play(next, target, pokemon, this.findTab(target));
    };

    async play(next, target, pokemon, tab) {
        this.busy = true; // set BEFORE the await so clicks stay blocked while the GIF loads
        this.currentTarget = target;
        document.documentElement.style.overflow = 'hidden'; // no scrolling mid-transition

        // Summon only for known Pokémon, and never under reduced motion
        const useSummon = !this.reducedMotion.matches && has(EFFECTS, pokemon);
        const effect = useSummon ? EFFECTS[pokemon] : fade;
        this.sprite = useSummon ? await this.loadSprite(pokemon) : null;
        if (this.destroyed) return;

        this.overlay.style.display = 'block';
        this.overlay.style.pointerEvents = 'auto'; // also blocks mouse clicks underneath

        const W = window.innerWidth;
        const H = window.innerHeight;
        // Measured AFTER the scroll lock so a vanishing scrollbar can't shift the nav under the beam
        const path = useSummon ? this.getBeamPath(tab, this.overlay.getBoundingClientRect()) : null;

        try {
            this.ctx = gsap.context(() => {
                // Two stacked stages: the attack renders below, the summon (and sprite) above it
                const fxStage = layer(this.overlay, { overflow: 'hidden' });
                const summonStage = layer(this.overlay, { overflow: 'hidden', pointerEvents: 'none' });

                const { cover, reveal } = effect(fxStage, { W, H, D: Math.hypot(W, H) });
                const master = gsap.timeline({ onComplete: this.finish });

                if (useSummon) {
                    master.add(summon(summonStage, this.sprite, path)).addLabel('attack', `+=${HOLD_S}`);
                    if (this.sprite) {
                        // Little recoil as the attack launches
                        master.to(
                            this.sprite,
                            { scale: 1.12, duration: 0.12, repeat: 1, yoyo: true, ease: 'power1.out' },
                            'attack'
                        );
                    }
                    master
                        .add(cover, 'attack') // only after the Pokémon has fully appeared
                        .to(summonStage, { opacity: 0, duration: 0.25 }); // screen is masked; clear the summon
                } else {
                    master.add(cover);
                }

                master.add(() => this.swap(next)).add(reveal);
            });
        } catch (err) {
            // Never leave the user stuck behind a broken effect
            console.error('[Transitions] Effect failed, swapping without animation.', err);
            this.swap(next);
            this.finish();
        }
    }

    swap(next) {
        this.getSections().forEach((section) => {
            section.classList.toggle('hidden', section !== next);
        });
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }

    finish = () => {
        this.ctx?.revert(); // kills every tween, including infinite flame/wave loops
        this.ctx = null;

        // Release the GIF first so the browser can drop its decoded frames
        if (this.sprite) {
            this.sprite.removeAttribute('src');
            this.sprite.remove();
            this.sprite = null;
        }
        this.overlay.replaceChildren(); // removes both stages: beam, flash, sprite, and attack layers
        this.overlay.style.display = 'none';
        this.overlay.style.pointerEvents = 'none';
        document.documentElement.style.overflow = '';

        this.busy = false;
        document.dispatchEvent(
            new CustomEvent('transition:complete', { detail: { target: this.currentTarget } })
        );
    };

    destroy() {
        this.destroyed = true;
        this.abort.abort();
        this.ctx?.revert();
        this.sprite?.remove();
        this.overlay?.remove();
        document.documentElement.style.overflow = '';
        this.busy = false;
    }
}