// Hit sparks, shockwaves, energy blasts, punch trails, and floating damage numbers.
import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
}

export class VFX {
  private group = new THREE.Group();
  private particles: Particle[] = [];
  private sparkGeo = new THREE.SphereGeometry(1, 6, 4);
  private ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  private projectiles = new Map<number, THREE.Group>();
  private labelLayer: HTMLElement;
  private camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera, labelLayer: HTMLElement) {
    scene.add(this.group);
    this.camera = camera;
    this.labelLayer = labelLayer;
  }

  private add(mesh: THREE.Mesh, v: THREE.Vector3, life: number, grow = 0) {
    this.group.add(mesh);
    this.particles.push({ mesh, v, life, max: life, grow });
  }

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, count = 18, speed = 4, size = 0.05) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.setScalar(size * (0.5 + Math.random()));
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.add(m, v, 0.35 + Math.random() * 0.3);
    }
  }

  shockwave(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 1, facing?: THREE.Vector3) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    if (facing) m.lookAt(pos.clone().add(facing));
    else m.lookAt(this.camera.position);
    m.scale.setScalar(0.15 * size);
    this.add(m, new THREE.Vector3(), 0.35, 5 * size);
  }

  groundRing(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 1.5) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos).setY(0.05);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.2);
    this.add(m, new THREE.Vector3(), 0.6, 4 * size);
  }

  pillar(pos: THREE.Vector3, color: THREE.ColorRepresentation) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    m.position.copy(pos).setY(3);
    this.add(m, new THREE.Vector3(0, 0, 0), 0.8, 0.6);
  }

  /** Floating text at a world position (damage numbers, "BLOCK", "KO"). */
  label(pos: THREE.Vector3, text: string, cls = '') {
    const p = pos.clone().project(this.camera);
    if (p.z > 1) return;
    const el = document.createElement('div');
    el.className = 'fx-label ' + cls;
    el.textContent = text;
    el.style.left = ((p.x + 1) / 2) * 100 + '%';
    el.style.top = ((1 - p.y) / 2) * 100 + '%';
    this.labelLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  hit(pos: THREE.Vector3, color: THREE.ColorRepresentation, damage: number, blocked: boolean, shielded: boolean, isSuper: boolean) {
    if (shielded) {
      this.burst(pos, 0x66ccff, 14, 3, 0.04);
      this.shockwave(pos, 0x66ccff, 0.8);
      this.label(pos, 'SHIELD', 'fx-block');
      return;
    }
    if (blocked) {
      this.burst(pos, 0xffffff, 10, 2.5, 0.035);
      this.shockwave(pos, 0xbbddff, 0.6);
      this.label(pos, 'BLOCK ' + damage, 'fx-block');
      return;
    }
    this.burst(pos, color, isSuper ? 50 : 22, isSuper ? 7 : 4.5, isSuper ? 0.08 : 0.05);
    this.burst(pos, 0xffffff, 8, 3, 0.03);
    this.shockwave(pos, color, isSuper ? 2.2 : 1);
    this.label(pos, String(damage), isSuper ? 'fx-super' : damage >= 12 ? 'fx-big' : '');
  }

  setProjectiles(list: { id: number; x: number; y: number; z: number }[], colorOf: (id: number) => THREE.ColorRepresentation, owners: Map<number, number>) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let g = this.projectiles.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const col = colorOf(owners.get(p.id) ?? 0);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(core, glow);
        g.userData.color = col;
        this.group.add(g);
        this.projectiles.set(p.id, g);
      }
      const prev = g.position.clone();
      g.position.set(p.x, p.y, p.z);
      g.rotation.y += 0.3;
      if (prev.lengthSq() > 0 && Math.random() < 0.7) this.burst(prev, g.userData.color, 2, 0.6, 0.06);
    }
    for (const [id, g] of this.projectiles)
      if (!seen.has(id)) {
        this.burst(g.position, g.userData.color, 25, 5, 0.06);
        this.group.remove(g);
        this.projectiles.delete(id);
      }
  }

  trail(from: THREE.Vector3, color: THREE.ColorRepresentation) {
    const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(from);
    m.scale.setScalar(0.09);
    this.add(m, new THREE.Vector3(), 0.25, -0.2);
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        continue;
      }
      p.mesh.position.addScaledVector(p.v, dt);
      p.v.y -= 6 * dt * (p.grow ? 0 : 1);
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.max;
      keep.push(p);
    }
    this.particles = keep;
  }
}
