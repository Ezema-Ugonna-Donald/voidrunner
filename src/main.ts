import Phaser from 'phaser';
import './style.css';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 600;
const MAX_HULL = 5;
const SPEED_BOOST_DURATION = 7500;
const SPEED_BOOST_MULTIPLIER = 1.5;
const COLORS = { cyan: 0x69f5e1, pink: 0xff5599, purple: 0x9d7bff, ink: 0x080b16 };
const DIFFICULTIES = {
  easy: { spawnDelay: 1450, speed: 0.78, armor: 1, lives: 4 },
  normal: { spawnDelay: 1050, speed: 1, armor: 2, lives: 3 },
  heck: { spawnDelay: 700, speed: 1.35, armor: 3, lives: 2 },
} as const;
type DifficultyId = keyof typeof DIFFICULTIES;
type ArcadeOverlapObject = Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile;
let selectedDifficulty: DifficultyId = 'normal';
const PERSONAL_BEST_KEY = 'voidrunner.personalBest.v1';
type PersonalBest = { sector: number; score: number };

function loadPersonalBest(): PersonalBest {
  try {
    const stored = localStorage.getItem(PERSONAL_BEST_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<PersonalBest>;
      if (Number.isFinite(parsed.sector) && Number.isFinite(parsed.score)) return { sector: Math.max(0, parsed.sector!), score: Math.max(0, parsed.score!) };
    }
  } catch { /* Local records are optional when storage is unavailable. */ }
  return { sector: 0, score: 0 };
}

let personalBest = loadPersonalBest();
let soundEnabled = true;
let audioContext: AudioContext | undefined;
let audioMaster: GainNode | undefined;

