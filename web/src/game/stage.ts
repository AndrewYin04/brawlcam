// Floating sky stage (hero renderer): a platform high above a city, clouds, sky dome, glowing edge that warns
// when a fighter is near the drop. Knock-off edges are the point: falling past them is a ring-out.
import * as THREE from 'three';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SkyStage {
  group = new THREE.Group();
  radius = 3.2;
  private platform = new THREE.Group();
  private edgeMat!: THREE.MeshBasicMaterial;
  private edge!: THREE.Mesh;
  private clouds: THREE.Sprite[] = [];
  private warn = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    scene.background = new THREE.Color(0x7fb6ff);
    scene.fog = new THREE.Fog(0xbcd8ff, 30, 140);
    this.buildSky();
    this.buildLights();
    this.group.add(this.platform);
    this.buildPlatform(this.radius);
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(0x2f6fe0) }, mid: { value: new THREE.Color(0x8fc3ff) }, low: { value: new THREE.Color(0xffd6a8) }, sun: { value: new THREE.Vector3(0.4, 0.35, -0.85).normalize() } },
        vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun; varying vec3 vD;
          void main(){ float h = vD.y; vec3 c = h > 0. ? mix(mid, top, smoothstep(0., .6, h)) : mix(mid, low, smoothstep(0., -.35, h));
            float s = max(dot(vD, sun), 0.); c += vec3(1., .85, .6) * (pow(s, 64.) * 1.2 + pow(s, 6.) * .25); gl_FragColor = vec4(c, 1.); }`,
      }),
    );
    this.group.add(sky);
    // Clouds: soft billboards around and far below the platform.
    const puff = canvasTex(128, 128, (g) => {
      for (let i = 0; i < 6; i++) {
        const x = 30 + Math.random() * 68, y = 50 + Math.random() * 30, r = 22 + Math.random() * 16;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      }
    });
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.85, fog: true }));
      const a = Math.random() * Math.PI * 2;
      const below = i < 40;
      const r = below ? 22 + Math.random() * 90 : 45 + Math.random() * 90;
      m.position.set(Math.cos(a) * r, below ? -16 - Math.random() * 30 : 10 + Math.random() * 30, Math.sin(a) * r);
      m.scale.setScalar(below ? 10 + Math.random() * 12 : 14 + Math.random() * 16);
      m.userData.speed = 0.2 + Math.random() * 0.4;
      this.clouds.push(m);
      this.group.add(m);
    }
    // City far below: instanced towers with lit windows.
    const N = 600;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const city = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 110;
      const h = 2 + Math.random() * Math.random() * 18;
      const w = 1.5 + Math.random() * 3;
      m4.compose(new THREE.Vector3(Math.cos(a) * r, -60 + h / 2, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(w, h, w));
      city.setMatrixAt(i, m4);
      col.setHSL(0.58 + Math.random() * 0.1, 0.35, 0.45 + Math.random() * 0.25);
      city.setColorAt(i, col);
    }
    this.group.add(city);
  }

  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a6a, 1.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(6, 12, 8);
    const rim = new THREE.DirectionalLight(0x88b8ff, 1.6);
    rim.position.set(-6, 5, -10);
    this.group.add(key, rim);
  }

  setRadius(r: number) {
    if (Math.abs(r - this.radius) < 0.01) return;
    this.radius = r;
    this.buildPlatform(r);
  }

  private buildPlatform(R: number) {
    this.platform.clear();
    // Top: toon-shaded tiles with a center emblem.
    const top = canvasTex(1024, 1024, (g) => {
      g.fillStyle = '#c9d4e8';
      g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 16; j++) {
          g.fillStyle = (i + j) % 2 ? '#bccadf' : '#cfd9ea';
          g.fillRect(i * 64, j * 64, 64, 64);
        }
      g.strokeStyle = '#a9b8d2';
      g.lineWidth = 3;
      for (let i = 0; i <= 16; i++) {
        g.beginPath();
        g.moveTo(i * 64, 0);
        g.lineTo(i * 64, 1024);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * 64);
        g.lineTo(1024, i * 64);
        g.stroke();
      }
      g.strokeStyle = '#ff3d6e';
      g.lineWidth = 18;
      g.beginPath();
      g.arc(512, 512, 150, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#33b5ff';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(512, 512, 115, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,61,110,0.9)';
      g.font = 'bold 120px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('TH', 512, 516);
    });
    const topMesh = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshToonMaterial({ map: top }));
    topMesh.rotation.x = -Math.PI / 2;
    this.platform.add(topMesh);
    // Rim band and rocky, tapered underside.
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.35, 96, 1, true), new THREE.MeshToonMaterial({ color: 0x3a4a78 }));
    band.position.y = -0.175;
    const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.98, R * 1.6, 48, 4, true), new THREE.MeshToonMaterial({ color: 0x6b5a7e, side: THREE.DoubleSide }));
    under.rotation.x = Math.PI;
    under.position.y = -0.35 - R * 0.8;
    this.platform.add(band, under);
    // Glowing edge (turns warning red near a fighter).
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
    this.edge = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 8, 160), this.edgeMat);
    this.edge.rotation.x = Math.PI / 2;
    this.edge.position.y = 0.02;
    this.platform.add(this.edge);
    // Floating crystals under the stage for depth.
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + Math.random() * 0.4), new THREE.MeshToonMaterial({ color: i % 2 ? 0x33b5ff : 0xff3d6e, emissive: i % 2 ? 0x113355 : 0x551122 }));
      const a = (i / 6) * Math.PI * 2;
      c.position.set(Math.cos(a) * R * 0.7, -R * 1.4 - Math.random(), Math.sin(a) * R * 0.7);
      c.userData.spin = 0.5 + Math.random();
      this.platform.add(c);
    }
  }

  /** 0..1 warning level (a fighter within ~1 m of the edge). */
  setEdgeWarning(level: number) {
    this.warn += (level - this.warn) * 0.2;
  }

  update(time: number) {
    if (this.edgeMat) {
      const pulse = 0.5 + 0.5 * Math.sin(time * (6 + this.warn * 10));
      const calm = new THREE.Color(0x66e0ff);
      const danger = new THREE.Color(0xff2a3a);
      this.edgeMat.color.copy(calm).lerp(danger, this.warn * (0.6 + 0.4 * pulse));
      (this.edge.scale as THREE.Vector3).setScalar(1);
    }
    for (const c of this.clouds) {
      c.position.x += Math.sin(time * 0.05 + c.position.z) * 0.002 * c.userData.speed;
    }
    for (const ch of this.platform.children) if (ch.userData.spin) ch.rotation.y = time * ch.userData.spin;
  }
}
