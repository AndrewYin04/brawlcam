// UFC-style octagon (hero renderer): an eight-sided canvas mat with a center logo, a chain-link cage about 1.8 m
// high with padded corner posts, arena lighting from above, and a dark arena with crowd silhouettes and stadium
// lights beyond the cage. Fighters knocked into the cage slam into it; the struck panel shakes.
import * as THREE from 'three';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SIDES = 8;
export const CAGE_HEIGHT = 1.8;
/** Apothem (center to the middle of a wall) of an octagon with circumradius R. */
export const apothem = (R: number) => R * Math.cos(Math.PI / SIDES);

export class SkyStage {
  group = new THREE.Group();
  radius = 4.2; // circumradius (center to a corner post), meters
  private cage = new THREE.Group();
  private panels: { mesh: THREE.Mesh; angle: number; shake: number; base: THREE.Vector3 }[] = [];
  /** Every cage element that can block the camera's view of a fighter (panels, posts, pads, rails). */
  private parts: THREE.Mesh[] = [];
  private ray = new THREE.Raycaster();
  /** Last frame's share of camera-to-fighter rays that hit the cage (before fading), for the review metric. */
  occlusion = 0;
  private flashes!: THREE.Points;
  private flashMat!: THREE.PointsMaterial;
  private lightsGlow: THREE.Sprite[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    scene.background = new THREE.Color(0x06070d);
    scene.fog = new THREE.Fog(0x06070d, 14, 48);
    this.buildArena();
    this.buildLights();
    this.group.add(this.cage);
    this.buildOctagon(this.radius);
  }

