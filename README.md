# ⚡ Kodekurrent: Pokémon Edition ⚡

Welcome to the frontend repository for **Kodekurrent**, the premier hackathon organized by the IEEE Student Chapter at RGIPT. For this edition, we've completely revamped the registration portal into a highly interactive, nostalgic, gamified Pokémon experience!

## 🎮 Features

* **3D Pokéball Loader:** A realistic, Three.js-powered Pokéball spins while assets load.
* **Retro Anime Splash Screen:** The site boots up with the classic Episode 1 Gengar vs. Nidorino battle animation before shattering to reveal the home page.
* **Dynamic "Screen Wipe" Navigation:** Navigating between tabs doesn't reload the page. Instead, 3D Pokéballs in the nav bar summon Pokémon (Pikachu, Charizard, Blastoise, Venusaur, Gengar) whose signature attacks wipe the screen to load new sections.
* **Holographic EX Cards:** The organizing team is showcased as 3D-tilting Pokémon EX trading cards with dynamic CSS foil effects.
* **Kanto Pokédex FAQs:** A meticulously CSS-styled Generation 1 Pokédex handles the FAQs with retro typewriter text effects.
* **Generational Scrolling:** The environment and UI styling evolve through different Pokémon generations as you scroll down the page.

## 🛠 Tech Stack

This project is built as a lightweight, performant Vanilla JavaScript Single Page Application (SPA).

* **Build Tool:** [Vite](https://vitejs.dev/)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) + Custom CSS for complex textures/gradients.
* **Animations:** [GSAP (GreenSock)](https://greensock.com/gsap/) for timelines and routing transitions.
* **3D Graphics:** [Three.js](https://threejs.org/) for the loader and nav elements.
* **Micro-Interactions:** [Vanilla-tilt.js](https://micku7zu.github.io/vanilla-tilt.js/) for the EX Cards.

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine (v16 or higher is recommended).

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/kodekurrent-pokemon.git
   cd kodekurrent-pokemon
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or if using yarn/pnpm:
   yarn install
   pnpm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Vite will start a local server, usually at `http://localhost:5173`. 

### Building for Production

To create an optimized, minified production build:
```bash
npm run build
```
The compiled files will be output to the `dist/` directory, ready to be deployed to GitHub Pages, Vercel, Netlify, or any static hosting service.


## 🤝 Contributing

This project is maintained by the IEEE RGIPT Student Chapter. If you'd like to contribute, please fork the repository and open a pull request. Make sure to adhere to the design principles.

## 📝 License

This project is created for the Kodekurrent Hackathon by IEEE RGIPT. Pokémon characters, names, and related imagery are the intellectual property of Nintendo, Creatures, and Game Freak. This project is for educational and non-commercial event use only.