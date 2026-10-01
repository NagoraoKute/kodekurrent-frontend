import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BALL_RADIUS = 1;
const SPIN_SPEED = 1.6;        // radians/second around the Y axis
const FADE_MS = 700;           // keep in sync with `duration-700` on #global-loader
const MIN_VISIBLE_MS = 1200;   // avoid a flash on fast connections
const MAX_WAIT_MS = 10000;     // safety net if `load` never fires

/** Dispose every geometry + material under a root object. */
function disposeObject(root) {
    root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => m.dispose());
        }
    });
}

/** Builds the Pokéball from primitives: two hemispheres, equator band, button. */
function createPokeball() {
    const R = BALL_RADIUS;
    const ball = new THREE.Group();

    const gloss = { metalness: 0.25, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 };
    const redMat = new THREE.MeshPhysicalMaterial({ color: 0xe3262b, ...gloss });
    const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f4, ...gloss, roughness: 0.32 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.6, roughness: 0.35 });

    // Top (red) and bottom (white) hemispheres
    const top = new THREE.Mesh(
        new THREE.SphereGeometry(R, 64, 48, 0, Math.PI * 2, 0, Math.PI / 2),
        redMat
    );
    const bottom = new THREE.Mesh(
        new THREE.SphereGeometry(R, 64, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        whiteMat
    );

    // Equator band: slightly wider than the sphere so it reads as a raised seam
    const band = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 1.012, R * 1.012, 0.14, 64, 1, true),
        blackMat
    );

    // Button (axis rotated to point along +Z, toward the camera at rest)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 48), blackMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 0.97;

    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 48), whiteMat);
    button.rotation.x = Math.PI / 2;
    button.position.z = 0.99;

    ball.add(top, bottom, band, ring, button);
    return ball;
}

export class Loader {
    /**
     * @param {{ overlay: HTMLElement, container: HTMLElement, minVisibleMs?: number }} opts
     */
    constructor({ overlay, container, minVisibleMs = MIN_VISIBLE_MS } = {}) {
        this.overlay = overlay;
        this.container = container;
        this.minVisibleMs = minVisibleMs;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.ball = null;
        this.pmrem = null;
        this.room = null;
        this.envTarget = null;

        this.rafId = 0;
        this.lastTime = 0;
        this.startedAt = 0;
        this.timers = [];
        this.hiding = false;
        this.disposed = false;
    }

    start() {
        if (!this.overlay || !this.container) return this;

        this.startedAt = performance.now();
        document.documentElement.style.overflow = 'hidden'; // lock scroll while loading

        try {
            this.buildScene();
            this.lastTime = performance.now();
            this.rafId = requestAnimationFrame(this.tick);
        } catch (err) {
            // No WebGL? Fall back to the text-only overlay and keep going.
            console.warn('[Loader] WebGL unavailable, using text-only loader.', err);
            this.releaseGL();
        }

        if (document.readyState === 'complete') {
            this.scheduleHide();
        } else {
            window.addEventListener('load', this.scheduleHide, { once: true });
        }
        this.timers.push(setTimeout(this.hide, MAX_WAIT_MS));
        return this;
    }

    buildScene() {
        const { clientWidth: width, clientHeight: height } = this.container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 50);
        this.camera.position.set(0, 0.7, 5.2);
        this.camera.lookAt(0, 0, 0);

        // Image-based lighting gives the glossy/metallic materials something to reflect
        this.pmrem = new THREE.PMREMGenerator(this.renderer);
        this.room = new RoomEnvironment();
        this.envTarget = this.pmrem.fromScene(this.room, 0.04);
        this.scene.environment = this.envTarget.texture;

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(3, 4, 5);
        this.scene.add(key);

        this.ball = createPokeball();
        this.scene.add(this.ball);

        window.addEventListener('resize', this.onResize);
    }

    tick = (now) => {
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        this.ball.rotation.y += SPIN_SPEED * dt;      // continuous Y-axis spin
        this.ball.position.y = Math.sin(now / 600) * 0.04; // subtle float

        this.renderer.render(this.scene, this.camera);
        this.rafId = requestAnimationFrame(this.tick);
    };

    onResize = () => {
        if (!this.renderer) return;
        const { clientWidth: w, clientHeight: h } = this.container;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    };

    scheduleHide = () => {
        const wait = Math.max(0, this.minVisibleMs - (performance.now() - this.startedAt));
        this.timers.push(setTimeout(this.hide, wait));
    };

    hide = () => {
        if (this.hiding || this.disposed) return;
        this.hiding = true;
        this.overlay.setAttribute('aria-busy', 'false');
        this.overlay.classList.add('opacity-0', 'pointer-events-none');
        this.timers.push(setTimeout(this.dispose, FADE_MS + 50));
    };

    /** Stop the loop and free every GPU resource. Safe to call more than once. */
    releaseGL() {
        cancelAnimationFrame(this.rafId);
        window.removeEventListener('resize', this.onResize);

        if (this.ball) disposeObject(this.ball);
        if (this.room) disposeObject(this.room);
        if (this.scene) this.scene.environment = null;
        if (this.envTarget) this.envTarget.dispose();
        if (this.pmrem) this.pmrem.dispose();

        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer.domElement.remove();
        }

        this.renderer = this.scene = this.camera = this.ball = null;
        this.pmrem = this.room = this.envTarget = null;
    }

    dispose = () => {
        if (this.disposed) return;
        this.disposed = true;

        this.timers.forEach(clearTimeout);
        window.removeEventListener('load', this.scheduleHide);
        this.releaseGL();

        this.overlay.remove();
        document.documentElement.style.overflow = '';
        document.dispatchEvent(new CustomEvent('loader:complete'));
    };
}