  private buildArena() {
    // Arena floor around the cage.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshLambertMaterial({ color: 0x101320 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.group.add(floor);
    // Stepped seating tiers with crowd silhouettes (instanced), rising away from the cage.
    const N = 2400;
    const body = new THREE.CapsuleGeometry(0.2, 0.32, 3, 8);
    const crowd = new THREE.InstancedMesh(body, new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const pts: number[] = [];
    let i = 0;
    for (let row = 0; row < 16 && i < N; row++) {
      const r = 9 + row * 0.95;
      const y = 0.4 + row * 0.55;
      const count = Math.floor((2 * Math.PI * r) / 0.62);
      for (let k = 0; k < count && i < N; k++, i++) {
        const a = (k / count) * Math.PI * 2 + row * 0.13;
        const jitter = (Math.sin(k * 12.9898 + row * 78.233) * 43758.5453) % 1;
        m4.compose(new THREE.Vector3(Math.cos(a) * r, y + 0.45 + jitter * 0.08, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, 0.9 + Math.abs(jitter) * 0.25, 1));
        crowd.setMatrixAt(i, m4);
        col.setHSL(0.62 + jitter * 0.08, 0.3, 0.05 + Math.abs(jitter) * 0.05);
        crowd.setColorAt(i, col);
        m4.compose(new THREE.Vector3(Math.cos(a) * r, y + 0.92 + jitter * 0.1, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        heads.setMatrixAt(i, m4);
        heads.setColorAt(i, col.offsetHSL(0, 0, 0.015));
        if (Math.abs(jitter) > 0.93) pts.push(Math.cos(a) * r, y + 1.15, Math.sin(a) * r);
      }
      // Tier step
      const step = new THREE.Mesh(new THREE.RingGeometry(r - 0.5, r + 0.47, 96), new THREE.MeshLambertMaterial({ color: row % 2 ? 0x161a2b : 0x1a1f33, side: THREE.DoubleSide }));
      step.rotation.x = -Math.PI / 2;
      step.position.y = y;
      this.group.add(step);
    }
    crowd.count = i;
    heads.count = i;
    this.group.add(crowd, heads);
    // Phone flashes / camera flashes in the crowd (twinkle).
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.flashMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.8, depthWrite: false });
    this.flashes = new THREE.Points(g, this.flashMat);
    this.group.add(this.flashes);
    // Big screens / banners on the far walls for color.
    const banner = canvasTex(1024, 128, (c) => {
      const gr = c.createLinearGradient(0, 0, 1024, 0);
      gr.addColorStop(0, '#ff3d6e');
      gr.addColorStop(1, '#33b5ff');
      c.fillStyle = gr;
      c.fillRect(0, 0, 1024, 128);
      c.fillStyle = '#fff';
      c.font = 'bold 84px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('THROW HANDS  ·  THROW HANDS', 512, 68);
    });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshBasicMaterial({ map: banner, fog: true }));
      b.position.set(Math.cos(a) * 25, 10.5, Math.sin(a) * 25);
      b.lookAt(0, 10.5, 0);
      this.group.add(b);
    }
  }

  private buildLights() {
    // Overhead arena rig: bright, slightly warm key straight down on the mat; cool fill; rim from behind.
    this.group.add(new THREE.HemisphereLight(0xbfd2ff, 0x1a1420, 0.7));
    const key = new THREE.SpotLight(0xfff2e0, 40, 30, 0.62, 0.5, 1.2);
    key.position.set(0, 13, 0);
    key.target.position.set(0, 0, 0);
    this.group.add(key, key.target);
    const k2 = new THREE.DirectionalLight(0xfff1dc, 1.0);
    k2.position.set(5, 10, 6);
    const rim = new THREE.DirectionalLight(0x88b8ff, 1.3);
    rim.position.set(-6, 6, -9);
    this.group.add(k2, rim);
    // Stadium light banks beyond the cage (bloom picks them up).
    const glowTex = canvasTex(64, 64, (c) => {
      const gr = c.createRadialGradient(32, 32, 1, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,240,220,0.7)');
      gr.addColorStop(1, 'rgba(255,240,220,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, 64, 64);
    });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      for (let j = -1; j <= 1; j++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff4e6, transparent: true, depthWrite: false, fog: false }));
        const aa = a + j * 0.05;
        s.position.set(Math.cos(aa) * 22, 15, Math.sin(aa) * 22);
        s.scale.setScalar(2.6);
        this.lightsGlow.push(s);
        this.group.add(s);
      }
    }
  }

  setRadius(r: number) {
    if (Math.abs(r - this.radius) < 0.01) return;
    this.radius = r;
    this.buildOctagon(r);
  }

  private buildOctagon(R: number) {
    this.cage.clear();
    this.panels = [];
    this.parts = [];
    const corners: THREE.Vector2[] = [];
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2 + Math.PI / SIDES;
      corners.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R));
    }
    // Raised apron (dark) and the canvas mat on top.
    const shape = new THREE.Shape(corners.map((c) => c.clone().multiplyScalar(1.12)));
    const apron = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false }), new THREE.MeshLambertMaterial({ color: 0x0c0f1a }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.22;
    this.cage.add(apron);
    const S = 1024;
    const mat = canvasTex(S, S, (g) => {
      const c = S / 2;
      const px = (m: number) => (m / (R * 1.12)) * (S / 2);
      g.fillStyle = '#b9bfcc';
      g.fillRect(0, 0, S, S);
      // Canvas texture noise.
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`;
        g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
      }
      // Octagon boundary line just inside the fence.
      const ring = (scale: number, color: string, w: number) => {
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        corners.forEach((p, k) => {
          const x = c + px(p.x * scale);
          const y = c + px(p.y * scale);
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.closePath();
        g.stroke();
      };
      ring(0.92, '#1d2236', 10);
      ring(0.97, '#ff3d6e', 6);
      // Center logo.
      g.fillStyle = 'rgba(255,61,110,0.92)';
      g.beginPath();
      g.arc(c, c, px(1.0), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1d2236';
      g.beginPath();
      g.arc(c, c, px(0.86), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(px(0.42))}px sans-serif`;
      g.fillText('THROW', c, c - px(0.2));
      g.fillStyle = '#ff3d6e';
      g.fillText('HANDS', c, c + px(0.24));
      // Corner logos.
      g.font = `bold ${Math.round(px(0.28))}px sans-serif`;
      g.fillStyle = 'rgba(29,34,54,0.55)';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        g.save();
        g.translate(c + px(Math.cos(a) * R * 0.62), c + px(Math.sin(a) * R * 0.62));
        g.rotate(a + Math.PI / 2);
        g.fillText('throwhands.tech', 0, 0);
        g.restore();
      }
    });
    const matMesh = new THREE.Mesh(new THREE.CircleGeometry(R * 1.12, 8, Math.PI / SIDES), new THREE.MeshLambertMaterial({ map: mat }));
    matMesh.rotation.x = -Math.PI / 2;
    matMesh.rotation.z = 0;
    matMesh.position.y = 0.001;
    // CircleGeometry with 8 segments is an octagon; align its UVs with the canvas (centered, scale R*1.12).
    this.cage.add(matMesh);

    // Chain-link fence panels between posts.
    const link = canvasTex(
      128,
      128,
      (g) => {
        g.clearRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(30,32,40,1)';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(0, 64);
        g.lineTo(64, 0);
        g.lineTo(128, 64);
        g.lineTo(64, 128);
        g.closePath();
        g.stroke();
        g.strokeStyle = 'rgba(120,128,150,1)';
        g.lineWidth = 3;
        g.stroke();
      },
      true,
    );
    link.wrapS = link.wrapT = THREE.RepeatWrapping;
    const top = 0.0;
    for (let k = 0; k < SIDES; k++) {
      const p0 = corners[k];
      const p1 = corners[(k + 1) % SIDES];
      const len = p0.distanceTo(p1);
      const tex = link.clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 0.11, CAGE_HEIGHT / 0.11);
      const pm = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: true });
      pm.userData.baseOpacity = 1;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, CAGE_HEIGHT), pm);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      panel.position.set(mid.x, top + CAGE_HEIGHT / 2, mid.y);
      panel.lookAt(0, top + CAGE_HEIGHT / 2, 0);
      this.cage.add(panel);
      this.parts.push(panel);
      this.panels.push({ mesh: panel, angle: Math.atan2(mid.y, mid.x), shake: 0, base: panel.position.clone() });
      // Top rail and bottom padding along the panel.
      for (const [y, r, color] of [
        [CAGE_HEIGHT, 0.045, 0x8a92a6],
        [0.12, 0.12, 0x2a3150],
      ] as const) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), new THREE.MeshLambertMaterial({ color, transparent: true }));
        rail.position.set(mid.x, y, mid.y);
        rail.lookAt(p1.x, y, p1.y);
        rail.rotateX(Math.PI / 2);
        this.cage.add(rail);
        this.parts.push(rail);
      }
    }
    // Padded corner posts (black with a colored band).
    for (const [k, p] of corners.entries()) {
      // Lit steel post (it rendered as a flat black shape before) with a padded, colored sleeve.
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, CAGE_HEIGHT + 0.1, 16), new THREE.MeshStandardMaterial({ color: 0x7a8296, metalness: 0.6, roughness: 0.35, transparent: true }));
      post.position.set(p.x, (CAGE_HEIGHT + 0.1) / 2, p.y);
      this.cage.add(post);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 16), new THREE.MeshLambertMaterial({ color: k % 2 ? 0x33b5ff : 0xff3d6e, emissive: k % 2 ? 0x0a2236 : 0x360a16, transparent: true }));
      pad.position.set(p.x, 0.95, p.y);
      this.cage.add(pad);
      this.parts.push(post, pad);
    }
  }

  /**
   * Fade the cage parts that sit between the camera and any fighter point (head, chest, hands, feet) to ~15% opacity,
   * smoothly (~150 ms), so the cage never hides the fight; parts return when they stop occluding.
   */
  updateOcclusion(camera: THREE.Camera, points: THREE.Vector3[], dt: number) {
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const hit = new Set<THREE.Object3D>();
    let blocked = 0;
    for (const p of points) {
      const dir = p.clone().sub(camPos);
      const dist = dir.length();
      this.ray.set(camPos, dir.normalize());
      this.ray.far = dist - 0.05;
      const hits = this.ray.intersectObjects(this.parts, false);
      if (hits.length) {
        blocked++;
        for (const h of hits) hit.add(h.object);
      }
    }
    this.occlusion = points.length ? blocked / points.length : 0;
    const k = Math.min(1, dt / 0.15);
    for (const m of this.parts) {
      const mat = m.material as THREE.Material & { opacity: number };
      const target = hit.has(m) ? 0.08 : 1;
      mat.opacity += (target - mat.opacity) * k;
      mat.depthWrite = mat.opacity > 0.9;
      if (mat.alphaTest > 0) mat.alphaTest = 0.35 * mat.opacity; // chain-link: keep the wire visible but faint
    }
  }

  /** No edge warning in the octagon (kept for the view's interface). */
  setEdgeWarning(_level: number) {}

  /** A fighter slammed into the cage at world (x, z): the nearest panel shakes. */
  cageHit(x: number, z: number, strength = 1) {
    const a = Math.atan2(z, x);
    let best = this.panels[0];
    let bd = 9;
    for (const p of this.panels) {
      const d = Math.abs(Math.atan2(Math.sin(a - p.angle), Math.cos(a - p.angle)));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) best.shake = Math.min(1.5, best.shake + strength);
  }

  update(time: number) {
    for (const p of this.panels) {
      if (p.shake <= 0.001) {
        p.mesh.position.copy(p.base);
        continue;
      }
      p.shake *= 0.9;
      const out = new THREE.Vector3(Math.cos(p.angle), 0, Math.sin(p.angle));
      p.mesh.position.copy(p.base).addScaledVector(out, Math.sin(time * 60) * 0.05 * p.shake);
    }
    if (this.flashMat) this.flashMat.opacity = 0.35 + 0.45 * Math.abs(Math.sin(time * 7.3));
    for (const [i, s] of this.lightsGlow.entries()) s.material.opacity = 0.85 + 0.15 * Math.sin(time * 2 + i);
  }
}
