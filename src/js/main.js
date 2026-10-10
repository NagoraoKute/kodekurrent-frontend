import '../css/style.css';
import '../css/animations.css';

import { Loader } from './components/Loader.js';
import { Intro } from './components/Intro.js';
import { Navigation } from './components/Navigation.js';
import { Pokedex } from './components/Pokedex.js';
import { Schedule } from './components/Schedule.js';
import { TeamContact } from './components/TeamContact.js';
import { OakChat } from './components/OakChat.js';
import { Transitions } from './animations/Transitions.js';
import { Sponsors } from './components/Sponsors.js';

function init() {
    new Loader({
        overlay: document.getElementById('global-loader'),
        container: document.getElementById('loader-canvas'),
    }).start();

    new Intro({ overlay: document.getElementById('intro-overlay') }).init();

    new Navigation(document.getElementById('site-nav')).init();

    new Pokedex(document.querySelector('[data-pokedex]')).init();

    new Schedule(document.getElementById('schedule')).init();

    new TeamContact(document.getElementById('contact')).init();

    new OakChat(document.getElementById('oak-chat')).init();

    new Transitions({
        app: document.getElementById('app'),
        nav: document.getElementById('site-nav'),
    }).init();

    new Sponsors().init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}