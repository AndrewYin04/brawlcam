// The 3D stage: renderer, ring, lights, sky, and camera rigs.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SkyStage } from './stage';

export class Arena {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  radius: number;
  private ringEdge!: THREE.Mesh;
  private floorMat!: THREE.ShaderMaterial;
  private crowd!: THREE.InstancedMesh;
  shake = 0;
  private camPos = new THREE.Vector3(0, 2, 5);
  private camLook = new THREE.Vector3(0, 1.2, 0);

  stage: SkyStage | null = null;
  private composer: EffectComposer | null = null;

  constructor(canvas: HTMLCanvasElement, radius = 4.2, lowPower = false, private lowGfx = false, private sky = false) {
    this.radius = radius;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(lowGfx ? 0.5 : Math.min(window.devicePixelRatio, lowPower ? 1 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 700);
    if (sky) {
      this.stage = new SkyStage(this.scene);
      if (!lowPower) {
        // Bloom on emissive glows (gloves, edge, effects); high threshold keeps the scene itself crisp.
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.35, 0.96));
        this.composer.addPass(new OutputPass());
      }
    } else this.build();
    this.resize();
  }

  private build() {
    const s = this.scene;
    s.background = new THREE.Color(0x070912);
    s.fog = new THREE.Fog(0x070912, 14, 40);
    s.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1020, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 8, 4);
    s.add(key);
    const rim1 = new THREE.PointLight(0xff3366, 30, 18);
    rim1.position.set(-5, 4, -4);
    const rim2 = new THREE.PointLight(0x33aaff, 30, 18);
    rim2.position.set(5, 4, 4);
    s.add(rim1, rim2);

    // Floor: dark disc with a neon grid and glowing edge.
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, radius: { value: this.radius } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time; uniform float radius; varying vec2 vP;
        void main(){
          float r = length(vP);
          vec2 g = abs(fract(vP * 1.0) - 0.5);
          float grid = smoothstep(0.47, 0.5, max(g.x, g.y));
          float edge = smoothstep(radius - 0.35, radius - 0.02, r) * (1.0 - smoothstep(radius - 0.02, radius, r));
          float rings = 0.5 + 0.5 * sin(r * 6.0 - time * 2.0);
          vec3 base = mix(vec3(0.05, 0.06, 0.12), vec3(0.09, 0.07, 0.16), r / radius);
          vec3 col = base + grid * vec3(0.12, 0.35, 0.7) * 0.35 + edge * vec3(1.0, 0.25, 0.55) * 2.2 + rings * 0.015;
          float logo = smoothstep(1.05, 1.0, r) * smoothstep(0.9, 0.95, r);
          col += logo * vec3(1.0, 0.7, 0.2) * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(this.radius, 96), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    // Platform side
    const side = new THREE.Mesh(new THREE.CylinderGeometry(this.radius, this.radius * 0.96, 0.6, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x141826, metalness: 0.6, roughness: 0.4 }));
    side.position.y = -0.3;
    s.add(side);
    this.ringEdge = new THREE.Mesh(new THREE.TorusGeometry(this.radius, 0.035, 8, 128), new THREE.MeshBasicMaterial({ color: 0xff4488 }));
    this.ringEdge.rotation.x = Math.PI / 2;
    this.ringEdge.position.y = 0.02;
    s.add(this.ringEdge);
    // Corner posts with glowing tops
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 12), new THREE.MeshStandardMaterial({ color: 0x222838, metalness: 0.8, roughness: 0.3 }));
      post.position.set(Math.cos(a) * this.radius * 0.98, 0.65, Math.sin(a) * this.radius * 0.98);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x33aaff : 0xff3366 }));
      cap.position.copy(post.position).setY(1.35);
      s.add(post, cap);
    }
    // Abyss below (for ring-outs) and stadium crowd as glowing dots.
    const crowdGeo = new THREE.SphereGeometry(0.07, 5, 3);
    const crowdMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const N = 900;
    this.crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, N);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const row = Math.floor(Math.random() * 10);
      const r = this.radius + 9 + row * 1.1;
      m.makeTranslation(Math.cos(a) * r, -1.5 + row * 0.7 + Math.random() * 0.2, Math.sin(a) * r);
      this.crowd.setMatrixAt(i, m);
      c.setHSL(Math.random(), 0.6, 0.12 + Math.random() * 0.12);
      this.crowd.setColorAt(i, c);
    }
    if (!this.lowGfx) s.add(this.crowd);
    // Overhead light rig
    const rig = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
    rig.rotation.x = Math.PI / 2;
    rig.position.y = 7;
    s.add(rig);
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 72 : 55;
    this.camera.updateProjectionMatrix();
  }

  /** Smoothly move the camera toward a pose; snap if requested. */
  setCamera(pos: THREE.Vector3, look: THREE.Vector3, dt: number, snap = false) {
    // Teleports (round start, respawn) cut instead of sweeping the camera across the arena.
    const k = snap || this.camPos.distanceTo(pos) > 3 ? 1 : 1 - Math.exp(-dt * 5);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3.5);
    }
    this.camera.lookAt(this.camLook);
  }

  update(time: number) {
    if (this.stage) {
      this.stage.update(time);
      return;
    }
    this.floorMat.uniforms.time.value = time;
    const pulse = 0.6 + 0.4 * Math.sin(time * 3);
    (this.ringEdge.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.25 * pulse, 0.55 * pulse);
    this.crowd.rotation.y = Math.sin(time * 0.1) * 0.02;
  }

  renderMs = 0;
  render() {
    const t0 = performance.now();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.renderMs = this.renderMs * 0.9 + (performance.now() - t0) * 0.1;
  }
}
