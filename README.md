# Voidrunner

A small arcade space shooter built with Phaser 3, TypeScript, and Vite. Ships, enemies, stars, and effects are drawn in code.

## Run locally

```sh
npm install
npm run dev
```

To create a production build, run `npm run build`.

## Controls

- **WASD** or **arrow keys** — move
- **Space** — fire
- **P** — pause or resume
- **Mouse / touch** — move while pressing, fire on tap/click

Choose a difficulty before launch: **Easy** gives you more hull and slower enemy waves, **Normal** is the standard run, and **Heck Yeah** brings faster, denser, tougher waves with less hull.

Every run begins at **Sector 0**. Take down twelve enemies to advance; sectors have no cap, and the swarm gets faster and denser as you go. Enemy speed and spawn pressure eventually level off so very high sectors stay playable.

Your best sector and high score are saved in this browser and shown on the launch and mission-complete screens. The record is local to this browser; a shared leaderboard would need an online service.

From the mission-complete screen, share through your device's share sheet, X, Reddit, WhatsApp, Telegram, or Facebook. The Discord button copies a ready-to-paste challenge message. Shared links use the URL where the game is currently hosted, so other players need a publicly accessible deployment to open them.

Audio effects are synthesized in-browser: lasers, enemy-hit impacts, hull collisions, and squad radio callouts with sector and score updates. Launch and mission-complete voice lines use the browser's speech synthesis when available; the sound toggle mutes effects and voice together.

Use the fullscreen button in the game view to expand it; select the exit icon or press **Escape** to leave fullscreen.

Defeated enemies can drop a diamond shield that restores one hull bar (up to five) or a flame pickup that increases ship speed by 50% for **7.5 seconds**. During the boost, the ship exhaust grows and burns bright blue.
