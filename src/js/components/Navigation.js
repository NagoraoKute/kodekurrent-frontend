/**
 * Navigation: tab state + accessibility.
 * Screen-wipe transitions are NOT implemented yet. Phase 4 hooks into the
 * `navigation:change` event dispatched below (it carries `data-pokemon`).
 */
export class Navigation {
    constructor(root = document.getElementById('site-nav')) {
        this.root = root;
        this.tabs = root ? [...root.querySelectorAll('[data-target]')] : [];
        this.activeTarget = null;
        this.abort = new AbortController();
    }

    init() {
        if (!this.root || this.tabs.length === 0) return this;

        this.root.addEventListener('click', this.handleClick, { signal: this.abort.signal });

        const fromHash = window.location.hash.slice(1);
        const initial = this.tabs.some((t) => t.dataset.target === fromHash)
            ? fromHash
            : this.tabs[0].dataset.target;
        this.setActive(initial);
        return this;
    }

    handleClick = (event) => {
        const tab = event.target.closest('[data-target]');
        if (!tab || !this.root.contains(tab)) return;

        event.preventDefault(); // never a hard reload (claude.md)
        const { target, pokemon } = tab.dataset;
        if (target === this.activeTarget) return;

        this.setActive(target);
        document.dispatchEvent(
            new CustomEvent('navigation:change', { detail: { target, pokemon } })
        );
    };

    setActive(target) {
        this.activeTarget = target;
        this.tabs.forEach((tab) => {
            const isActive = tab.dataset.target === target;
            tab.classList.toggle('is-active', isActive);
            if (isActive) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
    }

    destroy() {
        this.abort.abort();
    }
}