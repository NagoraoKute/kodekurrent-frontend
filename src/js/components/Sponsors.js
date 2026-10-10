import { gsap } from 'gsap';

const SIDE_FILL = 0.92;   // an open case may fill this fraction of the viewport width
const LID_VISIBLE = 0.45; // fraction of the open lid's height kept in view above the tray
const CLOSE_ROOM = 0.12;  // room kept below the tray for the Close button
const MIN_SCALE = 0.6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Sponsors {
  constructor(section = document.getElementById('sponsors')) {
    this.section = section;
    this.cases = section ? [...section.querySelectorAll('[data-case]')] : [];
    this.nav = document.getElementById('site-nav');

    this.active = null;   // the open case element
    this.focused = null;  // the badge currently brought forward
    this.closing = false;
    this.tl = null;
    this.raf = 0;
    this.abort = new AbortController();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  init() {
    if (!this.section || this.cases.length === 0) return this;
    const { signal } = this.abort;

    this.cases.forEach((c) => { this.parts(c).tray.inert = true; }); // badges unreachable until their case is open

    this.section.addEventListener('click', this.onClick, { signal });
    document.addEventListener('keydown', this.onKeydown, { signal });
    window.addEventListener('resize', this.onResize, { signal });
    // When another section takes over, fold everything back (Transitions has already released the scroll lock)
    document.addEventListener('transition:complete', this.reset, { signal });
    return this;
  }

  /** Seconds, or 0 for reduced motion. */
  d = (seconds) => (this.reducedMotion.matches ? 0 : seconds);

  parts(caseEl) {
    const q = (selector) => caseEl.querySelector(selector);
    return {
      frame: q('[data-frame]'),
      lid: q('[data-lid]'),
      tray: q('[data-tray]'),
      dim: q('[data-dim]'),
      detail: q('[data-detail]'),
      closeBtn: q('[data-case-close]'),
      openBtn: q('[data-case-open]'),
      caption: q('.case__caption'),
      badges: [...caseEl.querySelectorAll('.badge')],
    };
  }

  /* ---------- Events ---------- */

  onClick = (event) => {
    const openBtn = event.target.closest('[data-case-open]');
    if (openBtn) return this.open(openBtn.closest('[data-case]'));
    if (event.target.closest('[data-case-close]')) return this.close();

    const badge = event.target.closest('.badge');
    if (badge && this.active?.contains(badge)) return this.toggleBadge(badge);

    if (event.target.closest('[data-dim]')) return this.unfocusBadge();
    return undefined;
  };

  onKeydown = (event) => {
    if (event.key !== 'Escape' || !this.active) return;
    if (this.focused) this.unfocusBadge(); // first Esc puts the badge back, the next one closes the case
    else this.close();
  };

  onResize = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      if (!this.active || this.closing) return;
      const { frame } = this.parts(this.active);
      gsap.set(frame, this.openTransform(frame)); // keep the open case centred
    });
  };

  /* ---------- Open / close a case ---------- */

  /** x / y / scale that centre the open case: the tray plus the part of the lid and Close button we keep in view. */
  openTransform(frame) {
    gsap.set(frame, { x: 0, y: 0, scale: 1 }); // measure at rest
    const rect = frame.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const navH = this.nav?.offsetHeight ?? 0;
    const free = vh - navH - 24;

    const scale = clamp(
      Math.min((vw * SIDE_FILL) / rect.width, free / (rect.height * (1 + LID_VISIBLE + CLOSE_ROOM))),
      MIN_SCALE,
      4
    );
    const regionCenterY = navH + (vh - navH) / 2;
    const trayCenterY = regionCenterY + ((LID_VISIBLE - CLOSE_ROOM) / 2) * rect.height * scale;

    return {
      x: vw / 2 - (rect.left + rect.width / 2),
      y: trayCenterY - (rect.top + rect.height / 2),
      scale,
    };
  }

  open(caseEl) {
    if (!caseEl || this.active || this.closing) return;
    this.active = caseEl;
    const other = this.cases.find((c) => c !== caseEl);
    const p = this.parts(caseEl);
    const d = this.d;

    // Lock the scroll BEFORE measuring: the scrollbar disappearing changes the layout width
    document.documentElement.style.overflow = 'hidden';
    caseEl.classList.add('is-open');
    p.tray.inert = false;
    if (other) other.inert = true;
    const target = this.openTransform(p.frame);

    this.tl?.kill();
    this.tl = gsap.timeline({ onComplete: () => p.closeBtn.focus({ preventScroll: true }) });
    if (other) this.tl.to(other, { opacity: 0, scale: 0.92, duration: d(0.4), ease: 'power2.out' }, 0);
    this.tl
      .to(p.caption, { opacity: 0, duration: d(0.25) }, 0)
      .to(p.frame, { ...target, duration: d(0.8), ease: 'power3.inOut' }, 0)         // scale up and centre
      .to(p.lid, { rotationX: 180, duration: d(0.9), ease: 'power2.inOut' }, d(0.3)) // lid flips up and over
      .fromTo(
        p.badges,
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: d(0.35), stagger: d(0.04), ease: 'back.out(2)', clearProps: 'transform,opacity' },
        d(0.95)
      )
      .fromTo(p.closeBtn, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: d(0.3) }, d(1.2));
  }

  close() {
    const caseEl = this.active;
    if (!caseEl || this.closing) return;
    this.closing = true;
    const other = this.cases.find((c) => c !== caseEl);
    const p = this.parts(caseEl);
    const d = this.d;

    this.unfocusBadge(true);
    p.tray.inert = true;

    this.tl?.kill(); // interrupting an opening is fine: every tween below starts from wherever things are now
    this.tl = gsap.timeline({ onComplete: () => this.finishClose(caseEl) });
    this.tl
      .to(p.closeBtn, { autoAlpha: 0, duration: d(0.15) }, 0)
      .to(p.lid, { rotationX: 0, duration: d(0.8), ease: 'power2.inOut' }, 0)          // lid folds shut
      .to(p.frame, { x: 0, y: 0, scale: 1, duration: d(0.8), ease: 'power3.inOut' }, d(0.25)) // back to side-by-side
      .to(p.caption, { opacity: 1, duration: d(0.3) }, d(0.6));
    if (other) this.tl.to(other, { opacity: 1, scale: 1, duration: d(0.4), ease: 'power2.out' }, d(0.45));
  }

  finishClose(caseEl) {
    this.resetCase(caseEl);
    this.cases.forEach((c) => { c.inert = false; });
    document.documentElement.style.overflow = '';
    this.parts(caseEl).openBtn.focus({ preventScroll: true });
    this.active = null;
    this.closing = false;
  }

  /** Back to the closed, side-by-side state with no animation. */
  reset = () => {
    if (!this.active && !this.closing) return;
    this.tl?.kill();
    this.tl = null;
    this.focused = null;
    this.cases.forEach((c) => {
      this.resetCase(c);
      c.inert = false;
    });
    this.active = null;
    this.closing = false;
  };

  resetCase(caseEl) {
    const p = this.parts(caseEl);
    const targets = [caseEl, p.frame, p.lid, p.caption, p.closeBtn, p.dim, p.detail, ...p.badges];
    gsap.killTweensOf(targets);
    gsap.set(targets, { clearProps: 'all' });
    p.badges.forEach((badge) => { badge.closest('li').style.zIndex = ''; });
    caseEl.classList.remove('is-open', 'is-focus');
    p.tray.inert = true;
  }

  /* ---------- Badge focus ---------- */

  toggleBadge(badge) {
    if (this.focused === badge) this.unfocusBadge();
    else this.focusBadge(badge);
  }

  /** Bring one badge forward, show its details and dim the rest of the case. */
  focusBadge(badge) {
    if (this.focused) this.unfocusBadge(true);
    const caseEl = this.active;
    if (!caseEl) return;
    const p = this.parts(caseEl);
    const d = this.d;
    this.focused = badge;
    caseEl.classList.add('is-focus');

    // Detail text, set with textContent only
    const setText = (selector, text) => {
      const el = p.detail.querySelector(selector);
      if (el) el.textContent = text;
    };
    setText('[data-detail-tier]', badge.dataset.tier ?? '');
    setText('[data-detail-name]', badge.dataset.name ?? '');
    setText('[data-detail-text]', badge.dataset.text ?? '');
    const link = p.detail.querySelector('[data-detail-link]');
    const url = badge.dataset.url ?? '';
    const safe = /^https?:\/\//i.test(url);
    link.hidden = !safe;
    if (safe) link.href = url;

    // The badge flies to the upper-middle of the tray, enlarged (the detail card takes the lower part)
    badge.closest('li').style.zIndex = '20';
    const frameScale = gsap.getProperty(p.frame, 'scale') || 1; // the case itself is scaled, so convert screen px to local px
    const tray = p.tray.getBoundingClientRect();
    const box = badge.getBoundingClientRect();
    const factor = clamp((p.tray.offsetHeight * 0.36) / badge.offsetHeight, 1.5, 3);
    const dx = (tray.left + tray.width / 2 - (box.left + box.width / 2)) / frameScale;
    const dy = (tray.top + tray.height * 0.33 - (box.top + box.height / 2)) / frameScale;

    gsap.to(badge, { x: dx, y: dy, scale: factor, duration: d(0.5), ease: 'back.out(1.4)' });
    gsap.to(p.dim, { opacity: 1, duration: d(0.3) });
    gsap.fromTo(p.detail, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: d(0.35), delay: d(0.15) });
  }

  unfocusBadge(instant = false) {
    const badge = this.focused;
    if (!badge || !this.active) return;
    const p = this.parts(this.active);
    const d = this.d;
    this.focused = null;
    this.active.classList.remove('is-focus');

    gsap.killTweensOf([badge, p.dim, p.detail]);
    const settle = () => {
      badge.closest('li').style.zIndex = '';
      gsap.set(badge, { clearProps: 'transform' });
    };

    if (instant || this.reducedMotion.matches) {
      settle();
      gsap.set([p.dim, p.detail], { opacity: 0, y: 0 });
      return;
    }
    gsap.to(badge, { x: 0, y: 0, scale: 1, duration: d(0.35), ease: 'power2.inOut', onComplete: settle });
    gsap.to(p.dim, { opacity: 0, duration: d(0.3) });
    gsap.to(p.detail, { opacity: 0, y: 8, duration: d(0.2) });
  }

  destroy() {
    this.abort.abort();
    cancelAnimationFrame(this.raf);
    this.reset();
  }
}