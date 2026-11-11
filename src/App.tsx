/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NEON VANGUARD — Complete Self-Contained Top-Down Synthwave Space Shooter
 * Built with HTML5 Canvas, Web Audio API, and Vanilla TypeScript/JavaScript inside a single file.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Zap,
  Heart,
  Sparkles,
  Trophy,
  Gamepad2,
  Smartphone,
  Flame,
  Crosshair,
} from 'lucide-react';

// ============================================================================
// 1. GAME STATE & CONFIGURATION
// ============================================================================

type ScreenState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type EnemyType =
  | 'DRONE'
  | 'ZIGZAGGER'
  | 'SHOOTER'
  | 'TANK'
  | 'STALKER'
  | 'SWARMER'
  | 'PRISM';
type PowerUpType = 'WEAPON' | 'SHIELD' | 'HEALTH' | 'BOMB';
type BossAttackPattern = 'SPREAD' | 'AIMED' | 'SPIRAL';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  layer: number; // 0 = slow distant, 1 = mid, 2 = fast foreground
  color: string;
  alpha: number;
}

interface Bullet {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isPlayer: boolean;
  damage: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  drag: number;
}

interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

interface Enemy {
  active: boolean;
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  color: string;
  scoreValue: number;
  shootTimer: number;
  shootInterval: number;
  sineOffset: number;
  initialX: number;
  targetY: number;
  hitFlash: number;
  // Extended state for new enemy types (Stalker, Swarmer, Prism)
  aiPhase: 'ENTER' | 'LOCK' | 'DIVE' | 'EVADE' | 'CHARGE_LASER' | 'FIRE_LASER';
  phaseTimer: number;
  aimAngle: number;
  laserAlpha: number;
}

interface Boss {
  active: boolean;
  name: string;
  x: number;
  y: number;
  targetY: number;
  vx: number;
  radius: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  pattern: BossAttackPattern;
  patternTimer: number;
  shootTimer: number;
  spiralAngle: number;
  hitFlash: number;
  entering: boolean;
  waveNumber: number;
}

interface PowerUp {
  active: boolean;
  type: PowerUpType;
  x: number;
  y: number;
  vy: number;
  radius: number;
  angle: number;
  pulse: number;
}

interface Shockwave {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number; // visual radius
  hitboxRadius: number; // smaller fair hitbox
  hp: number;
  maxHp: number;
  weaponLevel: number; // 1 = single, 2 = double, 3 = triple spread
  shieldActive: boolean;
  invincibleTimer: number;
  shootCooldown: number;
  bankAngle: number; // visual tilt when strafing
  thrusterPhase: number;
  // Ultimate Ability ("Hyperion Beam + Aegis Overdrive")
  ultCharge: number; // 0 to 100
  ultActiveTimer: number; // > 0 while Ultimate is firing
  ultMaxDuration: number; // 4.0 seconds
  ultTickTimer: number; // controls continuous beam damage ticks
}

interface HudSnapshot {
  score: number;
  highScore: number;
  wave: number;
  hp: number;
  maxHp: number;
  weaponLevel: number;
  shield: boolean;
  combo: number;
  comboProgress: number; // 0 to 1
  comboTierLabel: string;
  ultCharge: number; // 0 to 100
  ultActive: boolean;
  ultRemainingProgress: number; // 0 to 1
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: 1 | 2;
  kills: number;
  maxCombo: number;
  isNewHighScore: boolean;
}

// Neon Synthwave Color Palette
const COLORS = {
  bgDeep: '#070312',
  bgMid: '#12062c',
  cyan: '#00f3ff',
  magenta: '#ff007f',
  yellow: '#ffe600',
  purple: '#b537f2',
  green: '#00ff9d',
  orange: '#ff5e00',
  red: '#ff1744',
  white: '#ffffff',
};

// Combo Configuration Constants
const COMBO_TIME_WINDOW = 3.8; // Seconds to get next kill before combo resets
const COMBO_MAX_MULTIPLIER = 15; // Maximum multiplier cap

function getComboTierLabel(combo: number): string {
  if (combo >= 15) return 'GODLIKE';
  if (combo >= 10) return 'RAMPAGE';
  if (combo >= 5) return 'BLITZ';
  if (combo >= 2) return 'STREAK';
  return 'BASE';
}

// High Score Storage with fallback
let memoryHighScore = 0;
const HIGH_SCORE_KEY = 'neon_vanguard_high_score_v1';

function loadHighScore(): number {
  try {
    const saved = window.localStorage.getItem(HIGH_SCORE_KEY);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        memoryHighScore = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback to in-memory storage if localStorage is blocked/unavailable
  }
  return memoryHighScore;
}

function saveHighScore(score: number): void {
  memoryHighScore = Math.max(memoryHighScore, score);
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(memoryHighScore));
  } catch {
    // Fallback already updated in memoryHighScore
  }
}

// ============================================================================
// 2. PROCEDURAL WEB AUDIO ENGINE (Zero external audio files)
// ============================================================================

class SynthAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  private beatIntervalId: number | null = null;
  private beatStep: number = 0;
  private isPlayingBeat: boolean = false;

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopBackgroundBeat();
    } else if (this.isPlayingBeat) {
      this.startBackgroundBeat();
    }
  }

  // Player Laser Shoot
  public playShoot(weaponLevel: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = weaponLevel >= 3 ? 'sawtooth' : 'triangle';
    const startFreq = weaponLevel === 1 ? 760 : weaponLevel === 2 ? 840 : 920;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);

    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  // Subtle metallic hit tick when an enemy takes non-lethal damage
  public playHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);

    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  // Ultimate Ability Activation: Deep Sub Drop + Ascending Harmonic Laser Chord
  public playUltimateActivate(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Sub-bass impact sweep
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.85);
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.86);

    // 2. Ascending Hyperion power chord
    const chordFreqs = [261.63, 329.63, 392.0, 523.25, 659.25]; // C major synth power spread
    chordFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * 0.5, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.35);
      osc.frequency.setValueAtTime(freq * 1.5, now + 0.35);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.12);
    });
  }

  // Ultimate Ready Notification Chime
  public playUltimateReady(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  }

  // Combo Milestone Chime
  public playComboMilestone(combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const baseFreq = combo >= 15 ? 783.99 : combo >= 10 ? 659.25 : 523.25;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  // Enemy Prism Laser Discharge Sound
  public playEnemyLaser(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.22);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  // Explosion (filtered white noise + low sub drop)
  public playExplosion(size: 'small' | 'large' | 'boss' = 'small'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = size === 'boss' ? 0.9 : size === 'large' ? 0.42 : 0.22;
    const volume = size === 'boss' ? 0.28 : size === 'large' ? 0.16 : 0.11;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(size === 'boss' ? 1200 : 900, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(size === 'boss' ? 140 : 110, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + duration);

    subGain.gain.setValueAtTime(volume * 0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + duration);
  }

  // Power-up pickup ascending synth chime
  public playPowerUp(type: PowerUpType): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (type === 'BOMB') {
      this.playExplosion('boss');
      return;
    }

    const now = ctx.currentTime;
    const notes =
      type === 'WEAPON'
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === 'SHIELD'
        ? [440, 554.37, 659.25, 880]
        : [587.33, 739.99, 880, 1174.66];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const startTime = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.11, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.17);
    });
  }

  // Player Damage / Shield Break
  public playDamage(shieldAbsorbed: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    if (shieldAbsorbed) {
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.28);
    } else {
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.linearRampToValueAtTime(65, now + 0.35);
    }

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  // Boss Warning Siren
  public playBossWarning(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const start = now + i * 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, start);
      osc.frequency.linearRampToValueAtTime(440, start + 0.22);
      osc.frequency.linearRampToValueAtTime(220, start + 0.4);

      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.43);
    }
  }

  // Game Over Retro Synth Descent
  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [392.0, 349.23, 329.63, 261.63];
    freqs.forEach((f, idx) => {
      const start = now + idx * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.linearRampToValueAtTime(f * 0.96, start + 0.2);

      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  // Looping Synthwave Bassline Beat
  public startBackgroundBeat(): void {
    this.isPlayingBeat = true;
    if (this.isMuted) return;
    if (this.beatIntervalId !== null) return;

    const bassNotes = [
      65.41, 65.41, 130.81, 65.41,
      77.78, 77.78, 155.56, 77.78,
      87.31, 87.31, 174.61, 87.31,
      98.0, 98.0, 116.54, 98.0,
    ];

    this.beatStep = 0;
    this.beatIntervalId = window.setInterval(() => {
      if (this.isMuted || !this.isPlayingBeat) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const freq = bassNotes[this.beatStep % bassNotes.length];

      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.14);

      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.17);

      if (this.beatStep % 4 === 0) {
        const kick = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(110, now);
        kick.frequency.exponentialRampToValueAtTime(36, now + 0.12);

        kickGain.gain.setValueAtTime(0.07, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        kick.connect(kickGain);
        kickGain.connect(ctx.destination);
        kick.start(now);
        kick.stop(now + 0.14);
      }

      this.beatStep++;
    }, 150);
  }

  public stopBackgroundBeat(): void {
    if (this.beatIntervalId !== null) {
      clearInterval(this.beatIntervalId);
      this.beatIntervalId = null;
    }
  }
}

const audio = new SynthAudioEngine();