function getAudioContext() {
  audioContext ??= new AudioContext();
  if (!audioMaster) { audioMaster = audioContext.createGain(); audioMaster.gain.value = 0.62; audioMaster.connect(audioContext.destination); }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function playTone(frequency: number, duration: number, wave: OscillatorType = 'sine', volume = 0.045) {
  if (!soundEnabled) return;
  try {
    const context = getAudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(volume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(audioMaster!); oscillator.start(); oscillator.stop(context.currentTime + duration);
  } catch { /* Audio is optional; the game remains playable when unavailable. */ }
}

function playNoiseBurst(duration: number, cutoff: number, volume: number, filterType: BiquadFilterType = 'lowpass') {
  if (!soundEnabled) return;
  try {
    const context = getAudioContext(); const sampleCount = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate); const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    const source = context.createBufferSource(); const filter = context.createBiquadFilter(); const gain = context.createGain();
    source.buffer = buffer; filter.type = filterType; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(audioMaster!); source.start(); source.stop(context.currentTime + duration);
  } catch { /* Audio is optional; the game remains playable when unavailable. */ }
}

function playLaser() {
  if (!soundEnabled) return;
  try {
    const context = getAudioContext(); const oscillator = context.createOscillator(); const filter = context.createBiquadFilter(); const gain = context.createGain();
    oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(1180, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(190, context.currentTime + 0.13);
    filter.type = 'lowpass'; filter.frequency.value = 2600;
    gain.gain.setValueAtTime(0.075, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
    oscillator.connect(filter); filter.connect(gain); gain.connect(audioMaster!); oscillator.start(); oscillator.stop(context.currentTime + 0.14);
  } catch { /* Audio is optional; the game remains playable when unavailable. */ }
}

function playBlastImpact() {
  playNoiseBurst(0.2, 950, 0.15, 'bandpass');
  playTone(145, 0.2, 'sine', 0.085);
}

function playCollisionImpact() {
  playNoiseBurst(0.34, 190, 0.24, 'lowpass');
  playTone(78, 0.31, 'triangle', 0.16);
  playTone(48, 0.38, 'sawtooth', 0.07);
}

function speakRadioMessage(text: string) {
  if (!soundEnabled || !('speechSynthesis' in window)) return;
  const message = new SpeechSynthesisUtterance(text);
  message.lang = 'en-US'; message.rate = 1.04; message.pitch = 0.82; message.volume = 0.86;
  const voice = window.speechSynthesis.getVoices().find(candidate => candidate.lang.toLowerCase().startsWith('en'));
  if (voice) message.voice = voice;
  message.onend = () => { if (soundEnabled) { playTone(880, 0.07, 'sine', 0.045); window.setTimeout(() => playTone(660, 0.09, 'sine', 0.045), 80); } };
  window.setTimeout(() => {
    if (!soundEnabled) return;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(message);
  }, 230);
}

function announceLaunch() {
  if (!soundEnabled) return;
  playNoiseBurst(0.055, 2300, 0.025, 'highpass');
  playTone(660, 0.09, 'sine', 0.055);
  speakRadioMessage("Let's go, Voidrunner!");
}

function announceMissionComplete() {
  if (!soundEnabled) return;
  const lines = ['Not bad.', 'Incredible run!', 'I know you can do better.'];
  playTone(520, 0.12, 'sine', 0.06);
  speakRadioMessage(lines[Phaser.Math.Between(0, lines.length - 1)]);
}

function announceSector(sector: number, score: number) {
  if (!soundEnabled) return;
  playNoiseBurst(0.055, 2300, 0.025, 'highpass');
  playTone(660, 0.09, 'sine', 0.055);
  window.setTimeout(() => playTone(880, 0.11, 'sine', 0.055), 95);
  const compliments = [
    'Sharp shooting. The whole squad saw that.',
    'Beautiful flying, pilot. Keep that streak alive.',
    'You are making this look easy. Stay on target.',
    'Outstanding work out there. We are right behind you.',
    'That was clean. Command is impressed.',
  ];
  const compliment = compliments[Phaser.Math.Between(0, compliments.length - 1)];
  speakRadioMessage(`Radio check. Sector ${sector} reached. Score ${score}. ${compliment}`);
}

type Controls = { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key; upArrow: Phaser.Input.Keyboard.Key; downArrow: Phaser.Input.Keyboard.Key; leftArrow: Phaser.Input.Keyboard.Key; rightArrow: Phaser.Input.Keyboard.Key; fire: Phaser.Input.Keyboard.Key; pause: Phaser.Input.Keyboard.Key; enter: Phaser.Input.Keyboard.Key };

class SpaceScene extends Phaser.Scene {
  private stars!: Phaser.GameObjects.Arc[];
  private ship?: Phaser.GameObjects.Container;
  private shipFlame?: Phaser.GameObjects.Graphics;
  private boostFlameTween?: Phaser.Tweens.Tween;
  private flameBoosted?: boolean;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bonuses!: Phaser.Physics.Arcade.Group;
  private controls!: Controls;
  private score = 0;
  private lives = 3;
  private sector = 0;
  private running = false;
  private paused = false;
  private invulnerable = false;
  private speedBoostUntil = 0;
  private lastBoostCountdown = '';
  private toastTimer?: Phaser.Time.TimerEvent;
  private difficulty: (typeof DIFFICULTIES)[DifficultyId] = DIFFICULTIES.normal;
  private lastShot = 0;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private ui = {
    score: document.querySelector<HTMLElement>('#score')!, sector: document.querySelector<HTMLElement>('#sector')!,
    bars: document.querySelectorAll<HTMLElement>('#life-bars i'), state: document.querySelector<HTMLElement>('#run-state')!,
    final: document.querySelector<HTMLElement>('#final-score')!, hud: document.querySelector<HTMLElement>('#hud')!,
    start: document.querySelector<HTMLElement>('#start-screen')!, pause: document.querySelector<HTMLElement>('#pause-screen')!,
    over: document.querySelector<HTMLElement>('#over-screen')!, sectorTag: document.querySelector<HTMLElement>('#sector-tag')!,
    bestSector: document.querySelector<HTMLElement>('#best-sector')!, bestScore: document.querySelector<HTMLElement>('#best-score')!,
    finalBest: document.querySelector<HTMLElement>('#final-best')!,
    toast: document.querySelector<HTMLElement>('#powerup-toast')!,
  };

  constructor() { super('space'); }

  create() {
    this.drawBackground();
    const textureGraphics = this.make.graphics({ x: 0, y: 0 });
    textureGraphics.fillStyle(COLORS.cyan, 1).fillCircle(5, 5, 4).generateTexture('bullet', 10, 10);
    textureGraphics.clear().fillStyle(0xffffff, 1).fillCircle(20, 20, 20).generateTexture('enemy', 40, 40);
    textureGraphics.destroy();
    this.createBonusTextures();
    this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 24 });
    this.enemies = this.physics.add.group({ defaultKey: 'enemy', maxSize: 14 });
    this.bonuses = this.physics.add.group({ defaultKey: 'shield-pickup', maxSize: 8 });
    const keyboard = this.input.keyboard!;
    this.controls = { up: keyboard.addKey('W'), down: keyboard.addKey('S'), left: keyboard.addKey('A'), right: keyboard.addKey('D'), upArrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP), downArrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN), leftArrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT), rightArrow: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT), fire: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE), pause: keyboard.addKey('P'), enter: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER) };
    this.shipFlame = this.add.graphics();
    this.setShipFlameBoost(false);
    const shipBody = this.add.graphics();
    shipBody.fillStyle(COLORS.cyan, 0.12); shipBody.fillTriangle(0, -25, -18, 18, 18, 18);
    shipBody.lineStyle(2, COLORS.cyan, 1); shipBody.strokeTriangle(0, -25, -18, 18, 18, 18);
    shipBody.fillStyle(0xf3fffd, 0.9); shipBody.fillTriangle(0, -15, -5, 9, 5, 9);
    this.ship = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 92, [this.shipFlame, shipBody]).setVisible(false).setActive(false); this.physics.add.existing(this.ship);
    const shipArcadeBody = this.ship.body as Phaser.Physics.Arcade.Body; shipArcadeBody.setCircle(15, -15, -15); shipArcadeBody.setCollideWorldBounds(true); shipArcadeBody.enable = false;
    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.ship, this.enemies, this.hitShip, undefined, this);
    this.physics.add.overlap(this.ship, this.bonuses, this.collectBonus, undefined, this);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.running && !this.paused && this.ship && pointer.isDown) this.ship.setPosition(pointer.x, pointer.y);
    });
    this.input.on('pointerdown', () => { if (this.running && !this.paused) this.shoot(); });
    this.ui.start.classList.remove('hidden'); this.ui.hud.classList.remove('visible');
    this.renderPersonalBest();
    window.addEventListener('resize', () => this.scale.refresh());
  }

  private drawBackground() {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.ink).setOrigin(0);
    const haze = this.add.graphics(); haze.fillGradientStyle(0x142844, 0x142844, 0x080b16, 0x080b16, 0.34, 0.14, 0, 0); haze.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.stars = [];
    for (let i = 0; i < 105; i++) {
      const r = Phaser.Math.FloatBetween(0.5, 1.8);
      const star = this.add.circle(Phaser.Math.Between(8, GAME_WIDTH - 8), Phaser.Math.Between(8, GAME_HEIGHT - 8), r, i % 11 === 0 ? COLORS.cyan : 0xc7d6f2, Phaser.Math.FloatBetween(0.17, 0.72));
      star.setData('speed', Phaser.Math.FloatBetween(12, 44)); this.stars.push(star);
    }
    const grid = this.add.graphics().setAlpha(0.13); grid.lineStyle(1, 0x42506f, 1);
    for (let x = 0; x < GAME_WIDTH; x += 80) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 80) grid.lineBetween(0, y, GAME_WIDTH, y);
  }

  private createBonusTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    const diamond = [new Phaser.Geom.Point(16, 1), new Phaser.Geom.Point(30, 16), new Phaser.Geom.Point(16, 31), new Phaser.Geom.Point(2, 16)];
    graphics.fillStyle(COLORS.cyan, 0.22); graphics.fillPoints(diamond, true);
    graphics.lineStyle(2, COLORS.cyan, 1); graphics.strokePoints(diamond, true);
    graphics.lineStyle(1, 0xeaffff, 0.95); graphics.strokePoints([new Phaser.Geom.Point(16, 7), new Phaser.Geom.Point(24, 16), new Phaser.Geom.Point(16, 25), new Phaser.Geom.Point(8, 16)], true);
    graphics.generateTexture('shield-pickup', 32, 32); graphics.clear();
    const flame = [new Phaser.Geom.Point(16, 1), new Phaser.Geom.Point(22, 11), new Phaser.Geom.Point(28, 18), new Phaser.Geom.Point(27, 25), new Phaser.Geom.Point(22, 30), new Phaser.Geom.Point(12, 30), new Phaser.Geom.Point(6, 25), new Phaser.Geom.Point(6, 19), new Phaser.Geom.Point(11, 12)];
    graphics.fillStyle(0xff7a46, 0.94); graphics.fillPoints(flame, true);
    graphics.lineStyle(2, 0xffc56d, 1); graphics.strokePoints(flame, true);
    graphics.fillStyle(0xffedaa, 0.95); graphics.fillPoints([new Phaser.Geom.Point(16, 14), new Phaser.Geom.Point(20, 21), new Phaser.Geom.Point(17, 27), new Phaser.Geom.Point(12, 26), new Phaser.Geom.Point(12, 21)], true);
    graphics.generateTexture('flame-pickup', 32, 32); graphics.destroy();
  }

  private setShipFlameBoost(boosted: boolean) {
    if (!this.shipFlame || this.flameBoosted === boosted) return;
    this.flameBoosted = boosted;
    this.boostFlameTween?.stop(); this.boostFlameTween = undefined;
    this.shipFlame.setScale(1).clear();
    if (boosted) {
      this.shipFlame.fillStyle(0x168bff, 0.95); this.shipFlame.fillTriangle(-9, 15, 0, 36, 9, 15);
      this.shipFlame.fillStyle(0x59dfff, 0.96); this.shipFlame.fillTriangle(-5, 16, 0, 30, 5, 16);
      this.shipFlame.fillStyle(0xe8ffff, 0.92); this.shipFlame.fillTriangle(-2, 17, 0, 24, 2, 17);
      this.boostFlameTween = this.tweens.add({ targets: this.shipFlame, scaleY: 1.13, duration: 110, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      this.shipFlame.fillStyle(COLORS.pink, 0.9); this.shipFlame.fillTriangle(-7, 16, 0, 30, 7, 16);
    }
  }

  startGame() {
    if (this.running && !this.paused) return;
    if (this.paused) { this.togglePause(); return; }
    this.difficulty = DIFFICULTIES[selectedDifficulty];
    this.score = 0; this.lives = this.difficulty.lives; this.sector = 0; this.lastShot = 0; this.invulnerable = false; this.speedBoostUntil = 0; this.lastBoostCountdown = ''; this.setShipFlameBoost(false); this.toastTimer?.remove(); this.ui.toast.textContent = ''; this.ui.toast.classList.remove('visible'); this.updateSectorDisplay();
    this.bullets.clear(true, true); this.enemies.clear(true, true); this.bonuses.clear(true, true);
    this.ship!.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 92).setVisible(true).setActive(true).setAlpha(1);
    const body = this.ship!.body as Phaser.Physics.Arcade.Body; body.enable = true; body.setVelocity(0, 0);
    this.running = true; this.paused = false; this.ui.start.classList.add('hidden'); this.ui.pause.classList.add('hidden'); this.ui.over.classList.add('hidden'); this.ui.hud.classList.add('visible'); this.ui.state.textContent = 'LIVE';
    this.refreshHud();
    this.scheduleEnemySpawns();
    announceLaunch();
    this.events.emit('started');
  }

  private spawnEnemy() {
    if (!this.running || this.paused || this.enemies.countActive() > 9) return;
    const x = Phaser.Math.Between(45, GAME_WIDTH - 45); const kind = Phaser.Math.Between(0, 3);
    const graphic = this.add.graphics();
    const color = kind === 0 ? COLORS.pink : kind === 1 ? COLORS.purple : 0xffac69;
    graphic.fillStyle(color, 0.13); graphic.fillCircle(0, 0, 21); graphic.lineStyle(2, color, 0.9);
    if (kind % 2 === 0) { graphic.strokeCircle(0, 0, 15); graphic.strokeCircle(0, 0, 7); graphic.lineBetween(-20, 0, -13, 0); graphic.lineBetween(13, 0, 20, 0); }
    else { graphic.strokePoints([new Phaser.Geom.Point(0, -18), new Phaser.Geom.Point(17, 0), new Phaser.Geom.Point(0, 18), new Phaser.Geom.Point(-17, 0)], true); graphic.fillStyle(color, 0.8); graphic.fillCircle(0, 0, 4); }
    const enemy = this.enemies.get(x, -30, 'enemy') as Phaser.GameObjects.Arc | null;
    if (!enemy) { graphic.destroy(); return; }
    const sectorRamp = 1 + Math.min(this.sector * 0.015, 0.75);
    enemy.setActive(true).setVisible(true).setPosition(x, -30); enemy.setData('hp', kind === 1 ? this.difficulty.armor : 1); enemy.setData('speed', (Phaser.Math.Between(95, 160) + Math.min(this.sector, 50) * 2) * this.difficulty.speed * sectorRamp);
    enemy.setData('kind', kind); enemy.setData('graphic', graphic); enemy.setAlpha(0); const body = enemy.body as Phaser.Physics.Arcade.Body; body.setCircle(18); body.setVelocity(0, enemy.getData('speed'));
    this.add.existing(graphic); graphic.setPosition(x, -30);
  }

  private shoot() {
    if (!this.ship || this.time.now - this.lastShot < 210) return;
    this.lastShot = this.time.now;
    playLaser();
    const bullet = this.bullets.get(this.ship.x, this.ship.y - 24) as Phaser.GameObjects.Arc | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true).setPosition(this.ship.x, this.ship.y - 24);
    bullet.setAlpha(1);
    if (!bullet.getData('created')) { bullet.setData('created', true); (bullet.body as Phaser.Physics.Arcade.Body).setCircle(4); }
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(0, -540);
  }

  private hitEnemy(bulletObj: ArcadeOverlapObject, enemyObj: ArcadeOverlapObject) {
    const bullet = bulletObj as Phaser.GameObjects.Arc; const enemy = enemyObj as Phaser.GameObjects.Arc;
    if (!bullet.active || !enemy.active) return;
    bullet.setActive(false).setVisible(false);
    const hp = (enemy.getData('hp') as number) - 1; enemy.setData('hp', hp); playBlastImpact();
    const graphic = enemy.getData('graphic') as Phaser.GameObjects.Graphics; graphic?.setAlpha(0.48); this.time.delayedCall(65, () => graphic?.setAlpha(1));
    if (hp <= 0) {
      this.burst(enemy.x, enemy.y, enemy.getData('kind') === 1 ? COLORS.purple : COLORS.pink);
      graphic?.destroy(); enemy.setActive(false).setVisible(false);
      if (Phaser.Math.Between(0, 99) < 16) this.spawnBonus(enemy.x, enemy.y);
      this.score += 100;
      if (this.score > 0 && this.score % 1200 === 0) { this.sector++; this.updateSectorDisplay(); this.scheduleEnemySpawns(); announceSector(this.sector, this.score); }
      this.savePersonalBest(); this.refreshHud();
    }
  }

  private spawnBonus(x: number, y: number) {
    const kind = Phaser.Math.Between(0, 1) === 0 ? 'shield' : 'speed';
    const texture = kind === 'shield' ? 'shield-pickup' : 'flame-pickup';
    const bonus = this.bonuses.get(x, y, texture) as Phaser.Physics.Arcade.Sprite | null;
    if (!bonus) return;
    bonus.setTexture(texture).setActive(true).setVisible(true).setAlpha(1).setPosition(x, y).setScale(0.9);
    bonus.setData('kind', kind);
    const body = bonus.body as Phaser.Physics.Arcade.Body;
    body.enable = true; body.reset(x, y); body.setCircle(13); body.setVelocity(0, 72);
  }

  private collectBonus(_ship: ArcadeOverlapObject, bonusObject: ArcadeOverlapObject) {
    const bonus = bonusObject as Phaser.Physics.Arcade.Sprite;
    if (!bonus.active) return;
    const body = bonus.body as Phaser.Physics.Arcade.Body;
    if (bonus.getData('kind') === 'shield') {
      if (this.lives >= MAX_HULL) return;
      this.lives++;
      playTone(980, 0.13, 'sine', 0.09);
      this.showPowerupToast('HULL INTEGRITY +1', 1500);
      this.refreshHud();
    } else {
      this.speedBoostUntil = this.time.now + SPEED_BOOST_DURATION;
      this.lastBoostCountdown = '';
      this.setShipFlameBoost(true);
      playTone(760, 0.1, 'triangle', 0.075);
      this.showPowerupToast('SPEED BOOST · 7.5s');
    }
    this.burst(bonus.x, bonus.y, bonus.getData('kind') === 'shield' ? COLORS.cyan : 0xffac69);
    bonus.setActive(false).setVisible(false); body.enable = false;
  }

  private showPowerupToast(message: string, duration?: number) {
    this.toastTimer?.remove(); this.ui.toast.textContent = message;
    this.ui.toast.classList.toggle('visible', Boolean(message));
    if (duration) this.toastTimer = this.time.delayedCall(duration, () => {
      this.ui.toast.textContent = ''; this.ui.toast.classList.remove('visible');
    });
  }

  private hitShip(shipObj: ArcadeOverlapObject, enemyObj: ArcadeOverlapObject) {
    const ship = shipObj as Phaser.GameObjects.Container; const enemy = enemyObj as Phaser.GameObjects.Arc;
    if (!this.running || this.invulnerable || !enemy.active) return;
    const graphic = enemy.getData('graphic') as Phaser.GameObjects.Graphics; this.burst(enemy.x, enemy.y, COLORS.pink); graphic?.destroy(); enemy.setActive(false).setVisible(false);
    this.lives--; playCollisionImpact(); this.cameras.main.shake(130, 0.008); this.burst(ship.x, ship.y, COLORS.cyan); this.refreshHud();
    if (this.lives <= 0) this.endGame(); else { this.invulnerable = true; ship.setAlpha(0.38); this.time.delayedCall(900, () => { this.invulnerable = false; if (this.ship?.active) this.ship.setAlpha(1); }); }
  }

  private burst(x: number, y: number, color: number) {
    const particles = this.add.particles(x, y, 'bullet', { speed: { min: 25, max: 140 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 }, lifespan: 450, quantity: 11, tint: color, emitting: false });
    particles.explode(); this.time.delayedCall(500, () => particles.destroy());
  }

  private refreshHud() {
    this.ui.score.textContent = String(this.score).padStart(6, '0');
    this.ui.bars.forEach((bar, i) => bar.classList.toggle('depleted', i >= this.lives));
  }

  private updateSectorDisplay() {
    const label = String(this.sector).padStart(2, '0');
    this.ui.sector.textContent = label;
    this.ui.sectorTag.textContent = label;
  }

  private savePersonalBest() {
    const next = { sector: Math.max(personalBest.sector, this.sector), score: Math.max(personalBest.score, this.score) };
    if (next.sector !== personalBest.sector || next.score !== personalBest.score) {
      personalBest = next;
      try { localStorage.setItem(PERSONAL_BEST_KEY, JSON.stringify(personalBest)); } catch { /* Keep the current session playable if storage is unavailable. */ }
    }
    this.renderPersonalBest();
  }

  private renderPersonalBest() {
    const sector = String(personalBest.sector).padStart(2, '0');
    const score = String(personalBest.score).padStart(6, '0');
    this.ui.bestSector.textContent = `SECTOR ${sector}`;
    this.ui.bestScore.textContent = score;
    this.ui.finalBest.textContent = `SECTOR ${sector} · ${score}`;
  }

  private scheduleEnemySpawns() {
    this.spawnTimer?.remove();
    const pressure = 1 + Math.min(this.sector * 0.02, 1.4);
    const delay = Math.max(420, Math.round(this.difficulty.spawnDelay / pressure));
    this.spawnTimer = this.time.addEvent({ delay, loop: true, callback: this.spawnEnemy, callbackScope: this });
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    if (this.paused) { this.physics.world.pause(); if (this.spawnTimer) this.spawnTimer.paused = true; this.time.paused = true; this.ui.pause.classList.remove('hidden'); this.ui.state.textContent = 'PAUSED'; }
    else { this.time.paused = false; this.physics.world.resume(); if (this.spawnTimer) this.spawnTimer.paused = false; this.ui.pause.classList.add('hidden'); this.ui.state.textContent = 'LIVE'; }
  }

  private endGame() {
    this.savePersonalBest();
    announceMissionComplete();
    this.setShipFlameBoost(false);
    this.running = false; this.paused = false; this.spawnTimer?.remove(); this.ui.final.textContent = String(this.score).padStart(6, '0'); this.ui.over.classList.remove('hidden'); this.ui.state.textContent = 'COMPLETE';
    if (this.ship) { this.burst(this.ship.x, this.ship.y, COLORS.cyan); this.ship.setVisible(false).setActive(false); (this.ship.body as Phaser.Physics.Arcade.Body).enable = false; }
  }

  update(_time: number, delta: number) {
    for (const star of this.stars) { star.y += star.getData('speed') * delta / 1000 * (this.running && !this.paused ? 1.7 : 0.35); if (star.y > GAME_HEIGHT) { star.y = -3; star.x = Phaser.Math.Between(8, GAME_WIDTH - 8); } }
    if (!this.running) return;
    if (Phaser.Input.Keyboard.JustDown(this.controls.pause)) this.togglePause();
    if (this.paused) return;
    if (Phaser.Input.Keyboard.JustDown(this.controls.enter) && !this.ship?.visible) this.startGame();
    if (!this.ship) return;
    const boostRemaining = this.speedBoostUntil - this.time.now;
    if (boostRemaining > 0) {
      const countdown = (boostRemaining / 1000).toFixed(1);
      if (countdown !== this.lastBoostCountdown) { this.lastBoostCountdown = countdown; this.showPowerupToast(`SPEED BOOST · ${countdown}s`); }
    } else if (this.speedBoostUntil > 0) {
      this.speedBoostUntil = 0; this.lastBoostCountdown = ''; this.setShipFlameBoost(false); this.showPowerupToast('SPEED BOOST ENDED', 1000);
    }
    const body = this.ship.body as Phaser.Physics.Arcade.Body; const speed = 300 * (boostRemaining > 0 ? SPEED_BOOST_MULTIPLIER : 1); body.setVelocity(0);
    if (this.controls.left.isDown || this.controls.leftArrow.isDown) body.setVelocityX(-speed);
    if (this.controls.right.isDown || this.controls.rightArrow.isDown) body.setVelocityX(speed);
    if (this.controls.up.isDown || this.controls.upArrow.isDown) body.setVelocityY(-speed);
    if (this.controls.down.isDown || this.controls.downArrow.isDown) body.setVelocityY(speed);
    body.velocity.normalize().scale(speed);
    if (this.controls.fire.isDown) this.shoot();
    this.bullets.children.each((obj) => { const bullet = obj as Phaser.GameObjects.Arc; if (bullet.active && bullet.y < -20) bullet.setActive(false).setVisible(false); return true; });
    this.enemies.children.each((obj) => { const enemy = obj as Phaser.GameObjects.Arc; if (enemy.active) { const g = enemy.getData('graphic') as Phaser.GameObjects.Graphics; if (g) { g.setPosition(enemy.x, enemy.y); g.rotation += delta * 0.0006; } if (enemy.y > GAME_HEIGHT + 30) { (enemy.getData('graphic') as Phaser.GameObjects.Graphics)?.destroy(); enemy.setActive(false).setVisible(false); } } return true; });
    this.bonuses.children.each((obj) => { const bonus = obj as Phaser.Physics.Arcade.Sprite; if (bonus.active && bonus.y > GAME_HEIGHT + 24) { bonus.setActive(false).setVisible(false); (bonus.body as Phaser.Physics.Arcade.Body).enable = false; } return true; });
  }
}

