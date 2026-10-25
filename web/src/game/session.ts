// Sessions feed the match view. LocalSession runs the shared simulation in the browser.
import { Sim, type Snapshot, type SimEvent, type Mode, type FighterInit } from '../../../shared/sim';
import { Bot } from '../../../shared/bot';
import { packJoints } from '../../../shared/joints';
import type { GestureOutput } from '../../../shared/gestures';

export interface TickResult {
  snap: Snapshot;
  events: SimEvent[];
}

export interface Session {
  kind: 'local' | 'online';
  mode: Mode;
  /** Fighter ids controlled by this device, indexed by pose player. */
  localIds: number[];
  start(): void;
  input(player: number, g: GestureOutput, actions: GestureOutput['actions']): void;
  tick(dt: number): TickResult | null;
  rematch(): void;
  dispose(): void;
  readonly over: boolean;
}

export const FIGHTER_COLORS = ['#ff3d6e', '#33b5ff', '#ffc53d', '#3dff9a', '#b03dff', '#ff7a3d', '#3dfff0', '#f5f5f5'];
const BOT_NAMES = ['Iron Rook', 'Neon Viper', 'Captain Comet', 'Ghost Ninja', 'Lava King', 'Storm Queen', 'Volt Kid', 'Titan Mk II'];

export class LocalSession implements Session {
  kind = 'local' as const;
  sim: Sim;
  bots: Bot[] = [];
  localIds: number[] = [];
  private started = false;

  constructor(
    public mode: Mode,
    humans: Omit<FighterInit, 'id'>[],
    botCount: number,
    private botLevel = 1,
    /** Humans that are actually autopilot bots (demo mode without a camera). */
    autopilot: number[] = [],
    simOverrides: { roundSeconds?: number; meterStart?: number } = {},
  ) {
    this.sim = new Sim({ mode, ...simOverrides }, (Math.random() * 1e9) | 0);
    humans.forEach((h, i) => {
      const f = this.sim.addFighter({ ...h, id: i + 1, bot: autopilot.includes(i) });
      if (autopilot.includes(i)) this.bots.push(new Bot(f.id, { level: 1, seed: 99 + i }));
      this.localIds.push(f.id);
    });
    for (let b = 0; b < botCount; b++) {
      const id = humans.length + b + 1;
      this.sim.addFighter({ id, name: BOT_NAMES[b % BOT_NAMES.length], color: FIGHTER_COLORS[(id - 1) % FIGHTER_COLORS.length], bot: true });
      this.bots.push(new Bot(id, { level: botLevel, seed: id * 131 + 7 }));
    }
    void this.botLevel;
  }

  get over() {
    return this.sim.phase === 'match_over';
  }

  start() {
    this.sim.start();
    this.started = true;
  }

  input(player: number, g: GestureOutput, actions: GestureOutput['actions']) {
    const id = this.localIds[player];
    if (id == null || this.bots.some((b) => b.id === id)) return;
    this.sim.setInput(id, { move: g.move, blocking: g.blocking, xshield: g.xshield, turn: g.turn, present: g.present, joints: g.joints ? packJoints(g.joints) : undefined });
    for (const a of actions) this.sim.pushAction(id, { kind: a.kind, hand: a.hand, speed: a.speed });
  }

  /** Test knob (?infmeter): keep local fighters' super meter full, to probe cooldowns directly. */
  infiniteMeter = false;

  tick(dt: number): TickResult | null {
    if (!this.started) return { snap: this.sim.snapshot(true), events: [] };
    if (this.infiniteMeter) for (const id of this.localIds) { const f = this.sim.get(id); if (f) f.meter = 100; }
    for (const b of this.bots) b.tick(this.sim);
    this.sim.step(Math.min(dt, 0.1));
    const events = this.sim.drainEvents();
    for (const b of this.bots) b.observe(events, this.sim);
    return { snap: this.sim.snapshot(true), events };
  }

  rematch() {
    this.sim.start();
  }

  dispose() {}
}