// ============================================================================
// 3. MAIN APPLICATION COMPONENT & GAME ENGINE
// ============================================================================

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // React UI state synchronized with the game engine
  const [screen, setScreen] = useState<ScreenState>('START');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [bannerText, setBannerText] = useState<{ title: string; subtitle: string; isBoss: boolean } | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    highScore: loadHighScore(),
    wave: 1,
    hp: 3,
    maxHp: 5,
    weaponLevel: 1,
    shield: false,
    combo: 1,
    comboProgress: 0,
    comboTierLabel: 'BASE',
    ultCharge: 0,
    ultActive: false,
    ultRemainingProgress: 0,
    bossActive: false,
    bossName: '',
    bossHp: 0,
    bossMaxHp: 1,
    bossPhase: 1,
    kills: 0,
    maxCombo: 1,
    isNewHighScore: false,
  });

  // Mutable Game Engine Reference
  const engineRef = useRef<{
    screen: ScreenState;
    width: number;
    height: number;
    score: number;
    highScore: number;
    isNewHighScore: boolean;
    wave: number;
    kills: number;
    combo: number;
    maxCombo: number;
    comboTimer: number;
    comboMaxTime: number;
    screenShake: number;
    gridOffset: number;

    // Wave & Spawning State
    waveState: 'BANNER' | 'SPAWNING' | 'BOSS_WARNING' | 'BOSS_FIGHT' | 'WAVE_CLEAR';
    waveBannerTimer: number;
    enemiesToSpawn: EnemyType[];
    spawnTimer: number;
    spawnInterval: number;
    nextEnemyId: number;

    // Input State
    keys: Record<string, boolean>;
    touchActive: boolean;
    touchTargetX: number;
    touchTargetY: number;

    // Entities & Object Pools
    player: Player;
    stars: Star[];
    bullets: Bullet[];
    particles: Particle[];
    floatingTexts: FloatingText[];
    enemies: Enemy[];
    powerUps: PowerUp[];
    shockwaves: Shockwave[];
    boss: Boss;
  }>({
    screen: 'START',
    width: window.innerWidth,
    height: window.innerHeight,
    score: 0,
    highScore: loadHighScore(),
    isNewHighScore: false,
    wave: 1,
    kills: 0,
    combo: 1,
    maxCombo: 1,
    comboTimer: 0,
    comboMaxTime: COMBO_TIME_WINDOW,
    screenShake: 0,
    gridOffset: 0,

    waveState: 'BANNER',
    waveBannerTimer: 0,
    enemiesToSpawn: [],
    spawnTimer: 0,
    spawnInterval: 1.0,
    nextEnemyId: 1,

    keys: {},
    touchActive: false,
    touchTargetX: window.innerWidth / 2,
    touchTargetY: window.innerHeight * 0.78,

    player: {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.8,
      vx: 0,
      vy: 0,
      radius: 20,
      hitboxRadius: 11,
      hp: 3,
      maxHp: 5,
      weaponLevel: 1,
      shieldActive: false,
      invincibleTimer: 0,
      shootCooldown: 0,
      bankAngle: 0,
      thrusterPhase: 0,
      ultCharge: 0,
      ultActiveTimer: 0,
      ultMaxDuration: 4.0,
      ultTickTimer: 0,
    },
    stars: [],
    bullets: Array.from({ length: 300 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      color: COLORS.cyan,
      isPlayer: true,
      damage: 1,
    })),
    particles: Array.from({ length: 480 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 3,
      color: COLORS.cyan,
      alpha: 1,
      life: 0,
      maxLife: 0.5,
      drag: 0.96,
    })),
    floatingTexts: Array.from({ length: 50 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -40,
      text: '',
      color: COLORS.yellow,
      life: 0,
      maxLife: 0.9,
      scale: 1,
    })),
    enemies: [],
    powerUps: [],
    shockwaves: Array.from({ length: 12 }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 10,
      maxRadius: 500,
      color: COLORS.cyan,
      alpha: 1,
    })),
    boss: {
      active: false,
      name: 'OMEGA VALKYRIE',
      x: 0,
      y: -120,
      targetY: 135,
      vx: 110,
      radius: 56,
      hp: 100,
      maxHp: 100,
      phase: 1,
      pattern: 'SPREAD',
      patternTimer: 0,
      shootTimer: 0,
      spiralAngle: 0,
      hitFlash: 0,
      entering: true,
      waveNumber: 5,
    },
  });

  // ==========================================================================
  // 4. OBJECT POOLING & SPAWN HELPERS
  // ==========================================================================

  const initStars = useCallback((width: number, height: number) => {
    const stars: Star[] = [];
    const layerConfigs = [
      { count: 55, speedMin: 20, speedMax: 38, sizeMin: 1.0, sizeMax: 1.8, color: '#9d4edd', alpha: 0.45 },
      { count: 40, speedMin: 65, speedMax: 105, sizeMin: 1.6, sizeMax: 2.6, color: '#00f3ff', alpha: 0.7 },
      { count: 22, speedMin: 155, speedMax: 240, sizeMin: 2.2, sizeMax: 3.4, color: '#ff007f', alpha: 0.92 },
    ];

    layerConfigs.forEach((cfg, layerIdx) => {
      for (let i = 0; i < cfg.count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin),
          speed: cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin),
          layer: layerIdx,
          color: Math.random() > 0.82 ? COLORS.yellow : cfg.color,
          alpha: cfg.alpha,
        });
      }
    });

    engineRef.current.stars = stars;
  }, []);

  const spawnBullet = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    isPlayer: boolean,
    color: string,
    radius = 4.5,
    damage = 1
  ) => {
    const pool = engineRef.current.bullets;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        const b = pool[i];
        b.active = true;
        b.x = x;
        b.y = y;
        b.vx = vx;
        b.vy = vy;
        b.isPlayer = isPlayer;
        b.color = color;
        b.radius = radius;
        b.damage = damage;
        return;
      }
    }
  };

  const spawnParticleBurst = (
    x: number,
    y: number,
    color: string,
    count: number,
    speedMin = 40,
    speedMax = 260,
    sizeMin = 2,
    sizeMax = 5.5
  ) => {
    const pool = engineRef.current.particles;
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      if (!pool[i].active) {
        const p = pool[i];
        const angle = Math.random() * Math.PI * 2;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
        p.color = Math.random() > 0.78 ? COLORS.white : color;
        p.alpha = 1;
        p.life = 0;
        p.maxLife = 0.28 + Math.random() * 0.45;
        p.drag = 0.94;
        spawned++;
      }
    }
  };

  const spawnFloatingText = (x: number, y: number, text: string, color: string, scale = 1) => {
    const pool = engineRef.current.floatingTexts;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        const ft = pool[i];
        ft.active = true;
        ft.x = x;
        ft.y = y;
        ft.vy = -55;
        ft.text = text;
        ft.color = color;
        ft.life = 0;
        ft.maxLife = 0.95;
        ft.scale = scale;
        return;
      }
    }
  };

  const spawnShockwave = (x: number, y: number, color: string, maxRadius = 650) => {
    const pool = engineRef.current.shockwaves;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        const sw = pool[i];
        sw.active = true;
        sw.x = x;
        sw.y = y;
        sw.radius = 12;
        sw.maxRadius = maxRadius;
        sw.color = color;
        sw.alpha = 1;
        return;
      }
    }
  };

  const addUltimateCharge = (amount: number) => {
    const p = engineRef.current.player;
    if (p.ultActiveTimer > 0) return; // Don't charge while actively firing ultimate
    const prev = p.ultCharge;
    p.ultCharge = Math.min(100, p.ultCharge + amount);
    if (prev < 100 && p.ultCharge >= 100) {
      audio.playUltimateReady();
      spawnFloatingText(p.x, p.y - 34, 'ULTIMATE READY! [E / SHIFT]', COLORS.yellow, 1.3);
      spawnShockwave(p.x, p.y, COLORS.yellow, 160);
    }
  };

  const maybeSpawnPowerUp = (x: number, y: number, guaranteed = false) => {
    const roll = Math.random();
    if (!guaranteed && roll > 0.16) return;

    const pRoll = Math.random();
    let type: PowerUpType = 'WEAPON';
    if (pRoll < 0.34) {
      type = 'WEAPON';
    } else if (pRoll < 0.62) {
      type = 'SHIELD';
    } else if (pRoll < 0.85) {
      type = 'HEALTH';
    } else {
      type = 'BOMB';
    }

    engineRef.current.powerUps.push({
      active: true,
      type,
      x,
      y,
      vy: 95,
      radius: 15,
      angle: 0,
      pulse: 0,
    });
  };

  // ==========================================================================
  // 5. WAVE & BOSS SPAWNING SYSTEM (Including 3 New Enemy Archetypes)
  // ==========================================================================

  const prepareWave = useCallback((waveNum: number) => {
    const eng = engineRef.current;
    eng.wave = waveNum;
    eng.spawnTimer = 0;

    const isBossWave = waveNum % 5 === 0;
    if (isBossWave) {
      eng.waveState = 'BOSS_WARNING';
      eng.waveBannerTimer = 2.6;
      const bossNames = ['OMEGA VALKYRIE', 'HYPERION CORE', 'CHRONOS LEVIATHAN', 'NEMESIS PRIME'];
      const bossIndex = Math.floor(waveNum / 5 - 1) % bossNames.length;
      const bossName = bossNames[bossIndex];
      setBannerText({
        title: 'WARNING: BOSS INCOMING',
        subtitle: `WAVE ${waveNum} // ${bossName}`,
        isBoss: true,
      });
      audio.playBossWarning();
    } else {
      eng.waveState = 'BANNER';
      eng.waveBannerTimer = 1.9;
      setBannerText({
        title: `WAVE ${waveNum}`,
        subtitle:
          waveNum === 1
            ? 'DEFEND THE SECTOR'
            : waveNum === 2
            ? 'SWARMER & STALKER SIGNATURES DETECTED'
            : 'HIGH-THREAT ARMADA INBOUND',
        isBoss: false,
      });

      // Build wave enemy queue with all 7 enemy types progressively mixed
      const totalGroups = 9 + waveNum * 4;
      const queue: EnemyType[] = [];
      for (let i = 0; i < totalGroups; i++) {
        const r = Math.random();
        if (waveNum === 1) {
          if (r < 0.55) queue.push('DRONE');
          else if (r < 0.82) queue.push('ZIGZAGGER');
          else queue.push('SWARMER');
        } else if (waveNum === 2) {
          if (r < 0.32) queue.push('DRONE');
          else if (r < 0.56) queue.push('ZIGZAGGER');
          else if (r < 0.76) queue.push('SWARMER');
          else if (r < 0.9) queue.push('SHOOTER');
          else queue.push('STALKER');
        } else {
          if (r < 0.22) queue.push('DRONE');
          else if (r < 0.38) queue.push('ZIGZAGGER');
          else if (r < 0.54) queue.push('SWARMER');
          else if (r < 0.68) queue.push('SHOOTER');
          else if (r < 0.81) queue.push('STALKER');
          else if (r < 0.92) queue.push('PRISM');
          else queue.push('TANK');
        }
      }
      eng.enemiesToSpawn = queue;
      eng.spawnInterval = Math.max(0.32, 1.05 - waveNum * 0.055);
    }
  }, []);

  const spawnEnemyOfType = (type: EnemyType) => {
    const eng = engineRef.current;
    const margin = 52;
    const x = margin + Math.random() * Math.max(100, eng.width - margin * 2);
    const y = -40;
    const speedScale = 1 + (eng.wave - 1) * 0.055;

    if (type === 'DRONE') {
      eng.enemies.push({
        active: true,
        id: eng.nextEnemyId++,
        type: 'DRONE',
        x,
        y,
        vx: 0,
        vy: (135 + Math.random() * 45) * speedScale,
        radius: 16,
        hp: 1 + Math.floor(eng.wave / 6),
        maxHp: 1 + Math.floor(eng.wave / 6),
        color: COLORS.cyan,
        scoreValue: 100,
        shootTimer: 0,
        shootInterval: 999,
        sineOffset: 0,
        initialX: x,
        targetY: 0,
        hitFlash: 0,
        aiPhase: 'ENTER',
        phaseTimer: 0,
        aimAngle: Math.PI / 2,
        laserAlpha: 0,
      });
    } else if (type === 'ZIGZAGGER') {
      eng.enemies.push({
        active: true,
        id: eng.nextEnemyId++,
        type: 'ZIGZAGGER',
        x,
        y,
        vx: 0,
        vy: (115 + Math.random() * 35) * speedScale,
        radius: 17,
        hp: 2 + Math.floor(eng.wave / 5),
        maxHp: 2 + Math.floor(eng.wave / 5),
        color: COLORS.yellow,
        scoreValue: 160,
        shootTimer: 0,
        shootInterval: 999,
        sineOffset: Math.random() * Math.PI * 2,
        initialX: x,
        targetY: 0,
        hitFlash: 0,
        aiPhase: 'ENTER',
        phaseTimer: 0,
        aimAngle: Math.PI / 2,
        laserAlpha: 0,
      });
    } else if (type === 'SHOOTER') {
      const targetY = 85 + Math.random() * 115;
      eng.enemies.push({
        active: true,
        id: eng.nextEnemyId++,
        type: 'SHOOTER',
        x,
        y,
        vx: (Math.random() > 0.5 ? 1 : -1) * 65 * speedScale,
        vy: 150 * speedScale,
        radius: 19,
        hp: 3 + Math.floor(eng.wave / 4),
        maxHp: 3 + Math.floor(eng.wave / 4),
        color: COLORS.magenta,
        scoreValue: 240,
        shootTimer: 0.6 + Math.random() * 0.6,
        shootInterval: Math.max(1.05, 2.1 - eng.wave * 0.06),
        sineOffset: 0,
        initialX: x,
        targetY,
        hitFlash: 0,
        aiPhase: 'ENTER',
        phaseTimer: 0,
        aimAngle: Math.PI / 2,
        laserAlpha: 0,
      });
    } else if (type === 'TANK') {
      const tankHp = 9 + eng.wave * 2;
      eng.enemies.push({
        active: true,
        id: eng.nextEnemyId++,
        type: 'TANK',
        x,
        y,
        vx: 0,
        vy: 58 * speedScale,
        radius: 28,
        hp: tankHp,
        maxHp: tankHp,
        color: COLORS.orange,
        scoreValue: 450,
        shootTimer: 1.2,
        shootInterval: 2.2,
        sineOffset: 0,
        initialX: x,
        targetY: 0,
        hitFlash: 0,
        aiPhase: 'ENTER',
        phaseTimer: 0,
        aimAngle: Math.PI / 2,
        laserAlpha: 0,
      });
    } else if (type === 'STALKER') {
      // NEW ENEMY 1: Homing Kamikaze Interceptor — enters, locks onto player with laser sight, then dives at high speed
      const stalkerHp = 2 + Math.floor(eng.wave / 4);
      eng.enemies.push({
        active: true,
        id: eng.nextEnemyId++,
        type: 'STALKER',
        x,
        y,
        vx: 0,
        vy: 210 * speedScale,
        radius: 17,
        hp: stalkerHp,
        maxHp: stalkerHp,
        color: COLORS.red,
        scoreValue: 280,
        shootTimer: 0.35,
        shootInterval: 0.7,
        sineOffset: 0,
        initialX: x,
        targetY: 110 + Math.random() * 90,
        hitFlash: 0,
        aiPhase: 'ENTER',
        phaseTimer: 0.68, // Lock-on duration before kamikaze dive
        aimAngle: Math.PI / 2,
        laserAlpha: 0,
      });
    } else if (type === 'SWARMER') {
      // NEW ENEMY 2: Coordinated Micro-Swarm — spawns a synchronized cluster of 3 agile insectoid fighters
      const swarmCount = 3;
      const baseCenter = Math.max(90, Math.min(eng.width - 90, x));
      for (let s = 0; s < swarmCount; s++) {
        const offsetX = (s - 1) * 38;
        const offsetY = -Math.abs(s - 1) * 26;
        eng.enemies.push({
          active: true,
          id: eng.nextEnemyId++,
          type: 'SWARMER',
          x: baseCenter + offsetX,
          y: y + offsetY,
          vx: 0,
          vy: (155 + Math.random() * 20) * speedScale,
          radius: 13,
          hp: 1 + Math.floor(eng.wave / 7),
          maxHp: 1 + Math.floor(eng.wave / 7),
          color: COLORS.green,
          scoreValue: 130,
          shootTimer: 0.8 + s * 0.25,
          shootInterval: 1.9,
          sineOffset: s * 0.9,
          initialX: baseCenter + offsetX,
          targetY: 0,
          hitFlash: 0,
          aiPhase: 'ENTER',
          phaseTimer: 0,
          aimAngle: Math.PI / 2,
          laserAlpha: 0,
        });
      }
    } else if (type === 'PRISM') {
      // NEW ENEMY 3: Evasive Phase-Shifter & Vertical Tachyon Laser Caster
      const prismHp = 4 + Math.floor(eng.wave / 3);
      eng.enemies.push({
        active: true,
        id: eng.nextEnemyId++,
        type: 'PRISM',
        x,
        y,
        vx: (Math.random() > 0.5 ? 1 : -1) * 240 * speedScale,
        vy: 165 * speedScale,
        radius: 21,
        hp: prismHp,
        maxHp: prismHp,
        color: COLORS.purple,
        scoreValue: 340,
        shootTimer: 0,
        shootInterval: 2.5,
        sineOffset: 0,
        initialX: x,
        targetY: 95 + Math.random() * 85,
        hitFlash: 0,
        aiPhase: 'ENTER',
        phaseTimer: 1.1, // Evade time before charging laser
        aimAngle: Math.PI / 2,
        laserAlpha: 0,
      });
    }
  };

  const spawnBoss = (waveNum: number) => {
    const eng = engineRef.current;
    const bossNames = ['OMEGA VALKYRIE', 'HYPERION CORE', 'CHRONOS LEVIATHAN', 'NEMESIS PRIME'];
    const bossName = bossNames[Math.floor(waveNum / 5 - 1) % bossNames.length];
    const maxHp = 85 + waveNum * 28;

    eng.boss = {
      active: true,
      name: bossName,
      x: eng.width / 2,
      y: -110,
      targetY: 135,
      vx: 120 + waveNum * 6,
      radius: 56,
      hp: maxHp,
      maxHp,
      phase: 1,
      pattern: 'SPREAD',
      patternTimer: 0,
      shootTimer: 0.8,
      spiralAngle: 0,
      hitFlash: 0,
      entering: true,
      waveNumber: waveNum,
    };
  };

  // ==========================================================================
  // 6. GAME START / PAUSE / ULTIMATE / RESTART CONTROLS
  // ==========================================================================

  const syncHud = useCallback(() => {
    const eng = engineRef.current;
    const p = eng.player;
    setHud({
      score: eng.score,
      highScore: eng.highScore,
      wave: eng.wave,
      hp: p.hp,
      maxHp: p.maxHp,
      weaponLevel: p.weaponLevel,
      shield: p.shieldActive,
      combo: eng.combo,
      comboProgress: eng.combo > 1 ? Math.max(0, eng.comboTimer / eng.comboMaxTime) : 0,
      comboTierLabel: getComboTierLabel(eng.combo),
      ultCharge: Math.floor(p.ultCharge),
      ultActive: p.ultActiveTimer > 0,
      ultRemainingProgress: p.ultActiveTimer > 0 ? p.ultActiveTimer / p.ultMaxDuration : 0,
      bossActive: eng.boss.active,
      bossName: eng.boss.name,
      bossHp: Math.max(0, eng.boss.hp),
      bossMaxHp: eng.boss.maxHp,
      bossPhase: eng.boss.phase,
      kills: eng.kills,
      maxCombo: eng.maxCombo,
      isNewHighScore: eng.isNewHighScore,
    });
  }, []);

  // Activate Player Ultimate ("HYPERION BEAM + AEGIS OVERDRIVE")
  const activateUltimate = useCallback(() => {
    const eng = engineRef.current;
    if (eng.screen !== 'PLAYING') return;
    const p = eng.player;
    if (p.ultCharge < 100 || p.ultActiveTimer > 0) return;

    p.ultCharge = 0;
    p.ultActiveTimer = p.ultMaxDuration;
    p.ultTickTimer = 0;
    p.invincibleTimer = Math.max(p.invincibleTimer, p.ultMaxDuration + 0.5);
    eng.screenShake = 20;

    audio.playUltimateActivate();
    spawnShockwave(p.x, p.y, COLORS.cyan, 520);
    spawnShockwave(p.x, p.y, COLORS.yellow, 360);
    spawnParticleBurst(p.x, p.y, COLORS.cyan, 45, 80, 340, 2.5, 5.5);
    spawnFloatingText(p.x, p.y - 36, 'HYPERION OVERDRIVE!', COLORS.yellow, 1.45);
    syncHud();
  }, [syncHud]);

  const startNewGame = useCallback(() => {
    const eng = engineRef.current;
    eng.score = 0;
    eng.highScore = loadHighScore();
    eng.isNewHighScore = false;
    eng.wave = 1;
    eng.kills = 0;
    eng.combo = 1;
    eng.maxCombo = 1;
    eng.comboTimer = 0;
    eng.screenShake = 0;

    eng.player = {
      x: eng.width / 2,
      y: eng.height * 0.8,
      vx: 0,
      vy: 0,
      radius: 20,
      hitboxRadius: 11,
      hp: 3,
      maxHp: 5,
      weaponLevel: 1,
      shieldActive: false,
      invincibleTimer: 1.5,
      shootCooldown: 0,
      bankAngle: 0,
      thrusterPhase: 0,
      ultCharge: 25, // Start with 25% tactical reserve charge
      ultActiveTimer: 0,
      ultMaxDuration: 4.0,
      ultTickTimer: 0,
    };

    eng.touchActive = false;
    eng.touchTargetX = eng.player.x;
    eng.touchTargetY = eng.player.y;

    eng.enemies = [];
    eng.powerUps = [];
    eng.boss.active = false;
    eng.bullets.forEach((b) => {
      b.active = false;
    });
    eng.particles.forEach((p) => {
      p.active = false;
    });
    eng.floatingTexts.forEach((ft) => {
      ft.active = false;
    });
    eng.shockwaves.forEach((sw) => {
      sw.active = false;
    });

    eng.screen = 'PLAYING';
    setScreen('PLAYING');
    audio.startBackgroundBeat();
    prepareWave(1);
    syncHud();
  }, [prepareWave, syncHud]);

  const togglePause = useCallback(() => {
    const eng = engineRef.current;
    if (eng.screen === 'PLAYING') {
      eng.screen = 'PAUSED';
      setScreen('PAUSED');
      audio.stopBackgroundBeat();
    } else if (eng.screen === 'PAUSED') {
      eng.screen = 'PLAYING';
      setScreen('PLAYING');
      audio.startBackgroundBeat();
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audio.setMuted(next);
      return next;
    });
  }, []);

  // ==========================================================================
  // 7. INPUT LISTENERS (Desktop Keyboard + Ultimate Hotkeys + Mobile Touch)
  // ==========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      engineRef.current.keys[key] = true;

      if (e.code === 'Space') {
        engineRef.current.keys['space'] = true;
        if (engineRef.current.screen === 'START') {
          e.preventDefault();
          startNewGame();
        }
      }

      // Ultimate Ability Hotkeys: E, Shift, or X
      if (key === 'e' || key === 'shift' || key === 'x') {
        if (engineRef.current.screen === 'PLAYING') {
          e.preventDefault();
          activateUltimate();
        }
      }

      if (key === 'p' || e.key === 'Escape') {
        if (engineRef.current.screen === 'PLAYING' || engineRef.current.screen === 'PAUSED') {
          e.preventDefault();
          togglePause();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      engineRef.current.keys[key] = false;
      if (e.code === 'Space') {
        engineRef.current.keys['space'] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startNewGame, togglePause, activateUltimate]);

  // ==========================================================================
  // 8. MAIN GAME LOOP (Update, Collision Detection, & Canvas Rendering)
  // ==========================================================================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      engineRef.current.width = w;
      engineRef.current.height = h;

      engineRef.current.player.x = Math.min(Math.max(28, engineRef.current.player.x), w - 28);
      engineRef.current.player.y = Math.min(Math.max(40, engineRef.current.player.y), h - 36);

      if (engineRef.current.stars.length === 0) {
        initStars(w, h);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    let lastTime = performance.now();
    let hudSyncAccumulator = 0;

    // Helper: Award Score with Combo Multiplier & Milestone Bonuses
    const addScore = (basePoints: number, x: number, y: number, increaseCombo = true) => {
      const eng = engineRef.current;
      let milestoneBonus = 0;

      if (increaseCombo) {
        const prevCombo = eng.combo;
        eng.combo = Math.min(COMBO_MAX_MULTIPLIER, eng.combo + 1);
        eng.maxCombo = Math.max(eng.maxCombo, eng.combo);
        eng.comboTimer = eng.comboMaxTime;

        // Check Combo Milestone Bonuses (5x, 10x, 15x)
        if (prevCombo < 5 && eng.combo === 5) {
          milestoneBonus = 500;
          addUltimateCharge(15);
          audio.playComboMilestone(5);
          spawnFloatingText(x, y - 24, '5x BLITZ BONUS +500!', COLORS.cyan, 1.3);
        } else if (prevCombo < 10 && eng.combo === 10) {
          milestoneBonus = 1500;
          addUltimateCharge(25);
          audio.playComboMilestone(10);
          spawnFloatingText(x, y - 24, '10x RAMPAGE BONUS +1,500!', COLORS.magenta, 1.4);
        } else if (prevCombo < 15 && eng.combo === 15) {
          milestoneBonus = 3000;
          addUltimateCharge(40);
          audio.playComboMilestone(15);
          spawnFloatingText(x, y - 24, '15x GODLIKE BONUS +3,000!', COLORS.yellow, 1.5);
        }
      }

      const gained = basePoints * eng.combo + milestoneBonus;
      eng.score += gained;
      if (eng.score > eng.highScore) {
        eng.highScore = eng.score;
        eng.isNewHighScore = true;
        saveHighScore(eng.highScore);
      }

      spawnFloatingText(
        x,
        y,
        eng.combo > 1 ? `+${(basePoints * eng.combo).toLocaleString()} (${eng.combo}x)` : `+${basePoints}`,
        eng.combo >= 10 ? COLORS.magenta : eng.combo >= 5 ? COLORS.yellow : COLORS.cyan,
        eng.combo >= 10 ? 1.25 : eng.combo >= 5 ? 1.15 : 1.0
      );
    };

    // Helper: Trigger Bomb Detonation
    const triggerBombDetonation = () => {
      const eng = engineRef.current;
      eng.screenShake = 18;
      spawnShockwave(eng.player.x, eng.player.y, COLORS.cyan, Math.max(eng.width, eng.height));
      spawnShockwave(eng.player.x, eng.player.y, COLORS.magenta, Math.max(eng.width, eng.height) * 0.75);

      eng.bullets.forEach((b) => {
        if (b.active && !b.isPlayer) {
          b.active = false;
          spawnParticleBurst(b.x, b.y, COLORS.cyan, 3, 20, 90, 1.5, 3);
        }
      });

      eng.enemies.forEach((e) => {
        if (e.active) {
          e.hp -= 12;
          e.hitFlash = 0.2;
          if (e.hp <= 0) {
            e.active = false;
            eng.kills++;
            spawnParticleBurst(e.x, e.y, e.color, 22, 50, 260);
            addScore(e.scoreValue, e.x, e.y, true);
          }
        }
      });

      if (eng.boss.active && !eng.boss.entering) {
        eng.boss.hp -= 30;
        eng.boss.hitFlash = 0.25;
        spawnParticleBurst(eng.boss.x, eng.boss.y, COLORS.magenta, 28, 60, 300);
      }
    };

    // Helper: Damage Player
    const damagePlayer = () => {
      const eng = engineRef.current;
      const p = eng.player;
      if (p.invincibleTimer > 0 || p.ultActiveTimer > 0) return;

      if (p.shieldActive) {
        p.shieldActive = false;
        p.invincibleTimer = 1.4;
        eng.screenShake = 10;
        audio.playDamage(true);
        spawnShockwave(p.x, p.y, COLORS.cyan, 180);
        spawnParticleBurst(p.x, p.y, COLORS.cyan, 26, 60, 240);
        spawnFloatingText(p.x, p.y - 24, 'SHIELD ABSORBED!', COLORS.cyan, 1.15);
        return;
      }

      // Reset combo on hull damage
      if (eng.combo > 1) {
        spawnFloatingText(p.x, p.y - 42, `COMBO ${eng.combo}x LOST!`, COLORS.orange, 1.15);
      }
      eng.combo = 1;
      eng.comboTimer = 0;
      p.hp -= 1;
      p.invincibleTimer = 2.0;
      eng.screenShake = 16;
      audio.playDamage(false);
      spawnParticleBurst(p.x, p.y, COLORS.magenta, 34, 60, 280);
      spawnFloatingText(p.x, p.y - 24, 'HULL BREACH -1 HP', COLORS.red, 1.15);

      if (p.hp <= 0) {
        p.hp = 0;
        eng.screen = 'GAME_OVER';
        setScreen('GAME_OVER');
        setBannerText(null);
        audio.stopBackgroundBeat();
        audio.playExplosion('boss');
        audio.playGameOver();
        spawnShockwave(p.x, p.y, COLORS.magenta, 450);
        spawnParticleBurst(p.x, p.y, COLORS.yellow, 65, 50, 340, 2.5, 6.5);
        syncHud();
      }
    };

    // ========================================================================
    // UPDATE STEP
    // ========================================================================
    const update = (dt: number) => {
      const eng = engineRef.current;
      const { width, height } = eng;

      // 1. Update Parallax Starfield & Horizon Grid
      eng.gridOffset = (eng.gridOffset + dt * 90) % 48;
      for (let i = 0; i < eng.stars.length; i++) {
        const s = eng.stars[i];
        const speedMult =
          eng.screen === 'PLAYING' && (eng.player.ultActiveTimer > 0 || (eng.boss.active && eng.boss.phase === 2))
            ? 1.65
            : 1.0;
        s.y += s.speed * speedMult * dt;
        if (s.y > height + 6) {
          s.y = -6;
          s.x = Math.random() * width;
        }
      }

      if (eng.screenShake > 0) {
        eng.screenShake = Math.max(0, eng.screenShake - dt * 42);
      }

      for (let i = 0; i < eng.particles.length; i++) {
        const pt = eng.particles[i];
        if (!pt.active) continue;
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          pt.active = false;
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= Math.pow(pt.drag, dt * 60);
        pt.vy *= Math.pow(pt.drag, dt * 60);
        pt.alpha = 1 - pt.life / pt.maxLife;
      }

      for (let i = 0; i < eng.shockwaves.length; i++) {
        const sw = eng.shockwaves[i];
        if (!sw.active) continue;
        sw.radius += (sw.maxRadius - sw.radius) * Math.min(1, dt * 6.5);
        sw.alpha -= dt * 1.65;
        if (sw.alpha <= 0) {
          sw.active = false;
        }
      }

      for (let i = 0; i < eng.floatingTexts.length; i++) {
        const ft = eng.floatingTexts[i];
        if (!ft.active) continue;
        ft.life += dt;
        ft.y += ft.vy * dt;
        if (ft.life >= ft.maxLife) {
          ft.active = false;
        }
      }

      if (eng.screen !== 'PLAYING') return;

      // 2. Combo Timer Decay
      if (eng.combo > 1) {
        eng.comboTimer -= dt;
        if (eng.comboTimer <= 0) {
          eng.combo = 1;
          eng.comboTimer = 0;
        }
      }

      // 3. Passive Survival Ultimate Charge (+2.5% per second)
      const p = eng.player;
      if (p.ultActiveTimer <= 0 && p.ultCharge < 100) {
        addUltimateCharge(dt * 2.5);
      }

      // 4. Player Movement
      p.thrusterPhase += dt * 22;
      if (p.invincibleTimer > 0) {
        p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
      }

      let inputX = 0;
      let inputY = 0;
      if (eng.keys['arrowleft'] || eng.keys['a']) inputX -= 1;
      if (eng.keys['arrowright'] || eng.keys['d']) inputX += 1;
      if (eng.keys['arrowup'] || eng.keys['w']) inputY -= 1;
      if (eng.keys['arrowdown'] || eng.keys['s']) inputY += 1;

      if (inputX !== 0 && inputY !== 0) {
        const inv = 1 / Math.SQRT2;
        inputX *= inv;
        inputY *= inv;
      }

      const accel = 2600;
      const maxSpeed = p.ultActiveTimer > 0 ? 520 : 460;
      const friction = 8.5;

      if (eng.touchActive) {
        const dx = eng.touchTargetX - p.x;
        const dy = eng.touchTargetY - p.y;
        p.vx = dx * 14;
        p.vy = dy * 14;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > maxSpeed * 1.35) {
          p.vx = (p.vx / speed) * maxSpeed * 1.35;
          p.vy = (p.vy / speed) * maxSpeed * 1.35;
        }
      } else {
        if (inputX !== 0) {
          p.vx += inputX * accel * dt;
        } else {
          p.vx -= p.vx * Math.min(1, friction * dt);
        }

        if (inputY !== 0) {
          p.vy += inputY * accel * dt;
        } else {
          p.vy -= p.vy * Math.min(1, friction * dt);
        }

        const speed = Math.hypot(p.vx, p.vy);
        if (speed > maxSpeed) {
          p.vx = (p.vx / speed) * maxSpeed;
          p.vy = (p.vy / speed) * maxSpeed;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const padX = 24;
      const padTop = 76;
      const padBottom = 34;
      p.x = Math.min(Math.max(padX, p.x), width - padX);
      p.y = Math.min(Math.max(padTop, p.y), height - padBottom);

      const targetBank = Math.max(-0.38, Math.min(0.38, (p.vx / maxSpeed) * 0.38));
      p.bankAngle += (targetBank - p.bankAngle) * Math.min(1, dt * 14);

      if (Math.random() < 0.65) {
        spawnParticleBurst(
          p.x + (Math.random() - 0.5) * 8,
          p.y + 18,
          p.ultActiveTimer > 0 ? COLORS.yellow : Math.random() > 0.5 ? COLORS.cyan : COLORS.magenta,
          1,
          30,
          95,
          1.8,
          3.2
        );
      }

      // 5. Player Ultimate Ability Active Logic ("HYPERION BEAM + AEGIS OVERDRIVE")
      if (p.ultActiveTimer > 0) {
        p.ultActiveTimer = Math.max(0, p.ultActiveTimer - dt);
        eng.screenShake = Math.max(eng.screenShake, 4.5);

        const beamHalfWidth = 36;
        // Vaporize all enemy bullets inside the Hyperion Beam column or touching the Aegis shield
        for (let i = 0; i < eng.bullets.length; i++) {
          const b = eng.bullets[i];
          if (!b.active || b.isPlayer) continue;
          const inBeam = b.y <= p.y && Math.abs(b.x - p.x) <= beamHalfWidth + b.radius;
          const inAegis = (b.x - p.x) ** 2 + (b.y - p.y) ** 2 <= (p.radius + 32) ** 2;
          if (inBeam || inAegis) {
            b.active = false;
            spawnParticleBurst(b.x, b.y, COLORS.yellow, 2, 30, 110, 1.5, 3);
          }
        }

        // Apply high-frequency beam damage ticks every 0.08s
        p.ultTickTimer -= dt;
        if (p.ultTickTimer <= 0) {
          p.ultTickTimer = 0.08;
          const tickDamage = 3.6;

          // Spawn rising plasma sparks along the beam
          spawnParticleBurst(
            p.x + (Math.random() - 0.5) * beamHalfWidth * 1.4,
            Math.random() * p.y,
            Math.random() > 0.5 ? COLORS.cyan : COLORS.yellow,
            3,
            50,
            180,
            2,
            4
          );

          // Damage enemies inside beam or Aegis field
          for (let j = eng.enemies.length - 1; j >= 0; j--) {
            const e = eng.enemies[j];
            if (!e.active) continue;
            const inBeam = e.y <= p.y + 10 && Math.abs(e.x - p.x) <= beamHalfWidth + e.radius;
            const inAegis = (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= (p.radius + 34 + e.radius) ** 2;
            if (inBeam || inAegis) {
              e.hp -= tickDamage;
              e.hitFlash = 0.09;
              spawnParticleBurst(e.x, e.y, COLORS.yellow, 4, 40, 160, 1.5, 3.5);
              if (e.hp <= 0) {
                e.active = false;
                eng.kills++;
                const isTank = e.type === 'TANK';
                audio.playExplosion(isTank ? 'large' : 'small');
                spawnParticleBurst(e.x, e.y, e.color, isTank ? 32 : 18, 50, 250);
                addScore(e.scoreValue, e.x, e.y, true);
                maybeSpawnPowerUp(e.x, e.y, isTank);
                eng.enemies.splice(j, 1);
              }
            }
          }

          // Damage Boss if inside Hyperion Beam
          const boss = eng.boss;
          if (boss.active && !boss.entering) {
            if (Math.abs(boss.x - p.x) <= beamHalfWidth + boss.radius) {
              boss.hp -= tickDamage;
              boss.hitFlash = 0.08;
              spawnParticleBurst(p.x, boss.y + 24, COLORS.yellow, 5, 50, 190, 2, 4);
              if (boss.hp <= 0) {
                boss.active = false;
                eng.kills++;
                eng.screenShake = 24;
                audio.playExplosion('boss');
                spawnShockwave(boss.x, boss.y, COLORS.magenta, 550);
                spawnShockwave(boss.x, boss.y, COLORS.yellow, 380);
                spawnParticleBurst(boss.x, boss.y, COLORS.magenta, 80, 60, 380, 2.5, 6.5);
                addScore(2500 + eng.wave * 200, boss.x, boss.y, true);
                maybeSpawnPowerUp(boss.x - 32, boss.y, true);
                maybeSpawnPowerUp(boss.x + 32, boss.y, true);
              }
            }
          }
        }
      }

      // 6. Player Primary Shooting
      p.shootCooldown = Math.max(0, p.shootCooldown - dt);
      const wantsToShoot = eng.keys['space'] || eng.touchActive;
      if (wantsToShoot && p.shootCooldown <= 0) {
        const fireRate = p.weaponLevel === 1 ? 0.16 : p.weaponLevel === 2 ? 0.145 : 0.13;
        p.shootCooldown = fireRate;
        audio.playShoot(p.weaponLevel);

        if (p.weaponLevel === 1) {
          spawnBullet(p.x, p.y - 20, 0, -760, true, COLORS.cyan, 4.5, 1);
        } else if (p.weaponLevel === 2) {
          spawnBullet(p.x - 11, p.y - 16, 0, -780, true, COLORS.cyan, 4.2, 1);
          spawnBullet(p.x + 11, p.y - 16, 0, -780, true, COLORS.cyan, 4.2, 1);
        } else {
          spawnBullet(p.x, p.y - 22, 0, -820, true, COLORS.yellow, 5.2, 1.5);
          spawnBullet(p.x - 13, p.y - 14, -145, -770, true, COLORS.cyan, 4.2, 1);
          spawnBullet(p.x + 13, p.y - 14, 145, -770, true, COLORS.cyan, 4.2, 1);
        }
      }

      // 7. Wave State Machine & Spawning
      if (eng.waveState === 'BANNER') {
        eng.waveBannerTimer -= dt;
        if (eng.waveBannerTimer <= 0) {
          setBannerText(null);
          eng.waveState = 'SPAWNING';
        }
      } else if (eng.waveState === 'BOSS_WARNING') {
        eng.waveBannerTimer -= dt;
        if (eng.waveBannerTimer <= 0) {
          setBannerText(null);
          eng.waveState = 'BOSS_FIGHT';
          spawnBoss(eng.wave);
        }
      } else if (eng.waveState === 'SPAWNING') {
        if (eng.enemiesToSpawn.length > 0) {
          eng.spawnTimer -= dt;
          if (eng.spawnTimer <= 0) {
            const nextType = eng.enemiesToSpawn.pop()!;
            spawnEnemyOfType(nextType);
            eng.spawnTimer = eng.spawnInterval * (0.75 + Math.random() * 0.5);
          }
        } else if (eng.enemies.length === 0) {
          prepareWave(eng.wave + 1);
        }
      } else if (eng.waveState === 'BOSS_FIGHT') {
        if (!eng.boss.active) {
          prepareWave(eng.wave + 1);
        }
      }

      // 8. Update Enemies (All 7 Types)
      for (let i = eng.enemies.length - 1; i >= 0; i--) {
        const e = eng.enemies[i];
        if (!e.active) {
          eng.enemies.splice(i, 1);
          continue;
        }

        if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

        if (e.type === 'DRONE') {
          e.y += e.vy * dt;
        } else if (e.type === 'ZIGZAGGER') {
          e.y += e.vy * dt;
          e.sineOffset += dt * 4.2;
          e.x = e.initialX + Math.sin(e.sineOffset) * 85;
          e.x = Math.max(26, Math.min(width - 26, e.x));
        } else if (e.type === 'SHOOTER') {
          if (e.y < e.targetY) {
            e.y += e.vy * dt;
          } else {
            e.x += e.vx * dt;
            if (e.x < 36 || e.x > width - 36) {
              e.vx *= -1;
              e.x = Math.max(36, Math.min(width - 36, e.x));
            }
          }
          e.shootTimer -= dt;
          if (e.shootTimer <= 0) {
            e.shootTimer = e.shootInterval;
            const angle = Math.atan2(p.y - e.y, p.x - e.x);
            const bSpeed = 290 + eng.wave * 10;
            spawnBullet(
              e.x,
              e.y + 16,
              Math.cos(angle) * bSpeed,
              Math.sin(angle) * bSpeed,
              false,
              COLORS.magenta,
              5
            );
          }
        } else if (e.type === 'TANK') {
          e.y += e.vy * dt;
          e.shootTimer -= dt;
          if (e.shootTimer <= 0) {
            e.shootTimer = e.shootInterval;
            const bSpeed = 240;
            [-0.28, 0, 0.28].forEach((offsetAngle) => {
              const angle = Math.PI / 2 + offsetAngle;
              spawnBullet(
                e.x,
                e.y + 24,
                Math.cos(angle) * bSpeed,
                Math.sin(angle) * bSpeed,
                false,
                COLORS.orange,
                6
              );
            });
          }
        } else if (e.type === 'STALKER') {
          // STALKER: Enters to targetY -> Locks onto player with telegraph -> High-speed kamikaze dive + rapid burst
          if (e.aiPhase === 'ENTER') {
            e.y += e.vy * dt;
            e.aimAngle = Math.atan2(p.y - e.y, p.x - e.x);
            if (e.y >= e.targetY) {
              e.aiPhase = 'LOCK';
              e.phaseTimer = 0.65;
            }
          } else if (e.aiPhase === 'LOCK') {
            e.aimAngle = Math.atan2(p.y - e.y, p.x - e.x);
            e.phaseTimer -= dt;
            if (e.phaseTimer <= 0) {
              e.aiPhase = 'DIVE';
              const diveSpeed = 470 + eng.wave * 12;
              e.vx = Math.cos(e.aimAngle) * diveSpeed;
              e.vy = Math.sin(e.aimAngle) * diveSpeed;
              // Fire rapid 2-shot burst on dive initiation
              spawnBullet(e.x, e.y, e.vx * 1.15, e.vy * 1.15, false, COLORS.red, 4.5);
            }
          } else if (e.aiPhase === 'DIVE') {
            // Slight homing adjustment while diving
            const desiredAngle = Math.atan2(p.y - e.y, p.x - e.x);
            const currentSpeed = Math.hypot(e.vx, e.vy);
            e.aimAngle += Math.sin(desiredAngle - e.aimAngle) * dt * 1.8;
            e.vx = Math.cos(e.aimAngle) * currentSpeed;
            e.vy = Math.sin(e.aimAngle) * currentSpeed;
            e.x += e.vx * dt;
            e.y += e.vy * dt;
          }
        } else if (e.type === 'SWARMER') {
          // SWARMER: Fast corkscrew pack flight + rapid needle darts
          e.y += e.vy * dt;
          e.sineOffset += dt * 6.5;
          e.x = e.initialX + Math.sin(e.sineOffset) * 52;
          e.x = Math.max(22, Math.min(width - 22, e.x));
          e.shootTimer -= dt;
          if (e.shootTimer <= 0) {
            e.shootTimer = e.shootInterval;
            spawnBullet(e.x, e.y + 12, (p.x - e.x) * 0.35, 340, false, COLORS.green, 4);
          }
        } else if (e.type === 'PRISM') {
          // PRISM: Evasive horizontal dasher that stops to charge & fire a vertical Tachyon Laser Beam
          e.sineOffset += dt * 4;
          if (e.aiPhase === 'ENTER') {
            e.y += e.vy * dt;
            if (e.y >= e.targetY) {
              e.y = e.targetY;
              e.aiPhase = 'EVADE';
              e.phaseTimer = 1.15;
            }
          } else if (e.aiPhase === 'EVADE') {
            e.x += e.vx * dt;
            if (e.x < 48 || e.x > width - 48) {
              e.vx *= -1;
              e.x = Math.max(48, Math.min(width - 48, e.x));
            }
            e.phaseTimer -= dt;
            if (e.phaseTimer <= 0) {
              e.aiPhase = 'CHARGE_LASER';
              e.phaseTimer = 0.75; // Telegraph warning duration
            }
          } else if (e.aiPhase === 'CHARGE_LASER') {
            e.phaseTimer -= dt;
            if (e.phaseTimer <= 0) {
              e.aiPhase = 'FIRE_LASER';
              e.phaseTimer = 0.55; // Active laser beam duration
              e.laserAlpha = 1;
              audio.playEnemyLaser();
            }
          } else if (e.aiPhase === 'FIRE_LASER') {
            e.phaseTimer -= dt;
            e.laserAlpha = Math.max(0, e.phaseTimer / 0.55);
            // Check if player is inside the vertical Tachyon Laser column
            if (p.y > e.y && Math.abs(p.x - e.x) < 12 + p.hitboxRadius) {
              damagePlayer();
            }
            if (e.phaseTimer <= 0) {
              e.aiPhase = 'EVADE';
              e.phaseTimer = 1.25;
              e.vx = (Math.random() > 0.5 ? 1 : -1) * Math.abs(e.vx);
            }
          }
        }

        // Remove if off screen bounds
        if (e.y > height + 60 || e.x < -80 || e.x > width + 80) {
          eng.enemies.splice(i, 1);
          continue;
        }

        // Player-Enemy Circle Collision
        const distSq = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        const minDist = e.radius + p.hitboxRadius;
        if (distSq < minDist * minDist) {
          e.active = false;
          spawnParticleBurst(e.x, e.y, e.color, 20, 40, 220);
          damagePlayer();
          eng.enemies.splice(i, 1);
        }
      }

      // 9. Update Boss (Every 5 Waves)
      const boss = eng.boss;
      if (boss.active) {
        if (boss.hitFlash > 0) boss.hitFlash = Math.max(0, boss.hitFlash - dt);

        if (boss.phase === 1 && boss.hp <= boss.maxHp * 0.5) {
          boss.phase = 2;
          eng.screenShake = 14;
          spawnShockwave(boss.x, boss.y, COLORS.yellow, 420);
          spawnParticleBurst(boss.x, boss.y, COLORS.yellow, 45, 80, 320);
          spawnFloatingText(boss.x, boss.y, 'OVERDRIVE PHASE 2!', COLORS.yellow, 1.35);
          audio.playExplosion('large');
        }

        if (boss.entering) {
          boss.y += 140 * dt;
          if (boss.y >= boss.targetY) {
            boss.y = boss.targetY;
            boss.entering = false;
          }
        } else {
          const phaseSpeedMult = boss.phase === 2 ? 1.45 : 1.0;
          boss.x += boss.vx * phaseSpeedMult * dt;
          const margin = 80;
          if (boss.x < margin) {
            boss.x = margin;
            boss.vx = Math.abs(boss.vx);
          } else if (boss.x > width - margin) {
            boss.x = width - margin;
            boss.vx = -Math.abs(boss.vx);
          }

          boss.patternTimer += dt;
          if (boss.patternTimer >= 5.5) {
            boss.patternTimer = 0;
            const patterns: BossAttackPattern[] = ['SPREAD', 'AIMED', 'SPIRAL'];
            const nextIdx = (patterns.indexOf(boss.pattern) + 1) % patterns.length;
            boss.pattern = patterns[nextIdx];
          }

          boss.shootTimer -= dt;
          if (boss.shootTimer <= 0) {
            if (boss.pattern === 'SPREAD') {
              boss.shootTimer = boss.phase === 2 ? 0.65 : 0.95;
              const count = boss.phase === 2 ? 9 : 7;
              const spreadArc = Math.PI * 0.65;
              for (let k = 0; k < count; k++) {
                const a = Math.PI / 2 - spreadArc / 2 + (spreadArc * k) / (count - 1);
                const spd = boss.phase === 2 ? 310 : 260;
                spawnBullet(
                  boss.x,
                  boss.y + 36,
                  Math.cos(a) * spd,
                  Math.sin(a) * spd,
                  false,
                  COLORS.magenta,
                  5.5
                );
              }
            } else if (boss.pattern === 'AIMED') {
              boss.shootTimer = boss.phase === 2 ? 0.34 : 0.52;
              const baseAngle = Math.atan2(p.y - boss.y, p.x - boss.x);
              const offsets = boss.phase === 2 ? [-0.14, 0, 0.14] : [-0.08, 0.08];
              offsets.forEach((off) => {
                const a = baseAngle + off;
                const spd = boss.phase === 2 ? 390 : 330;
                spawnBullet(
                  boss.x,
                  boss.y + 38,
                  Math.cos(a) * spd,
                  Math.sin(a) * spd,
                  false,
                  COLORS.yellow,
                  5.5
                );
              });
            } else if (boss.pattern === 'SPIRAL') {
              boss.shootTimer = boss.phase === 2 ? 0.11 : 0.15;
              boss.spiralAngle += 0.42;
              const arms = boss.phase === 2 ? 4 : 3;
              const spd = 250;
              for (let arm = 0; arm < arms; arm++) {
                const a = boss.spiralAngle + (arm * Math.PI * 2) / arms;
                spawnBullet(
                  boss.x,
                  boss.y + 18,
                  Math.cos(a) * spd,
                  Math.sin(a) * spd,
                  false,
                  COLORS.purple,
                  5
                );
              }
            }
          }
        }

        const distSq = (boss.x - p.x) ** 2 + (boss.y - p.y) ** 2;
        if (distSq < (boss.radius + p.hitboxRadius) ** 2) {
          damagePlayer();
        }
      }

      // 10. Update Bullets & Check Bullet Collisions
      for (let i = 0; i < eng.bullets.length; i++) {
        const b = eng.bullets[i];
        if (!b.active) continue;

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.x < -30 || b.x > width + 30 || b.y < -40 || b.y > height + 40) {
          b.active = false;
          continue;
        }

        if (b.isPlayer) {
          let hit = false;
          for (let j = eng.enemies.length - 1; j >= 0; j--) {
            const e = eng.enemies[j];
            if (!e.active) continue;
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            const r = b.radius + e.radius;
            if (dx * dx + dy * dy <= r * r) {
              b.active = false;
              hit = true;
              e.hp -= b.damage;
              e.hitFlash = 0.12;
              addUltimateCharge(2.8); // Landing hits builds Ultimate energy
              spawnParticleBurst(b.x, b.y, b.color, 5, 30, 130, 1.5, 3);

              if (e.hp <= 0) {
                e.active = false;
                eng.kills++;
                addUltimateCharge(8.5); // Kills grant substantial Ultimate energy
                const isTank = e.type === 'TANK';
                audio.playExplosion(isTank ? 'large' : 'small');
                spawnParticleBurst(e.x, e.y, e.color, isTank ? 36 : 20, 50, isTank ? 290 : 220);
                if (isTank) {
                  spawnShockwave(e.x, e.y, COLORS.orange, 170);
                }
                addScore(e.scoreValue, e.x, e.y, true);
                maybeSpawnPowerUp(e.x, e.y, isTank);
                eng.enemies.splice(j, 1);
              } else {
                audio.playHit();
              }
              break;
            }
          }

          if (!hit && boss.active && !boss.entering) {
            const dx = b.x - boss.x;
            const dy = b.y - boss.y;
            const r = b.radius + boss.radius;
            if (dx * dx + dy * dy <= r * r) {
              b.active = false;
              boss.hp -= b.damage;
              boss.hitFlash = 0.08;
              addUltimateCharge(2.0);
              spawnParticleBurst(b.x, b.y, COLORS.cyan, 4, 40, 140, 1.5, 3);

              if (boss.hp <= 0) {
                boss.active = false;
                eng.kills++;
                addUltimateCharge(45);
                eng.screenShake = 24;
                audio.playExplosion('boss');
                spawnShockwave(boss.x, boss.y, COLORS.magenta, 550);
                spawnShockwave(boss.x, boss.y, COLORS.yellow, 380);
                spawnParticleBurst(boss.x, boss.y, COLORS.magenta, 80, 60, 380, 2.5, 6.5);
                addScore(2500 + eng.wave * 200, boss.x, boss.y, true);
                maybeSpawnPowerUp(boss.x - 32, boss.y, true);
                maybeSpawnPowerUp(boss.x + 32, boss.y, true);
              } else {
                audio.playHit();
              }
            }
          }
        } else {
          // Enemy bullet vs Player hitbox
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const r = b.radius + p.hitboxRadius;
          if (dx * dx + dy * dy <= r * r) {
            b.active = false;
            damagePlayer();
          }
        }
      }

      // 11. Update Power-Ups & Check Collection
      for (let i = eng.powerUps.length - 1; i >= 0; i--) {
        const pu = eng.powerUps[i];
        pu.y += pu.vy * dt;
        pu.angle += dt * 2.5;
        pu.pulse += dt * 6;

        if (pu.y > height + 40) {
          eng.powerUps.splice(i, 1);
          continue;
        }

        const dx = pu.x - p.x;
        const dy = pu.y - p.y;
        const r = pu.radius + p.radius + 4;
        if (dx * dx + dy * dy <= r * r) {
          audio.playPowerUp(pu.type);
          spawnParticleBurst(pu.x, pu.y, COLORS.yellow, 18, 40, 190);
          addUltimateCharge(12);

          if (pu.type === 'WEAPON') {
            if (p.weaponLevel < 3) {
              p.weaponLevel += 1;
              spawnFloatingText(pu.x, pu.y, `WEAPON LV.${p.weaponLevel}!`, COLORS.cyan, 1.2);
            } else {
              addScore(500, pu.x, pu.y, false);
              spawnFloatingText(pu.x, pu.y - 18, 'MAX WEAPON +500', COLORS.cyan, 1.1);
            }
          } else if (pu.type === 'SHIELD') {
            p.shieldActive = true;
            spawnFloatingText(pu.x, pu.y, 'SHIELD ONLINE!', COLORS.purple, 1.2);
          } else if (pu.type === 'HEALTH') {
            if (p.hp < p.maxHp) {
              p.hp += 1;
              spawnFloatingText(pu.x, pu.y, '+1 HULL HP!', COLORS.green, 1.2);
            } else {
              addScore(350, pu.x, pu.y, false);
              spawnFloatingText(pu.x, pu.y - 18, 'MAX HP +350', COLORS.green, 1.1);
            }
          } else if (pu.type === 'BOMB') {
            spawnFloatingText(pu.x, pu.y, 'NOVA BOMB!', COLORS.yellow, 1.35);
            triggerBombDetonation();
          }

          eng.powerUps.splice(i, 1);
        }
      }

      hudSyncAccumulator += dt;
      if (hudSyncAccumulator >= 0.065) {
        hudSyncAccumulator = 0;
        syncHud();
      }
    };

    // ========================================================================
    // RENDER STEP (Neon Synthwave Canvas Graphics)
    // ========================================================================
    const render = () => {
      const eng = engineRef.current;
      const { width, height } = eng;

      ctx.save();

      if (eng.screenShake > 0.2) {
        const shakeX = (Math.random() - 0.5) * eng.screenShake * 1.4;
        const shakeY = (Math.random() - 0.5) * eng.screenShake * 1.4;
        ctx.translate(shakeX, shakeY);
      }

      // 1. Deep Synthwave Background Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#05020d');
      bgGrad.addColorStop(0.6, '#0d0421');
      bgGrad.addColorStop(1, '#1a0636');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle Synthwave Perspective Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.11)';
      ctx.lineWidth = 1;
      const spacing = 48;
      for (let y = eng.gridOffset % spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      for (let x = 0; x < width; x += spacing * 1.5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Parallax Starfield
      for (let i = 0; i < eng.stars.length; i++) {
        const s = eng.stars[i];
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha;
        if (s.layer === 2) {
          ctx.fillRect(s.x, s.y - s.size * 2.2, s.size * 0.9, s.size * 3.2);
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 3. Shockwaves
      for (let i = 0; i < eng.shockwaves.length; i++) {
        const sw = eng.shockwaves[i];
        if (!sw.active) continue;
        ctx.save();
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.lineWidth = 3.5;
        ctx.shadowColor = sw.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Power-Ups
      for (let i = 0; i < eng.powerUps.length; i++) {
        const pu = eng.powerUps[i];
        const color =
          pu.type === 'WEAPON'
            ? COLORS.cyan
            : pu.type === 'SHIELD'
            ? COLORS.purple
            : pu.type === 'HEALTH'
            ? COLORS.green
            : COLORS.yellow;
        const label =
          pu.type === 'WEAPON' ? 'W' : pu.type === 'SHIELD' ? 'S' : pu.type === 'HEALTH' ? '+' : 'B';

        ctx.save();
        ctx.translate(pu.x, pu.y);

        ctx.save();
        ctx.rotate(pu.angle);
        ctx.strokeStyle = color;
        ctx.fillStyle = 'rgba(7, 3, 18, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        const r = pu.radius + Math.sin(pu.pulse) * 2;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = COLORS.white;
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 1);
        ctx.restore();
      }

      // 5. Bullets
      for (let i = 0; i < eng.bullets.length; i++) {
        const b = eng.bullets[i];
        if (!b.active) continue;
        ctx.save();
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 12;

        if (b.isPlayer) {
          ctx.beginPath();
          ctx.roundRect(b.x - b.radius * 0.65, b.y - b.radius * 2.4, b.radius * 1.3, b.radius * 4.4, 3);
          ctx.fill();
          ctx.fillStyle = COLORS.white;
          ctx.fillRect(b.x - b.radius * 0.3, b.y - b.radius * 1.6, b.radius * 0.6, b.radius * 2.8);
        } else {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS.white;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 6. Enemies (All 7 Types + Telegraph Sight Lines & Tachyon Beams)
      for (let i = 0; i < eng.enemies.length; i++) {
        const e = eng.enemies[i];
        if (!e.active) continue;

        // Draw Stalker Lock-On Telegraph Sight Line
        if (e.type === 'STALKER' && e.aiPhase === 'LOCK') {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 23, 68, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(e.aimAngle) * 900, e.y + Math.sin(e.aimAngle) * 900);
          ctx.stroke();
          ctx.restore();
        }

        // Draw Prism Telegraph & Active Vertical Tachyon Laser Beam
        if (e.type === 'PRISM') {
          if (e.aiPhase === 'CHARGE_LASER') {
            ctx.save();
            ctx.strokeStyle = 'rgba(181, 55, 242, 0.65)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y + e.radius);
            ctx.lineTo(e.x, height);
            ctx.stroke();
            ctx.restore();
          } else if (e.aiPhase === 'FIRE_LASER') {
            ctx.save();
            ctx.globalAlpha = Math.max(0.2, e.laserAlpha);
            ctx.fillStyle = COLORS.purple;
            ctx.shadowColor = COLORS.purple;
            ctx.shadowBlur = 20;
            ctx.fillRect(e.x - 11, e.y + e.radius, 22, height - e.y);
            ctx.fillStyle = COLORS.white;
            ctx.fillRect(e.x - 4, e.y + e.radius, 8, height - e.y);
            ctx.restore();
          }
        }

        ctx.save();
        ctx.translate(e.x, e.y);
        const strokeCol = e.hitFlash > 0 ? COLORS.white : e.color;
        ctx.strokeStyle = strokeCol;
        ctx.fillStyle = e.hitFlash > 0 ? 'rgba(255,255,255,0.65)' : 'rgba(15, 6, 34, 0.9)';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = strokeCol;
        ctx.shadowBlur = 15;

        if (e.type === 'DRONE') {
          ctx.beginPath();
          ctx.moveTo(0, e.radius);
          ctx.lineTo(e.radius * 0.85, -e.radius * 0.4);
          ctx.lineTo(0, -e.radius);
          ctx.lineTo(-e.radius * 0.85, -e.radius * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = strokeCol;
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.type === 'ZIGZAGGER') {
          ctx.beginPath();
          ctx.moveTo(0, e.radius);
          ctx.lineTo(e.radius, -e.radius * 0.7);
          ctx.lineTo(e.radius * 0.35, -e.radius * 0.3);
          ctx.lineTo(0, -e.radius);
          ctx.lineTo(-e.radius * 0.35, -e.radius * 0.3);
          ctx.lineTo(-e.radius, -e.radius * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (e.type === 'SHOOTER') {
          ctx.beginPath();
          ctx.moveTo(0, e.radius * 0.9);
          ctx.lineTo(e.radius, -e.radius * 0.2);
          ctx.lineTo(e.radius * 0.7, -e.radius);
          ctx.lineTo(-e.radius * 0.7, -e.radius);
          ctx.lineTo(-e.radius, -e.radius * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = COLORS.yellow;
          ctx.beginPath();
          ctx.arc(0, 2, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.type === 'TANK') {
          ctx.beginPath();
          for (let side = 0; side < 6; side++) {
            const a = (side * Math.PI) / 3 + Math.PI / 6;
            const px = Math.cos(a) * e.radius;
            const py = Math.sin(a) * e.radius;
            if (side === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, e.radius * 0.5, 0, Math.PI * 2);
          ctx.stroke();

          const barW = 36;
          const barH = 4;
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(-barW / 2, -e.radius - 12, barW, barH);
          ctx.fillStyle = COLORS.orange;
          ctx.fillRect(-barW / 2, -e.radius - 12, barW * Math.max(0, e.hp / e.maxHp), barH);
        } else if (e.type === 'STALKER') {
          // Rotate arrowhead toward aimAngle
          ctx.rotate(e.aimAngle - Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, e.radius * 1.15);
          ctx.lineTo(e.radius * 0.85, -e.radius * 0.85);
          ctx.lineTo(0, -e.radius * 0.35);
          ctx.lineTo(-e.radius * 0.85, -e.radius * 0.85);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Targeting core
          ctx.fillStyle = COLORS.yellow;
          ctx.beginPath();
          ctx.arc(0, 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.type === 'SWARMER') {
          // Agile emerald winged micro-fighter
          ctx.beginPath();
          ctx.moveTo(0, e.radius);
          ctx.lineTo(e.radius * 1.1, -e.radius * 0.3);
          ctx.lineTo(e.radius * 0.4, -e.radius);
          ctx.lineTo(-e.radius * 0.4, -e.radius);
          ctx.lineTo(-e.radius * 1.1, -e.radius * 0.3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = COLORS.white;
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.type === 'PRISM') {
          // Rotating crystalline octahedron + energy ring
          ctx.save();
          ctx.rotate(e.sineOffset * 0.6);
          ctx.beginPath();
          ctx.moveTo(0, -e.radius);
          ctx.lineTo(e.radius, 0);
          ctx.lineTo(0, e.radius);
          ctx.lineTo(-e.radius, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          ctx.strokeStyle = COLORS.cyan;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, e.radius * 0.52, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // 7. Boss Rendering
      const boss = eng.boss;
      if (boss.active) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        const trimColor =
          boss.hitFlash > 0 ? COLORS.white : boss.phase === 2 ? COLORS.yellow : COLORS.magenta;
        ctx.strokeStyle = trimColor;
        ctx.fillStyle = boss.hitFlash > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(20, 5, 42, 0.94)';
        ctx.lineWidth = 3.2;
        ctx.shadowColor = trimColor;
        ctx.shadowBlur = 22;

        const r = boss.radius;
        ctx.beginPath();
        ctx.moveTo(0, r * 0.95);
        ctx.lineTo(r * 0.55, r * 0.35);
        ctx.lineTo(r * 1.15, r * 0.6);
        ctx.lineTo(r * 0.95, -r * 0.65);
        ctx.lineTo(r * 0.4, -r * 0.95);
        ctx.lineTo(-r * 0.4, -r * 0.95);
        ctx.lineTo(-r * 0.95, -r * 0.65);
        ctx.lineTo(-r * 1.15, r * 0.6);
        ctx.lineTo(-r * 0.55, r * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = boss.phase === 2 ? COLORS.yellow : COLORS.cyan;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // 8. Player Ultimate Hyperion Laser Beam & Ship Rendering
      if (eng.screen !== 'GAME_OVER') {
        const p = eng.player;

        // Render Massive Hyperion Beam when Ultimate is active
        if (p.ultActiveTimer > 0) {
          ctx.save();
          const pulseW = Math.sin(p.thrusterPhase * 1.8) * 8;
          const outerW = 68 + pulseW;
          const midW = 38 + pulseW * 0.5;
          const coreW = 16;

          // Outer magenta/cyan plasma sheath
          const beamGrad = ctx.createLinearGradient(p.x - outerW / 2, 0, p.x + outerW / 2, 0);
          beamGrad.addColorStop(0, 'rgba(255, 0, 127, 0)');
          beamGrad.addColorStop(0.25, 'rgba(0, 243, 255, 0.55)');
          beamGrad.addColorStop(0.5, 'rgba(255, 230, 0, 0.95)');
          beamGrad.addColorStop(0.75, 'rgba(0, 243, 255, 0.55)');
          beamGrad.addColorStop(1, 'rgba(255, 0, 127, 0)');

          ctx.fillStyle = beamGrad;
          ctx.shadowColor = COLORS.cyan;
          ctx.shadowBlur = 30;
          ctx.fillRect(p.x - outerW / 2, 0, outerW, p.y - 14);

          // Mid high-intensity cyan core
          ctx.fillStyle = 'rgba(0, 243, 255, 0.85)';
          ctx.fillRect(p.x - midW / 2, 0, midW, p.y - 14);

          // White-hot center spine
          ctx.fillStyle = COLORS.white;
          ctx.fillRect(p.x - coreW / 2, 0, coreW, p.y - 14);

          // Harmonic energy rings ascending the beam
          ctx.strokeStyle = COLORS.yellow;
          ctx.lineWidth = 2.5;
          const ringStep = 95;
          const ringOffset = (p.thrusterPhase * 32) % ringStep;
          for (let ry = p.y - 30 - ringOffset; ry > 0; ry -= ringStep) {
            ctx.beginPath();
            ctx.ellipse(p.x, ry, outerW * 0.52, 8, 0, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        }

        const flashSkip =
          p.ultActiveTimer <= 0 &&
          p.invincibleTimer > 0 &&
          Math.floor(p.invincibleTimer * 16) % 2 === 0;

        if (!flashSkip) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.bankAngle);

          // Thruster Flame
          const flameLen = (p.ultActiveTimer > 0 ? 24 : 14) + Math.sin(p.thrusterPhase) * 6;
          ctx.fillStyle = p.ultActiveTimer > 0 ? COLORS.yellow : COLORS.magenta;
          ctx.shadowColor = p.ultActiveTimer > 0 ? COLORS.yellow : COLORS.magenta;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(-7, 15);
          ctx.lineTo(0, 15 + flameLen);
          ctx.lineTo(7, 15);
          ctx.closePath();
          ctx.fill();

          // Main Starfighter Hull
          const hullColor = p.ultActiveTimer > 0 ? COLORS.yellow : COLORS.cyan;
          ctx.strokeStyle = hullColor;
          ctx.fillStyle = '#0b041d';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = hullColor;
          ctx.shadowBlur = 16;

          ctx.beginPath();
          ctx.moveTo(0, -22);
          ctx.lineTo(19, 14);
          ctx.lineTo(8, 10);
          ctx.lineTo(0, 16);
          ctx.lineTo(-8, 10);
          ctx.lineTo(-19, 14);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Cockpit Canopy
          ctx.fillStyle = COLORS.yellow;
          ctx.shadowColor = COLORS.yellow;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(0, -10);
          ctx.lineTo(4.5, 4);
          ctx.lineTo(0, 8);
          ctx.lineTo(-4.5, 4);
          ctx.closePath();
          ctx.fill();

          if (p.weaponLevel >= 2) {
            ctx.strokeStyle = COLORS.magenta;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-13, 2);
            ctx.lineTo(-13, -10);
            ctx.moveTo(13, 2);
            ctx.lineTo(13, -10);
            ctx.stroke();
          }

          // Active Shield Forcefield
          if (p.shieldActive) {
            ctx.strokeStyle = COLORS.cyan;
            ctx.lineWidth = 2;
            ctx.shadowColor = COLORS.cyan;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 243, 255, 0.11)';
            ctx.fill();
          }

          // Offensive Aegis Overdrive Field during Ultimate
          if (p.ultActiveTimer > 0) {
            ctx.strokeStyle = COLORS.yellow;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = COLORS.yellow;
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 230, 0, 0.14)';
            ctx.fill();
          }

          ctx.restore();
        }
      }

      // 9. Particles
      for (let i = 0; i < eng.particles.length; i++) {
        const pt = eng.particles[i];
        if (!pt.active) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 10. Floating Score & Status Popups
      for (let i = 0; i < eng.floatingTexts.length; i++) {
        const ft = eng.floatingTexts[i];
        if (!ft.active) continue;
        const alpha = 1 - ft.life / ft.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = `bold ${Math.round(13 * ft.scale)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      ctx.restore();
    };

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      update(dt);
      render();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [initStars, prepareWave, syncHud]);

  // ==========================================================================
  // 9. MOBILE & POINTER TOUCH HANDLERS
  // ==========================================================================

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    if (eng.screen !== 'PLAYING') return;

    eng.touchActive = true;
    const yOffset = e.pointerType === 'touch' ? -48 : 0;
    eng.touchTargetX = e.clientX;
    eng.touchTargetY = e.clientY + yOffset;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    if (!eng.touchActive || eng.screen !== 'PLAYING') return;

    const yOffset = e.pointerType === 'touch' ? -48 : 0;
    eng.touchTargetX = e.clientX;
    eng.touchTargetY = e.clientY + yOffset;
  };

  const handlePointerUp = () => {
    engineRef.current.touchActive = false;
  };

  // ==========================================================================
  // 10. UI & HUD OVERLAYS
  // ==========================================================================

  const weaponLabel =
    hud.weaponLevel === 1 ? 'LV.1 PULSE' : hud.weaponLevel === 2 ? 'LV.2 TWIN' : 'LV.3 SPREAD';
  const isUltReady = hud.ultCharge >= 100 && !hud.ultActive;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070312] select-none">
      {/* Interactive Full-Viewport Game Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="block w-full h-full cursor-crosshair"
      />

      {/* TOP HUD BAR (Always visible during Playing & Paused) */}
      {screen !== 'START' && (
        <header className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex flex-col gap-2 px-3 sm:px-6 pt-3">
          <div className="flex items-center justify-between gap-2 bg-[#0b041d]/85 backdrop-blur-md border border-cyan-500/25 rounded-xl px-3 sm:px-5 py-2.5 shadow-[0_0_25px_rgba(0,243,255,0.12)]">
            {/* Left: Score, High Score, Wave, Enhanced Combo Multiplier */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div>
                <div className="text-[10px] sm:text-xs font-semibold tracking-wider text-cyan-300/70">
                  SCORE
                </div>
                <div className="font-mono text-base sm:text-xl font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(0,243,255,0.6)]">
                  {hud.score.toLocaleString()}
                </div>
              </div>

              <div className="hidden lg:block">
                <div className="text-[10px] sm:text-xs font-semibold tracking-wider text-fuchsia-300/70">
                  HIGH SCORE
                </div>
                <div className="font-mono text-base sm:text-xl font-bold text-fuchsia-400">
                  {hud.highScore.toLocaleString()}
                </div>
              </div>

              <div>
                <div className="text-[10px] sm:text-xs font-semibold tracking-wider text-yellow-300/70">
                  WAVE
                </div>
                <div className="font-mono text-base sm:text-xl font-bold text-yellow-300">
                  {hud.wave}
                </div>
              </div>

              {/* Combo Multiplier Indicator with Tier & Decay Bar */}
              <div className="min-w-[88px] sm:min-w-[112px]">
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold tracking-wider">
                  <span
                    className={
                      hud.combo >= 10
                        ? 'text-fuchsia-400 font-bold'
                        : hud.combo >= 5
                        ? 'text-yellow-300 font-bold'
                        : 'text-cyan-200/80'
                    }
                  >
                    {hud.combo > 1 ? hud.comboTierLabel : 'COMBO'}
                  </span>
                  <span className="font-mono text-yellow-300 font-bold">{hud.combo}x</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-yellow-400 transition-all duration-75"
                    style={{ width: `${Math.round(hud.comboProgress * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Center/Right: Ultimate Gauge, Hull Bar, Weapon Level, Controls */}
            <div className="flex items-center gap-3 sm:gap-5">
              {/* Ultimate Ability Gauge & Trigger Button */}
              <div className="pointer-events-auto hidden sm:flex flex-col min-w-[138px]">
                <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider">
                  <span className="flex items-center gap-1 text-yellow-300">
                    <Flame className="w-3.5 h-3.5 text-yellow-400" />
                    {hud.ultActive ? 'OVERDRIVE' : 'ULTIMATE'}
                  </span>
                  <span className="font-mono text-cyan-300">
                    {hud.ultActive ? 'ACTIVE' : `${hud.ultCharge}%`}
                  </span>
                </div>
                {isUltReady ? (
                  <button
                    type="button"
                    onClick={activateUltimate}
                    className="mt-0.5 py-0.5 px-2 rounded bg-gradient-to-r from-yellow-400 via-fuchsia-500 to-cyan-400 text-[10px] font-mono font-bold text-slate-950 animate-pulse cursor-pointer shadow-[0_0_12px_rgba(255,230,0,0.8)]"
                  >
                    FIRE [E / SHIFT]
                  </button>
                ) : (
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full transition-all duration-100 ${
                        hud.ultActive
                          ? 'bg-gradient-to-r from-yellow-300 via-orange-400 to-fuchsia-500'
                          : 'bg-gradient-to-r from-cyan-400 to-yellow-300'
                      }`}
                      style={{
                        width: `${
                          hud.ultActive
                            ? Math.round(hud.ultRemainingProgress * 100)
                            : hud.ultCharge
                        }%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Hull Health Bar */}
              <div className="flex flex-col items-end sm:items-start">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold tracking-wider text-rose-300/90">
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                  <span>
                    HULL {hud.hp}/{hud.maxHp}
                  </span>
                  {hud.shield && (
                    <span className="ml-1 inline-flex items-center gap-1 text-cyan-300 font-mono">
                      · <Shield className="w-3.5 h-3.5 text-cyan-300" /> SHIELD
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {Array.from({ length: hud.maxHp }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-2.5 w-4 sm:w-5 rounded-xs transition-all ${
                        idx < hud.hp
                          ? 'bg-gradient-to-r from-rose-500 to-fuchsia-500 shadow-[0_0_8px_rgba(255,0,127,0.75)]'
                          : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Weapon Level Status */}
              <div className="hidden md:flex flex-col">
                <div className="text-[10px] font-semibold tracking-wider text-cyan-300/70">
                  WEAPON
                </div>
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-300">
                  <Zap className="w-3.5 h-3.5 text-yellow-300" />
                  <span>{weaponLabel}</span>
                </div>
              </div>

              {/* Interactive Utility Buttons (Mute & Pause) */}
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-cyan-300 transition-colors cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={togglePause}
                  aria-label={screen === 'PAUSED' ? 'Resume Game' : 'Pause Game'}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-cyan-300 transition-colors cursor-pointer"
                >
                  {screen === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Compact Sub-strip */}
          <div className="flex md:hidden items-center justify-between px-2 text-xs font-mono text-cyan-200/80">
            <span>{weaponLabel}</span>
            <span>ULT: {hud.ultActive ? 'OVERDRIVE' : `${hud.ultCharge}%`}</span>
            <span>BEST {hud.highScore.toLocaleString()}</span>
          </div>

          {/* BOSS HEALTH BAR */}
          {hud.bossActive && (
            <div className="mx-auto w-full max-w-xl bg-[#120529]/90 border border-fuchsia-500/40 rounded-lg px-4 py-2 shadow-[0_0_20px_rgba(255,0,127,0.3)]">
              <div className="flex items-center justify-between text-xs font-mono font-bold mb-1">
                <span className="text-fuchsia-400 tracking-wider">
                  {hud.bossName} {hud.bossPhase === 2 ? '· OVERDRIVE PHASE 2' : ''}
                </span>
                <span className="text-yellow-300">
                  {Math.ceil(hud.bossHp)} / {hud.bossMaxHp} HP
                </span>
              </div>
              <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                <div
                  className={`h-full transition-all duration-100 ${
                    hud.bossPhase === 2
                      ? 'bg-gradient-to-r from-yellow-400 via-orange-500 to-rose-600'
                      : 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </header>
      )}

      {/* FLOATING ULTIMATE ACTIVATION BUTTON (Accessible on Mobile & Desktop during Play) */}
      {screen === 'PLAYING' && (
        <div className="fixed bottom-5 right-5 z-20">
          <button
            type="button"
            onClick={activateUltimate}
            disabled={!isUltReady}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl font-mono text-xs sm:text-sm font-bold border transition-all ${
              isUltReady
                ? 'bg-gradient-to-r from-yellow-400 via-fuchsia-500 to-cyan-400 text-slate-950 border-yellow-200 shadow-[0_0_28px_rgba(255,230,0,0.75)] animate-pulse cursor-pointer active:scale-95'
                : hud.ultActive
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50 shadow-[0_0_18px_rgba(255,230,0,0.35)]'
                : 'bg-[#0b041d]/80 text-slate-400 border-white/15 cursor-not-allowed'
            }`}
          >
            <Flame className={`w-4 h-4 ${isUltReady ? 'text-slate-950 fill-slate-950' : 'text-yellow-400'}`} />
            <span>
              {hud.ultActive
                ? 'HYPERION BEAM ACTIVE'
                : isUltReady
                ? 'UNLEASH ULTIMATE [E]'
                : `ULTIMATE ${hud.ultCharge}%`}
            </span>
          </button>
        </div>
      )}

      {/* WAVE / BOSS INCOMING BANNER ANIMATION */}
      {screen === 'PLAYING' && bannerText && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-4">
          <div
            className={`text-center px-8 py-5 rounded-2xl border backdrop-blur-md transition-transform ${
              bannerText.isBoss
                ? 'bg-rose-950/60 border-rose-500/60 shadow-[0_0_40px_rgba(255,23,68,0.45)] animate-pulse'
                : 'bg-[#0d0424]/75 border-cyan-400/40 shadow-[0_0_35px_rgba(0,243,255,0.25)]'
            }`}
          >
            <div
              className={`text-3xl sm:text-5xl font-extrabold tracking-tight ${
                bannerText.isBoss ? 'text-rose-400' : 'text-cyan-300'
              }`}
            >
              {bannerText.title}
            </div>
            <div className="mt-1.5 font-mono text-xs sm:text-sm tracking-widest text-fuchsia-300">
              {bannerText.subtitle}
            </div>
          </div>
        </div>
      )}

      {/* START SCREEN */}
      {screen === 'START' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0d0422]/92 border border-cyan-500/35 rounded-2xl p-5 sm:p-7 shadow-[0_0_50px_rgba(0,243,255,0.18)] text-center my-auto">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 text-xs font-mono text-fuchsia-300">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span>HIGH SCORE: {hud.highScore.toLocaleString()}</span>
              </div>
              <button
                type="button"
                onClick={toggleMute}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-cyan-300 transition-colors cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'Sound Off' : 'Sound On'}</span>
              </button>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-yellow-300 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(0,243,255,0.35)]">
              NEON VANGUARD
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
              Chain rapid kills up to a 15x Combo Multiplier, charge your Hyperion Ultimate Beam, and survive 7 distinct synthwave alien archetypes.
            </p>

            {/* Primary Start Button */}
            <button
              type="button"
              onClick={startNewGame}
              className="mt-5 w-full sm:w-auto min-w-[260px] px-8 py-3.5 rounded-xl font-bold text-base sm:text-lg tracking-wide text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-300 to-yellow-300 hover:brightness-110 active:scale-[0.99] shadow-[0_0_28px_rgba(0,243,255,0.5)] transition-all cursor-pointer"
            >
              Press Space / Tap to Start
            </button>

            {/* Controls, Ultimate & New Enemies Briefing Grid */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 mb-1.5">
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span>CONTROLS</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
                  <li>WASD / Drag · Move Ship</li>
                  <li>Space / Touch · Auto-Fire</li>
                  <li>E / Shift · Ultimate Beam</li>
                  <li>P / Esc · Pause Mission</li>
                </ul>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-300 mb-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  <span>ULTIMATE & COMBOS</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
                  <li>3.8s Kill Window (Max 15x)</li>
                  <li>5x / 10x / 15x Bonus Pts</li>
                  <li>100% Charge: 4s Laser + Aegis</li>
                  <li>[W] Weap [S] Shield [+] HP [B] Bomb</li>
                </ul>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-300 mb-1.5">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>NEW HOSTILE UNITS</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-300 font-mono">
                  <li className="text-rose-300">Stalker · Lock-On Dive</li>
                  <li className="text-emerald-300">Swarmer · 3-Pack Dart Cluster</li>
                  <li className="text-purple-300">Prism · Evasive Laser Caster</li>
                  <li className="text-amber-300">Boss · Every 5 Waves</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {screen === 'PAUSED' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d0422]/95 border border-cyan-500/40 rounded-2xl p-6 text-center shadow-[0_0_40px_rgba(0,243,255,0.2)]">
            <h2 className="text-2xl font-extrabold tracking-tight text-cyan-300">
              GAME PAUSED
            </h2>
            <p className="mt-1 text-xs font-mono text-slate-400">
              WAVE {hud.wave} · SCORE {hud.score.toLocaleString()}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={togglePause}
                className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Game</span>
              </button>

              <button
                type="button"
                onClick={toggleMute}
                className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
                <span>{isMuted ? 'Unmute Audio' : 'Mute Audio'}</span>
              </button>

              <button
                type="button"
                onClick={startNewGame}
                className="w-full py-3 px-4 rounded-xl font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Mission</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN */}
      {screen === 'GAME_OVER' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0d0422]/95 border border-fuchsia-500/45 rounded-2xl p-6 sm:p-8 text-center shadow-[0_0_50px_rgba(255,0,127,0.28)]">
            {hud.isNewHighScore && (
              <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-yellow-300 mb-2">
                <Sparkles className="w-4 h-4" />
                <span>NEW HIGH SCORE RECORD!</span>
              </div>
            )}

            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-rose-400">
              MISSION TERMINATED
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Your interceptor was overwhelmed in Sector Wave {hud.wave}.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 text-left bg-white/[0.03] border border-white/10 rounded-xl p-4 font-mono">
              <div>
                <div className="text-[11px] text-slate-400">FINAL SCORE</div>
                <div className="text-xl font-bold text-cyan-300">{hud.score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">HIGH SCORE</div>
                <div className="text-xl font-bold text-fuchsia-400">{hud.highScore.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">WAVE REACHED</div>
                <div className="text-lg font-bold text-yellow-300">Wave {hud.wave}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">MAX COMBO / KILLS</div>
                <div className="text-lg font-bold text-emerald-300">
                  {hud.maxCombo}x · {hud.kills}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={startNewGame}
              className="mt-6 w-full py-3.5 px-6 rounded-xl font-bold text-base text-slate-950 bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-yellow-300 hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,243,255,0.4)] cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