const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: GAME_WIDTH, height: GAME_HEIGHT, backgroundColor: '#080b16', transparent: false, physics: { default: 'arcade', arcade: { debug: false } }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_WIDTH, height: GAME_HEIGHT }, scene: [SpaceScene], render: { antialias: true, pixelArt: false } });
const scene = () => game.scene.getScene('space') as SpaceScene;
document.querySelector('#start-button')?.addEventListener('click', () => scene().startGame());
document.querySelector('#restart-button')?.addEventListener('click', () => scene().startGame());
document.querySelector('#settings-button')?.addEventListener('click', () => {
  document.querySelector('#over-screen')?.classList.add('hidden');
  document.querySelector('#start-screen')?.classList.remove('hidden');
  document.querySelector('#hud')?.classList.remove('visible');
  document.querySelector('#run-state')!.textContent = 'STANDBY';
});
document.querySelector('#resume-button')?.addEventListener('click', () => scene().togglePause());
document.querySelector('#pause-button')?.addEventListener('click', () => scene().togglePause());
const gameFrame = document.querySelector<HTMLElement>('#game-frame')!;
const fullscreenButton = document.querySelector<HTMLButtonElement>('#fullscreen-button')!;

function syncFullscreenControl() {
  const isFullscreen = document.fullscreenElement === gameFrame;
  fullscreenButton.textContent = isFullscreen ? '×' : '⛶';
  fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenButton.title = isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-pressed', String(isFullscreen));
  window.requestAnimationFrame(() => game.scale.refresh());
}

fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await gameFrame.requestFullscreen();
  } catch { fullscreenButton.title = 'Fullscreen is unavailable in this browser'; }
});
document.addEventListener('fullscreenchange', syncFullscreenControl);
document.querySelectorAll<HTMLButtonElement>('.difficulty-option').forEach(button => button.addEventListener('click', () => {
  selectedDifficulty = button.dataset.difficulty as DifficultyId;
  document.querySelectorAll('.difficulty-option').forEach(option => {
    const selected = option === button;
    option.classList.toggle('selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
}));
document.querySelector('#sound-toggle')?.addEventListener('click', e => { e.preventDefault(); soundEnabled = !soundEnabled; document.querySelector('#sound-icon')!.textContent = soundEnabled ? '◖' : '◗'; document.querySelector('#sound-toggle')!.setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound'); if (soundEnabled) playTone(520, 0.08); else if ('speechSynthesis' in window) window.speechSynthesis.cancel(); });
window.addEventListener('keydown', e => { if (e.code === 'Enter' && (!document.querySelector('#start-screen')!.classList.contains('hidden') || !document.querySelector('#over-screen')!.classList.contains('hidden'))) scene().startGame(); });

function getSharePayload() {
  return {
    title: 'My VOIDRUNNER personal best',
    text: `I reached Sector ${personalBest.sector} with ${personalBest.score.toLocaleString()} points in VOIDRUNNER. Can you beat my run?`,
    url: window.location.href,
  };
}

async function copyShareText() {
  const payload = getSharePayload();
  const text = `${payload.text}\n${payload.url}`;
  const status = document.querySelector<HTMLElement>('#share-status')!;
  try {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.appendChild(field); field.select(); const copied = document.execCommand('copy'); field.remove();
      if (!copied) throw new Error('Clipboard unavailable');
    }
    status.textContent = 'PERSONAL BEST COPIED — PASTE IT INTO YOUR CHAT';
  } catch { status.textContent = 'COULD NOT COPY — TRY YOUR BROWSER SHARE MENU'; }
}

document.querySelector('#share-discord')?.addEventListener('click', () => { void copyShareText(); });
document.querySelector('#share-native')?.addEventListener('click', async () => {
  const payload = getSharePayload(); const status = document.querySelector<HTMLElement>('#share-status')!;
  if (!navigator.share) { await copyShareText(); return; }
  try { await navigator.share(payload); status.textContent = 'SHARE READY — SEND YOUR CHALLENGE'; }
  catch (error) { if (error instanceof Error && error.name !== 'AbortError') status.textContent = 'SHARING IS UNAVAILABLE RIGHT NOW'; }
});

document.querySelectorAll<HTMLButtonElement>('[data-share]').forEach(button => button.addEventListener('click', () => {
  const payload = getSharePayload(); const url = encodeURIComponent(payload.url); const text = encodeURIComponent(payload.text);
  const destinations: Record<string, string> = {
    x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    reddit: `https://www.reddit.com/submit?url=${url}&title=${encodeURIComponent('My VOIDRUNNER personal best')}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${payload.text} ${payload.url}`)}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  };
  const destination = destinations[button.dataset.share ?? ''];
  if (destination) window.open(destination, '_blank', 'noopener,noreferrer');
}));

