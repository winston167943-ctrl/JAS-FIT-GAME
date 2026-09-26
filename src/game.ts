import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Input } from './core/input';
import { Audio } from './core/audio';
import { Sparkles } from './core/fx';
import { Sky } from './world/sky';
import { World, type Spot } from './world/world';
import { PLACES } from './world/layout';
import { Player } from './player/player';
import { CameraRig } from './player/camera';
import { Car, Traffic } from './vehicles/car';
import { Npc, NPCS } from './characters/npcs';
import { ModelAvatar } from './characters/model';
import { SpriteAvatar } from './characters/sprite';
import { Spectacle } from './world/spectacle';
import { MiniMap } from './ui/minimap';
import { Crowd } from './characters/crowd';
import { Grass } from './world/grass';
import { Weather } from './world/weather';
import { RING, DOWNTOWN } from './world/layout';
import { UI, TouchControls, el, type MenuItem } from './ui/ui';
import { Phone, type Quality } from './phone/phone';
import { GameState, OUTFITS, wipe, clamp } from './systems/state';
import { FOODS, MENUS } from './systems/foods';
import { WeightsGame, BandGame, TreadmillGame, HoopGame, TrackRun, type MiniGame, type MgContext } from './minigames/minigames';
import type { Pose } from './characters/chibi';
import logoUrl from './assets/jas-logo.png';

type Mode = 'intro' | 'explore' | 'drive' | 'busy' | 'minigame' | 'track' | 'selfie';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.35 }, uWarm: { value: 0.04 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uWarm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uStrength * 2.2;
      c.rgb *= v; c.r += uWarm * 0.6; c.b -= uWarm * 0.4;
      float l = dot(c.rgb, vec3(0.299,0.587,0.114)); c.rgb = mix(vec3(l), c.rgb, 1.08);
      gl_FragColor = c; }`,
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, 0.1, 900);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private vignette: ShaderPass | null = null;
  private input: Input;
  readonly audio = new Audio();
  private state = new GameState();
  private sky: Sky;
  private world: World;
  private player: Player;
  private rig: CameraRig;
  private car: Car;
  private traffic: Traffic;
  private npcs: Npc[] = [];
  private ui: UI;
  private touch: TouchControls | null = null;
  private phone: Phone;
  private fx: Sparkles;
  private spectacle: Spectacle;
  private crowd: Crowd;
  private grass: Grass;
  private weather: Weather;
  private minimap!: MiniMap;
  private splashT = 0;
  private wasSwimming = false;
  private mode: Mode = 'intro';
  private mg: MiniGame | null = null;
  private track: TrackRun | null = null;
  private busyTimer = 0;
  private busyDone: (() => void) | null = null;
  private quality: Quality;
  private clock = new THREE.Timer();
  private introT = 0;
  private saveT = 0;
  private questT = 0;
  private hintT = 5;
  private fpsAcc = { t: 0, n: 0, checks: 0 };
  private bubbleState = new Map<string, { text: string; until: number; next: number }>();
  private thought = { text: '', until: 0, next: 8 };
  private selfiePose = 0;
  private selfieUi: HTMLElement | null = null;
  private tmp = new THREE.Vector3();
  private hoopPos = new THREE.Vector3(0, 3.0, -36.5);
  private elapsed = 0;
  private skipIntro = false;

  constructor(private host: HTMLElement) {
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
    this.quality = isTouch ? (weak ? 'low' : 'medium') : 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.domElement.className = 'game';
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.append(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.input = new Input(this.renderer.domElement);
    this.sky = new Sky(this.scene, this.quality === 'high' ? 2048 : 1024);
    this.world = new World(this.scene, 4);
    this.player = new Player(this.scene);
    this.rig = new CameraRig(this.camera);
    this.rig.touch = matchMedia('(pointer: coarse)').matches;
    this.rig.occluders = this.world.occluders;
    this.car = new Car('#f7c9d4', true);
    this.car.pos.set(-16, 0, -2.4);
    this.car.yaw = Math.PI / 2;
    this.scene.add(this.car.group);
    this.traffic = new Traffic(this.scene, [{ loop: RING, count: 6 }, { loop: DOWNTOWN, count: 5 }]);
    this.crowd = new Crowd(this.scene);
    this.grass = new Grass(this.scene, 0);
    this.weather = new Weather(this.scene);
    for (const d of NPCS) this.npcs.push(new Npc(d, this.scene));
    this.fx = new Sparkles(this.scene);
    this.spectacle = new Spectacle(this.scene);

    this.ui = new UI(host);
    if (this.input.isTouch) this.touch = new TouchControls(host, this.input);
    this.ui.onPrompt = () => this.input.press('interact');
    this.minimap = new MiniMap(this.ui.root);
    this.minimap.onClick = () => { if (this.mode === 'explore' && !this.ui.modalOpen) { this.input.enabled = false; this.phone.show('map'); } };
    this.ui.onPhone = () => this.togglePhone();
    this.ui.onBody = () => this.phone.show('body');
    this.phone = new Phone(host, {
      state: this.state,
      audio: this.audio,
      quality: () => this.quality,
      setQuality: (q) => this.applyQuality(q),
      fastTravel: (id) => this.fastTravel(id),
      order: (id) => this.orderDelivery(id),
      selfie: () => this.startSelfie(),
      setOutfit: (id) => this.setOutfit(id),
      reset: () => { wipe(); location.reload(); },
      playerPos: () => ({ x: this.player.pos.x, z: this.player.pos.z }),
      onClose: () => { this.input.enabled = true; },
      toast: (t, tone) => this.ui.toast(t, tone),
    });

    this.state.on((e) => {
      if (e.type === 'toast') this.ui.toast(e.text, e.tone);
      if (e.type === 'coins' && e.delta > 0) { this.ui.coinPop(); this.audio.play('coin'); }
      if (e.type === 'quest') {
        this.ui.toast(`✅ משימה הושלמה! +🪙`, 'good', true);
        this.audio.play('success');
        this.fx.burst(this.player.pos, ['#ffd166', '#7bd389', '#ffffff'], 60);
        this.ui.renderQuests(this.state);
      }
      if (e.type === 'level') {
        this.ui.toast(`⭐ עלית לרמה ${e.level}! ${OUTFITS.find((o) => o.level === e.level) ? 'תלבושת חדשה נפתחה בארון 👗' : ''}`, 'good', true, 4200);
        this.audio.play('levelup');
        this.fx.burst(this.player.pos, ['#ffd166', '#f3cf85', '#ffffff', '#ff8fb1'], 140, 1.3);
      }
      if (e.type === 'body') {
        this.ui.toast(e.better ? `✨ הגוף משתנה! יסמין עכשיו: ${e.label}` : `⚠️ הגוף משתנה... יסמין עכשיו: ${e.label}`, e.better ? 'good' : 'bad', true, 4500);
        this.audio.play(e.better ? 'levelup' : 'fail');
        this.fx.burst(this.player.pos, e.better ? ['#ffd166', '#7bffb2', '#ffffff'] : ['#ff8a8a', '#ffb4a2'], 120);
      }
    });

    // Test / demo URL params: ?hour=21 &nointro &fat=70 &fit=80
    const qp = new URLSearchParams(location.search);
    if (qp.has('hour')) this.state.s.minutes = Number(qp.get('hour')) * 60;
    if (qp.has('fat')) this.state.st.bodyFat = Number(qp.get('fat'));
    if (qp.has('fit')) this.state.st.fitness = Number(qp.get('fit'));
    if (qp.has('nointro')) this.state.s.tutorial = true;
    this.skipIntro = qp.has('nointro');
    if (qp.has('debug')) (window as unknown as { game: Game }).game = this;

    this.weather.onChange = (k) => {
      if (this.mode === 'intro') return;
      if (k === 'rain') this.ui.toast('🌧️ מתחיל לרדת גשם... אולי אימון בחדר הכושר?', 'info');
      else if (k === 'cloudy') this.ui.toast('☁️ מתעננן', 'info');
      else this.ui.toast('☀️ השמש חוזרת — חפשי קשת בענן! 🌈', 'good');
    };
    if (qp.has('weather')) this.weather.set(qp.get('weather') as 'rain');

    const outfit = OUTFITS.find((o) => o.id === this.state.s.outfit);
    if (outfit && outfit.id !== 'jas') this.player.chibi.setOutfit(outfit.color);
    this.player.place(-31, -24.5, 0.25);
    this.player.chibi.fat = this.state.fatN;
    this.player.chibi.tone = this.state.toneN;
    this.rig.yaw = 0.35;
    this.rig.pitch = 0.22;
    this.rig.dist = 6.5;

    this.applyQuality(this.quality, true);
    // Yasmin herself: the real renders from the brand video as a paper cut-out.
    const sprite = new SpriteAvatar();
    sprite.setCamera(this.camera);
    this.player.setAvatar(sprite, this.scene);
    // If a real rigged model of Yasmin is present, swap it in for the procedural one.
    void ModelAvatar.load().then((m) => {
      if (!m) return;
      this.player.setAvatar(m, this.scene);
      console.info('JAS FIT: loaded rigged Yasmin model');
    }).catch((e) => console.warn('Model load failed, keeping procedural Yasmin', e));
    this.ui.renderQuests(this.state);
    this.ui.setVisible(false);
    this.touch?.setVisible(false);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.state.save(); });
    window.addEventListener('beforeunload', () => this.state.save());
  }

  /** Render a few frames so shaders compile before the title screen hides. */
  warmup(): void {
    this.renderer.compile(this.scene, this.camera);
    this.camera.position.set(0, 70, 95);
    this.camera.lookAt(0, 0, 0);
    this.render();
  }

  start(): void {
    this.audio.unlock();
    this.ui.setVisible(true);
    this.touch?.setVisible(true);
    this.mode = 'intro';
    this.introT = this.skipIntro ? 99 : 0;
    this.rig.snap(this.player.pos);
    this.player.chibi.pose = 'wave';
    this.player.locked = true;
    this.clock.reset();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------- quality ----------------
  private applyQuality(q: Quality, initial = false): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sky.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sky.sun.shadow.mapSize.x !== size) {
      this.sky.sun.shadow.mapSize.set(size, size);
      this.sky.sun.shadow.map?.dispose();
      (this.sky.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    this.crowd.maxVisible = q === 'high' ? 22 : q === 'medium' ? 12 : 6;
    this.grass.setCount(q === 'high' ? 26000 : q === 'medium' ? 11000 : 0);
    const lights = q === 'high' ? 4 : q === 'medium' ? 2 : 0;
    let i = 0;
    this.scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight) o.visible = i++ < lights; });
    if (q === 'low') { this.composer = null; this.bloom = null; }
    else this.buildComposer();
    this.resize();
    if (!initial) {
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
      this.ui.toast(`איכות גרפיקה: ${{ low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' }[q]}`);
    }
  }

  private buildComposer(): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 2 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.82);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.vignette = new ShaderPass(VignetteShader);
    c.addPass(this.vignette);
    this.composer = c;
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  private render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // ---------------- main loop ----------------
  private frame(): void {
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    const st = this.state.st;
    const inMenu = this.ui.modalOpen || this.phone.isOpen;
    this.input.enabled = !inMenu && this.mode !== 'intro';

    // Global actions
    if (this.input.consume('phone') && this.mode !== 'minigame' && this.mode !== 'intro') this.togglePhone();
    if (this.input.consume('map') && !inMenu && this.mode === 'explore') this.phone.show('map');
    if (this.input.consume('selfie') && !inMenu && this.mode === 'explore') this.startSelfie();
    if (this.input.consume('escape')) {
      if (this.phone.isOpen) this.phone.close();
      else if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.mode === 'selfie') this.endSelfie();
      else if (this.mode === 'track') this.endTrack();
    }

    // Time only flows while playing (not in menus)
    const gm = inMenu || this.mode === 'intro' ? 0 : dt * 1.0;
    let dist = 0;

    switch (this.mode) {
      case 'intro': this.updateIntro(dt); break;
      case 'explore':
      case 'track':
        dist = this.player.update(dt, this.input, this.rig.yaw, this.state, this.world.col, this.audio);
        if (!inMenu) this.handleExploreActions();
        if (this.track) this.track.update(dt, this.player.pos, this.player.speed);
        break;
      case 'drive': this.updateDrive(dt, inMenu); break;
      case 'busy':
      case 'minigame':
      case 'selfie':
        this.player.update(dt, this.input, this.rig.yaw, this.state, this.world.col, this.audio);
        if (this.mode === 'busy') {
          this.busyTimer -= dt;
          if (this.busyTimer <= 0 && this.busyDone) { const f = this.busyDone; this.busyDone = null; f(); }
        }
        if (this.mg) this.mg.update(dt);
        this.input.consume('interact');
        this.input.consume('jump');
        this.input.consume('car');
        break;
    }
    this.player.sweatBoost = Math.max(0, this.player.sweatBoost - dt * 20);

    const act = this.mode === 'drive' ? 'drive' : this.mode === 'minigame' ? 'workout' : this.player.activity;
    this.state.tick(gm, act, dist);

    // World & sky
    const hour = this.state.hour;
    const focus = this.mode === 'drive' ? this.car.pos : this.player.pos;
    this.sky.update(hour, dt, focus, this.camera.position);
    this.weather.update(dt, gm, hour, this.camera, this.sky.sunDirection);
    const oc = this.weather.overcast;
    this.sky.sun.intensity *= 1 - oc * 0.7;
    this.sky.hemi.intensity *= 1 - oc * 0.25;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.lerp(new THREE.Color(0x8a93a0).multiplyScalar(1 - this.sky.glow * 0.8), oc * 0.7);
    fog.near = 120 - this.weather.rain * 80; fog.far = 420 - this.weather.rain * 250;
    this.audio.setRain(this.weather.rain);
    this.world.update(dt, this.sky.glow, this.player.pos, this.camera.position, this.sky.horizon);
    this.audio.night = this.sky.glow > 0.6;
    Car.setNight(this.sky.glow);
    SpriteAvatar.tint.setRGB(1, 1, 1).lerp(new THREE.Color(0.42, 0.47, 0.72), this.sky.glow * 0.85);
    SpriteAvatar.rim.copy(this.sky.sun.color).multiplyScalar((1 - this.sky.glow) * 0.25).add(new THREE.Color(0.35, 0.25, 0.12).multiplyScalar(this.sky.glow));
    this.scene.environmentIntensity = 0.03 + (1 - this.sky.glow) * 0.37;
    this.renderer.toneMappingExposure = 0.85 + this.sky.glow * 0.2;
    if (this.bloom) {
      this.bloom.strength = 0.12 + this.sky.glow * 0.7;
      this.bloom.threshold = 1.0 - this.sky.glow * 0.4;
    }
    if (this.vignette) this.vignette.uniforms.uWarm.value = 0.03 * (1 - this.sky.glow);
    const blockers = [this.player.pos, this.car.pos];
    this.traffic.update(dt, blockers);
    for (const n of this.npcs) n.update(dt, this.player.pos, this.elapsed);
    this.crowd.update(dt, this.camera.position, this.player.pos, this.elapsed);
    this.grass.update(dt, this.mode === 'drive' ? this.car.pos : this.player.pos, 1 + this.weather.rain * 1.5 + oc * 0.5);
    this.fx.update(dt);
    this.spectacle.update(dt, this.sky.glow, hour, this.player.pos, this.camera);
    const mp = this.mode === 'drive' ? this.car.pos : this.player.pos;
    this.minimap.update(dt, mp.x, mp.z, this.mode === 'drive' ? this.car.yaw : this.player.yaw, this.rig.yaw, this.sky.glow);
    this.updateSwim(dt);

    // Camera
    const look = this.input.takeLook();
    if (this.mode === 'drive') {
      this.rig.mode = { kind: 'car', yaw: this.car.yaw, speed: this.car.speed };
      this.rig.update(dt, this.car.pos, this.car.yaw, look, true);
    } else if (this.mode !== 'intro') {
      this.rig.update(dt, this.player.pos, this.player.yaw, look, this.player.speed > 0.5);
    }

    this.updateBubbles();
    this.ui.update(this.state, { show: this.mode === 'explore' || this.mode === 'track' ? st.stamina < 99 : false, v: st.stamina });
    this.questT -= dt;
    if (this.questT <= 0) { this.questT = 1; this.ui.renderQuests(this.state); this.hints(); }
    this.saveT += dt;
    if (this.saveT > 10) { this.saveT = 0; this.state.save(); }
    this.render();
    this.adaptQuality(dt);
  }

  private adaptQuality(dt: number): void {
    const f = this.fpsAcc;
    if (f.checks >= 3 || this.mode === 'intro') return;
    f.t += dt; f.n++;
    if (f.t >= 4) {
      const fps = f.n / f.t;
      f.t = 0; f.n = 0; f.checks++;
      if (fps < 32 && this.quality !== 'low') this.applyQuality(this.quality === 'high' ? 'medium' : 'low');
    }
  }

  private updateIntro(dt: number): void {
    this.introT += dt;
    const T = 4.2;
    const k = Math.min(1, this.introT / T);
    const e = 1 - Math.pow(1 - k, 3);
    const p = this.player.pos;
    const endYaw = this.rig.yaw, endPitch = this.rig.pitch, endD = this.rig.dist;
    const start = new THREE.Vector3(p.x + 70, 55, p.z + 90);
    const end = new THREE.Vector3(p.x + Math.sin(endYaw) * Math.cos(endPitch) * endD, p.y + 1.3 + Math.sin(endPitch) * endD, p.z + Math.cos(endYaw) * Math.cos(endPitch) * endD);
    const mid = new THREE.Vector3(p.x + 18, 22, p.z + 30);
    const a = start.clone().lerp(mid, e), b = mid.clone().lerp(end, e);
    this.camera.position.copy(a.lerp(b, e));
    this.camera.lookAt(this.tmp.copy(p).setY(1.2 * e + (1 - e) * 0));
    this.player.update(dt, this.input, this.rig.yaw, this.state, this.world.col, this.audio);
    if (k >= 1) {
      this.mode = 'explore';
      this.player.locked = false;
      this.rig.snap(this.player.pos);
      if (!this.state.s.tutorial) this.welcome();
    }
  }

  private welcome(): void {
    this.ui.dialog('👋', 'היי, אני יסמין!', `ברוכים הבאים לשכונה שלי 💛<br><br>
      כאן <b>כל בחירה משנה את הגוף</b>: אוכל בריא, מים, אימונים וריצה יבנו גוף חטוב, מהיר ומלא אנרגיה.<br>
      ג׳אנק וישיבה על הספה? הגוף יתעגל, הריצה תאט, ואני אזיע ואתנשף 😅<br><br>
      ${this.input.isTouch ? '🕹️ ג׳ויסטיק לתנועה · ✋ לפעולה · גרירה לסיבוב המצלמה' : '⌨️ WASD לתנועה · Shift ריצה · E פעולה · F רכב · Tab טלפון · גרירה = מצלמה'}`,
      [{ label: 'יאללה, מתחילות! ✨', primary: true, onClick: () => { this.state.s.tutorial = true; this.state.save(); } }]);
  }

  // ---------------- interaction ----------------
  private nearNpc(): Npc | null {
    let best: Npc | null = null, bd = 2.6;
    for (const n of this.npcs) {
      const d = n.pos.distanceTo(this.player.pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  private spotLabel(s: Spot): { icon: string; text: string } {
    const map: Record<string, [string, string]> = {
      fridge: ['🧊', 'לפתוח את המקרר'], water_home: ['🚰', 'לשתות מים'], water_gym: ['💧', 'לשתות מים'],
      bed: ['🛏️', this.state.hour >= 20 || this.state.hour < 5 ? 'ללכת לישון' : 'לנמנם'], mirror: ['🪞', 'מראה ומשקל חכם'], sofa: ['🛋️', 'לשבת על הספה'],
      dumbbells: ['🏋️‍♀️', 'אימון משקולות'], band: ['🎗️', 'אימון גומייה'], treadmill: ['🏃‍♀️', 'הליכון'],
      track: ['🏁', 'אתגר הקפות'], cafe: ['☕', 'להזמין בקפה'], foodtruck: ['🍔', 'משאית ג׳אנק'], bench: ['🪑', 'לנוח על הספסל'],
      swim: ['🌊', 'לשחות בים'], lounger: ['🏖️', 'להשתזף'], hoop: ['🏀', 'זריקות לסל'],
      lookout: ['🔭', 'להסתכל על הנוף'], plaza: ['💃', 'לרקוד מול המסך הענק'],
    };
    const [icon, text] = map[s.id] ?? ['✋', 'פעולה'];
    return { icon, text };
  }

  private handleExploreActions(): void {
    const p = this.player.pos;
    const npc = this.nearNpc();
    const spot = this.world.nearestSpot(p);
    const nearCar = p.distanceTo(this.car.pos) < 3.4 && this.mode === 'explore';
    const key = this.input.isTouch ? '✋' : 'E';
    if (this.mode === 'track') {
      this.ui.prompt(null, key);
    } else if (npc) {
      this.ui.prompt(`לדבר עם ${npc.def.name}`, key);
      this.touch?.setAction('💬');
    } else if (spot) {
      const l = this.spotLabel(spot);
      this.ui.prompt(`${l.icon} ${l.text}`, key);
      this.touch?.setAction(l.icon);
    } else if (nearCar) {
      this.ui.prompt('🚗 לנהוג ברכב', this.input.isTouch ? '✋' : 'F');
      this.touch?.setAction('🚗');
    } else {
      this.ui.prompt(null, key);
      this.touch?.setAction('✋');
    }
    this.touch?.setCar(nearCar ? '🚗' : null);
    if (this.input.consume('interact')) {
      if (this.mode === 'track') return;
      if (npc) this.talk(npc);
      else if (spot) this.useSpot(spot);
      else if (nearCar) this.enterCar();
    }
    if (this.input.consume('car') && nearCar) this.enterCar();
  }

  private lockAt(stand: { x: number; z: number; face: number }, pose: Pose, cam?: { dist?: number; height?: number; side?: number }): void {
    this.player.locked = true;
    this.player.speed = 0;
    this.player.place(stand.x, stand.z, stand.face);
    this.player.chibi.pose = pose;
    this.rig.mode = { kind: 'focus', x: stand.x, z: stand.z, face: stand.face, ...cam };
  }

  private unlock(): void {
    this.player.locked = false;
    this.player.chibi.hold(null);
    this.player.chibi.pose = 'idle';
    this.player.chibi.expression = 'happy';
    this.rig.mode = { kind: 'follow' };
    this.mode = 'explore';
  }

  /** Plays a timed action (eating, drinking, resting...). */
  private busy(stand: { x: number; z: number; face: number }, pose: Pose, seconds: number, done: () => void, item: 'cup' | 'food' | 'phone' | null = null): void {
    this.mode = 'busy';
    this.lockAt(stand, pose, { dist: 3.4, height: 1.7 });
    this.player.chibi.hold(item);
    this.busyTimer = seconds;
    this.busyDone = () => { done(); this.unlock(); };
  }

  private useSpot(s: Spot): void {
    const st = this.state.st;
    const tooTired = () => { this.ui.toast('😮‍💨 יסמין מותשת מדי לאימון — צריך לאכול, לשתות או לנוח', 'bad'); this.audio.play('fail'); };
    switch (s.id) {
      case 'fridge': this.foodMenu('🧊 המקרר בבית', 'אוכל מהבית — בחינם. מה בוחרים?', MENUS.fridge as unknown as string[], true, s); break;
      case 'cafe': this.foodMenu('☕ JAS Café', `בריא, טעים ומזין. יש לך 🪙 ${st.coins}`, MENUS.cafe as unknown as string[], false, s); break;
      case 'foodtruck': this.foodMenu('🍔 משאית הג׳אנק', 'טעים מאוד... אבל הגוף יזכור 😬', MENUS.foodtruck as unknown as string[], false, s); break;
      case 'water_home':
      case 'water_gym':
        this.audio.play('drink');
        this.busy(s.stand, 'drink', 1.8, () => this.state.drink(), 'cup');
        break;
      case 'bed': this.bed(s); break;
      case 'mirror': this.mirror(s); break;
      case 'sofa':
        this.ui.menu('🛋️ הספה', 'רגע של מנוחה... או פיתוי?', [
          { emoji: '😌', title: 'מנוחה קצרה', desc: 'אנרגיה +10 · שעה עוברת', onClick: () => this.busy(s.stand, 'sit', 2.5, () => { st.energy = clamp(st.energy + 10); st.mood = clamp(st.mood + 4); this.state.addMinutes(60); this.ui.toast('😌 נחת. אנרגיה +10', 'good'); }) },
          { emoji: '🍿', title: 'נטפליקס + נשנושים', desc: 'מצב רוח +15 · שומן +2.5 · 2 שעות', tag: { text: 'פיתוי', tone: 'bad' }, onClick: () => this.busy(s.stand, 'sit', 3, () => { st.mood = clamp(st.mood + 15); st.bodyFat = clamp(st.bodyFat + 2.5, 12, 95); st.fitness = clamp(st.fitness - 1); this.state.addMinutes(120); this.state.s.daily.junk++; this.ui.toast('🍿 היה כיף... אבל הספה והחטיפים עושים את שלהם ⚠️', 'bad'); }, 'food') },
        ]);
        break;
      case 'dumbbells':
        if (st.energy < 15) return tooTired();
        this.startMini((ctx) => new WeightsGame(ctx), s, { dist: 3.2, height: 1.55, side: -0.5 });
        break;
      case 'band':
        if (st.energy < 15) return tooTired();
        this.startMini((ctx) => new BandGame(ctx), s, { dist: 3.6, height: 1.8, side: 0.3 });
        break;
      case 'treadmill':
        if (st.energy < 15) return tooTired();
        this.startMini((ctx) => new TreadmillGame(ctx), s, { dist: 3.6, height: 1.9, side: 0.7 });
        break;
      case 'hoop':
        if (st.energy < 10) return tooTired();
        this.startMini((ctx) => new HoopGame(ctx, this.scene, this.hoopPos), s, { dist: 3.5, height: 2.2, side: 2.6 });
        break;
      case 'track': this.startTrack(); break;
      case 'bench':
        this.busy(s.stand, 'sit', 3, () => { st.energy = clamp(st.energy + 6); st.stamina = 100; st.mood = clamp(st.mood + 3); this.state.addMinutes(20); this.ui.toast('🪑 נשימה עמוקה, נוף יפה. אנרגיה +6', 'good'); });
        break;
      case 'lounger':
        this.busy({ ...s.stand }, 'lounge', 3.5, () => { st.energy = clamp(st.energy + 8); st.mood = clamp(st.mood + 12); st.hydration = clamp(st.hydration - 8); this.state.addMinutes(45); this.ui.toast('🏖️ שמש, ים, שקט. מצב רוח +12 (ותשתי מים!)', 'good'); });
        break;
      case 'lookout':
        this.mode = 'busy';
        this.lockAt(s.stand, 'wave', { dist: 60, height: 40, side: 0.2 });
        this.busyTimer = 7;
        this.busyDone = () => { st.mood = clamp(st.mood + 15); this.state.addMinutes(20); this.ui.toast('🔭 איזה נוף! כל העיר מתחתייך. מצב רוח +15', 'good'); this.unlock(); };
        this.fx.burst(this.player.pos, ['#ffd166', '#ffffff'], 60);
        break;
      case 'plaza':
        this.audio.playTrack(1);
        this.busy(s.stand, 'dance', 6, () => { st.mood = clamp(st.mood + 12); st.energy = clamp(st.energy - 6); this.state.st.bodyFat = clamp(this.state.st.bodyFat - 0.6, 12, 95); this.ui.toast('💃 ריקוד מול יסמין הענקית! מצב רוח +12, שומן −0.6', 'good'); this.fx.burst(this.player.pos, ['#ff5fa2', '#ffd166', '#6fd3ff'], 90); });
        break;
      case 'swim':
        if (st.energy < 15) return tooTired();
        this.busy(s.stand, 'swim', 4.5, () => {
          const r = this.state.workout('swim', 0.85);
          this.ui.toast(`🌊 שחייה מרעננת! ${r}`, 'good');
          this.player.place(s.x - 1.5, s.z, -Math.PI / 2);
        });
        this.rig.mode = { kind: 'focus', x: s.stand.x, z: s.stand.z, face: Math.PI / 2, dist: 5, height: 2.8, side: 0.6 };
        break;
    }
  }

  private foodMenu(title: string, sub: string, ids: string[], free: boolean, s: Spot): void {
    const items: MenuItem[] = ids.map((id) => {
      const f = FOODS[id];
      return {
        emoji: f.emoji,
        title: f.name,
        desc: f.desc,
        tag: f.healthy ? { text: 'בריא', tone: 'good' as const } : { text: 'ג׳אנק', tone: 'bad' as const },
        price: free ? 'חינם' : `🪙 ${f.price}`,
        disabled: !free && this.state.st.coins < f.price,
        onClick: () => this.eat(id, free, s.stand),
      };
    });
    this.ui.menu(title, sub, items);
  }

  private eat(id: string, free: boolean, stand: { x: number; z: number; face: number }): void {
    const f = FOODS[id];
    if (!free && this.state.st.coins < f.price) { this.ui.toast('אין מספיק מטבעות 🪙', 'bad'); return; }
    this.audio.play('eat');
    this.busy(stand, f.id === 'smoothie' || f.id === 'soda' ? 'drink' : 'eat', 2.4, () => {
      this.state.eat(f, free);
      if (!f.healthy) this.player.chibi.expression = 'happy';
    }, f.id === 'smoothie' || f.id === 'soda' ? 'cup' : 'food');
  }

  private orderDelivery(id: string): void {
    const f = FOODS[id];
    const price = f.price + 6;
    if (this.state.st.coins < price) { this.ui.toast('אין מספיק מטבעות 🪙', 'bad'); return; }
    this.state.addCoins(-price);
    this.ui.toast(`🛵 המשלוח בדרך... ${f.emoji}`);
    setTimeout(() => {
      if (this.mode !== 'explore') { this.state.eat(f, true); return; }
      this.audio.play('honk');
      const p = this.player.pos;
      this.eat(id, true, { x: p.x, z: p.z, face: this.player.yaw });
    }, 2500);
  }

  private bed(s: Spot): void {
    const h = this.state.hour;
    const night = h >= 20 || h < 5;
    if (night || this.state.st.energy < 30) {
      this.ui.dialog('🌙', 'לילה טוב?', 'לישון עד הבוקר? שינה ממלאת אנרגיה, ואחרי יום אימונים — השרירים נבנים בלילה 💪', [
        { label: 'לישון 😴', primary: true, onClick: () => this.sleep(s) },
        { label: 'עוד לא' },
      ]);
    } else {
      this.ui.dialog('😴', 'נמנום', `עכשיו ${this.state.clock}. נמנום של שעתיים ימלא קצת אנרגיה.`, [
        { label: 'לנמנם', primary: true, onClick: () => this.busy(s.stand, 'sleep', 3, () => { this.state.st.energy = clamp(this.state.st.energy + 25); this.state.addMinutes(120); this.ui.toast('😴 נמנום קטן — אנרגיה +25', 'good'); }) },
        { label: 'ביטול' },
      ]);
    }
  }

  private sleep(s: Spot): void {
    this.mode = 'busy';
    this.lockAt(s.stand, 'sleep', { dist: 4, height: 3.5 });
    this.player.pos.y = 0.95;
    this.player.chibi.expression = 'sleep';
    this.busyTimer = 999;
    void this.ui.fade('<div class="zzz">😴 Zzz...</div>', () => {
      const sum = this.state.sleep();
      this.player.pos.y = 0;
      this.unlock();
      this.player.place(s.x, s.z, 0);
      this.ui.renderQuests(this.state);
      const fd = sum.fatDelta;
      const verdict = fd < -1 ? '🔥 יום מעולה לגוף!' : fd > 1 ? '⚠️ הגוף הרגיש את הג׳אנק היום' : '🙂 יום מאוזן';
      setTimeout(() => this.ui.dialog('☀️', `בוקר טוב! יום ${this.state.s.day}`, `
        <b>סיכום יום ${sum.day}:</b> ${verdict}<br><br>
        🥗 ארוחות בריאות: <b>${sum.healthy}</b> · 🍔 ג׳אנק: <b>${sum.junk}</b><br>
        🏋️‍♀️ אימונים: <b>${sum.workouts}</b> · 🏁 הקפות: <b>${sum.laps}</b><br>
        ✅ משימות: <b>${sum.quests}/6</b><br>
        📊 שינוי בשומן: <b style="color:${fd <= 0 ? '#1f8a5f' : '#c2413c'}">${fd > 0 ? '+' : ''}${fd.toFixed(1)}</b><br><br>
        מצב הגוף: ${this.state.bodyLabel().emoji} <b>${this.state.bodyLabel().label}</b>`,
        [{ label: 'יום חדש! ✨', primary: true }]), 400);
    }, 1400);
  }

  private mirror(s: Spot): void {
    this.lockAt(s.stand, 'flex', { dist: 2.6, height: 1.5, side: 0.5 });
    this.mode = 'busy';
    this.busyTimer = 999;
    const st = this.state.st;
    const bl = this.state.bodyLabel();
    this.ui.modal((box, close) => {
      box.innerHTML = `<h2>🪞 המשקל החכם</h2><p class="subtitle">ככה הגוף של יסמין מגיב לבחירות שלך</p>
        <div class="card" style="text-align:center;background:#fff;border-radius:18px;padding:12px;margin-bottom:10px"><div style="font-size:46px">${bl.emoji}</div><div style="font-size:22px;font-weight:800;color:${bl.color}">${bl.label}</div></div>
        <div class="stat-grid">
          <div class="stat-card"><div class="k">אחוז שומן</div><div class="v">${Math.round(st.bodyFat)}<small>%</small></div></div>
          <div class="stat-card"><div class="k">כושר ושריר</div><div class="v">${Math.round(st.fitness)}<small>/100</small></div></div>
          <div class="stat-card"><div class="k">מהירות ריצה</div><div class="v">${Math.round(this.state.speedMul * 100)}<small>%</small></div></div>
          <div class="stat-card"><div class="k">שיא הקפה</div><div class="v">${this.state.s.best.lap ? this.state.s.best.lap.toFixed(1) + '<small>″</small>' : '—'}</div></div>
        </div>
        <div class="tip">${this.state.fatN > 0.4 ? '💡 כדי לחזור לכושר: ארוחה בריאה, 5 כוסות מים, אימון והקפות במסלול. השינוי יורגש כבר היום!' : this.state.toneN > 0.6 ? '🔥 הגוף חטוב ומהיר. תמשיכי ככה — ונסי לשבור שיא!' : '💡 אימוני משקולות בונים שריר, ריצה שורפת שומן. השילוב = גוף חטוב.'}</div>`;
      const a = el('div', 'actions');
      const b = el('button', 'btn primary', 'מעולה 💪');
      b.addEventListener('click', close);
      a.append(b);
      box.append(a);
    }, () => this.unlock());
  }

  private talk(n: Npc): void {
    const st = this.state.st;
    n.talking = true;
    const end = () => { n.talking = false; };
    const d = n.def;
    switch (d.id) {
      case 'coach': {
        const txt = st.bodyFat > 45 ? 'אני רואה שהגוף קצת כבד לאחרונה. אין שיפוטיות — רק תוכנית: מים, ארוחה בריאה, ואז סט משקולות. בואי נתחיל? 💪'
          : st.hydration < 30 ? 'לפני שאת נוגעת במשקולת — מים! בלי הידרציה את מקבלת רק חצי מהתוצאות 💧'
          : st.fitness > 65 ? 'וואו, את בכושר שיא! נסי את הגומייה על רמת קושי גבוהה 🔥'
          : 'משקולות בונות שריר, ריצה שורפת שומן. השילוב — זה הגוף שאת רוצה. מה עושים היום?';
        this.ui.dialog(d.emoji, `${d.name} · ${d.role}`, txt, [
          { label: '🏋️‍♀️ למשקולות', primary: true, onClick: () => { end(); const s = this.world.spots.find((x) => x.id === 'dumbbells')!; this.useSpot(s); } },
          { label: 'אחר כך', onClick: end },
        ], end);
        break;
      }
      case 'noa':
        this.ui.dialog(d.emoji, `${d.name} · ${d.role}`, 'היי יסמין! 🏃‍♀️ בואי לרוץ איתי במסלול — כל הקפה שורפת שומן ומחזקת. עברי בטבעות הירוקות!', [
          { label: '🏁 יאללה לרוץ!', primary: true, onClick: () => { end(); this.startTrack(); } },
          { label: 'לא עכשיו', onClick: end },
        ], end);
        break;
      case 'dani':
        this.ui.dialog(d.emoji, `${d.name} · ${d.role}`, 'בוקר טוב! 🌿 הפוקי סלמון היום מטורף, והשייק הירוק נותן אנרגיה לכל היום.', [
          { label: '☕ לתפריט', primary: true, onClick: () => { end(); const s = this.world.spots.find((x) => x.id === 'cafe')!; this.useSpot(s); } },
          { label: 'תודה!', onClick: end },
        ], end);
        break;
      default:
        this.ui.dialog(d.emoji, `${d.name} · ${d.role}`, st.mood > 60 ? 'איזה כיף לראות אותך מחייכת! 🌸 הכלב שלי ממש מתגעגע אלייך 🐶' : 'הכל בסדר? נראית קצת עייפה... טיול קצר ושתייה עושים פלאים 💛', [
          { label: '🐶 ללטף את הכלב', primary: true, onClick: () => { end(); st.mood = clamp(st.mood + 8); this.ui.toast('🐶 ווף! מצב רוח +8', 'good'); this.fx.burst(this.player.pos, ['#ff8fb1', '#ffffff'], 30); } },
          { label: 'ביי!', onClick: end },
        ], end);
    }
  }

  // ---------------- mini-games ----------------
  private startMini(make: (ctx: MgContext) => MiniGame, s: Spot, cam: { dist?: number; height?: number; side?: number }): void {
    this.mode = 'minigame';
    this.lockAt(s.stand, 'idle', cam);
    this.ui.prompt(null, '');
    this.touch?.setVisible(false);
    const ctx: MgContext = {
      host: this.host,
      input: this.input,
      audio: this.audio,
      chibi: this.player.chibi,
      state: this.state,
      shake: (v) => this.rig.addShake(v),
      sweat: (v) => { this.player.sweatBoost = Math.max(this.player.sweatBoost, v); },
      setSpeed: (v) => { this.player.speed = v; },
      done: (q, summary) => {
        this.mg?.destroy();
        this.mg = null;
        this.player.speed = 0;
        this.touch?.setVisible(true);
        this.unlock();
        if (summary) {
          const stars = q > 0.85 ? '⭐⭐⭐' : q > 0.55 ? '⭐⭐' : q > 0.2 ? '⭐' : '💤';
          this.fx.burst(this.player.pos, ['#ffd166', '#7bffb2', '#ffffff'], Math.round(40 + q * 80));
          this.ui.dialog(stars, q > 0.55 ? 'אימון מעולה!' : 'אימון הושלם', summary + (this.state.fatN > 0.4 ? '<br><br>😮‍💨 עם פחות משקל — הביצועים יהיו הרבה יותר קלים.' : ''), [{ label: 'המשך 💪', primary: true }]);
          this.audio.play(q > 0.55 ? 'levelup' : 'success');
        }
      },
    };
    this.mg = make(ctx);
  }

  private startTrack(): void {
    if (this.track) return;
    const s = this.world.spots.find((x) => x.id === 'track')!;
    this.player.place(s.stand.x, s.stand.z, s.stand.face);
    this.rig.yaw = s.stand.face + Math.PI;
    this.mode = 'track';
    this.track = new TrackRun(this.scene, this.host, this.state, this.audio, () => this.endTrack());
    this.ui.toast('🏁 רוצי דרך הטבעות הירוקות! (Shift / 🏃‍♀️ לריצה)', 'info', true);
    this.audio.playTrack(this.audio.track < 0 ? 2 : this.audio.track);
  }

  private endTrack(): void {
    if (!this.track) return;
    const laps = this.track.laps;
    this.track.destroy();
    this.track = null;
    this.mode = 'explore';
    if (laps > 0) this.ui.toast(`🏁 סיימת ${laps} הקפות — כל הכבוד!`, 'good', true);
  }

  // ---------------- car ----------------
  private enterCar(): void {
    this.mode = 'drive';
    this.player.locked = true;
    this.player.chibi.pose = 'drive';
    this.car.seat.add(this.player.chibi.root);
    this.player.chibi.root.position.set(0, 0, 0);
    this.player.chibi.root.rotation.set(0, 0, 0);
    this.player.chibi.root.scale.setScalar(0.85);
    this.rig.yaw = this.car.yaw + Math.PI;
    this.audio.play('honk');
    this.ui.prompt(this.input.isTouch ? 'לצאת מהרכב' : 'לצאת מהרכב', this.input.isTouch ? '🚪' : 'F');
    this.touch?.setCar('🚪');
    this.touch?.setAction('🚪');
    this.ui.toast(this.input.isTouch ? '🚗 ג׳ויסטיק לנהיגה' : '🚗 W/S גז וברקס · A/D היגוי · רווח בלם', 'info');
  }

  private exitCar(): void {
    const root = this.player.chibi.root;
    this.scene.add(root);
    root.scale.setScalar(1);
    const side = new THREE.Vector3(Math.cos(this.car.yaw), 0, -Math.sin(this.car.yaw)).multiplyScalar(-2.2);
    const p = this.car.pos.clone().add(side);
    this.world.col.resolve(p, 0.5);
    this.player.place(p.x, p.z, this.car.yaw);
    this.audio.setEngine(null);
    this.car.speed = 0;
    this.touch?.setCar(null);
    this.unlock();
  }

  private updateDrive(dt: number, inMenu: boolean): void {
    if (!inMenu && (this.input.consume('car') || this.input.consume('interact'))) {
      if (Math.abs(this.car.speed) < 4) { this.exitCar(); return; }
      this.ui.toast('האטי כדי לצאת מהרכב 🛑');
    }
    const obstacles = this.traffic.cars.map((t) => t.car.pos);
    for (const n of this.npcs) obstacles.push(n.pos);
    obstacles.push(...this.crowd.near(this.car.pos, 20));
    const hit = this.car.drive(dt, this.input, this.world.col, obstacles);
    if (hit) { this.audio.play('honk'); this.rig.addShake(0.4); }
    this.audio.setEngine(this.car.speed);
    this.player.chibi.update(dt, 0);
    this.player.chibi.expression = Math.abs(this.car.speed) > 12 ? 'wow' : 'happy';
  }

  // ---------------- phone / selfie / travel ----------------
  private togglePhone(): void {
    if (this.phone.isOpen) { this.phone.close(); return; }
    if (this.ui.modalOpen || this.mode === 'minigame' || this.mode === 'selfie') return;
    this.input.enabled = false;
    this.phone.show();
  }

  private fastTravel(id: string): void {
    const p = PLACES.find((x) => x.id === id);
    if (!p) return;
    if (this.track) this.endTrack();
    void this.ui.fade(`${p.emoji} ${p.name}`, () => {
      if (this.mode === 'drive') {
        this.car.pos.set(p.x + 3, 0, p.z + (id === 'beach' ? 0 : 4));
        this.exitCar();
      }
      this.player.place(p.x, p.z, id === 'home' ? Math.PI : 0);
      this.rig.snap(this.player.pos);
      this.state.addMinutes(15);
    }, 300);
  }

  private setOutfit(id: string): void {
    const o = OUTFITS.find((x) => x.id === id);
    if (!o || this.state.st.level < o.level) return;
    this.state.s.outfit = id;
    this.player.chibi.setOutfit(o.color);
    this.fx.burst(this.player.pos, [o.color, '#ffffff', '#ffd166'], 60);
    this.audio.play('success');
  }

  private startSelfie(): void {
    if (this.mode !== 'explore') return;
    this.mode = 'selfie';
    const p = this.player.pos;
    this.player.locked = true;
    this.player.speed = 0;
    this.player.chibi.pose = 'selfie';
    this.player.chibi.hold('phone');
    this.rig.mode = { kind: 'selfie', x: p.x, z: p.z, face: this.player.yaw };
    this.ui.setVisible(false);
    this.touch?.setVisible(false);
    const poses: [Pose, string][] = [['selfie', '🤳 סלפי'], ['flex', '💪 שריר'], ['wave', '👋 היי'], ['dance', '💃 ריקוד']];
    this.selfiePose = 0;
    const v = el('div', 'cam-view', '<div class="cam-frame"></div>');
    const ctl = el('div', 'cam-ui');
    const poseBtn = el('button', 'cam-pose', poses[0][1]);
    const shutter = el('button', 'shutter');
    const close = el('button', 'cam-pose', '✕ סגירה');
    poseBtn.addEventListener('click', () => {
      this.selfiePose = (this.selfiePose + 1) % poses.length;
      this.player.chibi.pose = poses[this.selfiePose][0];
      this.player.chibi.hold(poses[this.selfiePose][0] === 'selfie' ? 'phone' : null);
      poseBtn.textContent = poses[this.selfiePose][1];
      this.audio.play('click');
    });
    shutter.addEventListener('click', () => this.capture());
    close.addEventListener('click', () => this.endSelfie());
    ctl.append(close, shutter, poseBtn);
    v.append(ctl);
    this.host.append(v);
    this.selfieUi = v;
  }

  private endSelfie(): void {
    this.selfieUi?.remove();
    this.selfieUi = null;
    this.ui.setVisible(true);
    this.touch?.setVisible(true);
    this.unlock();
  }

  private capture(): void {
    this.audio.play('camera');
    this.render();
    const src = this.renderer.domElement;
    const shot = src.toDataURL('image/jpeg', 0.92);
    this.ui.flash();
    const img = new Image();
    img.onload = () => {
      const W = 1080, H = 1350;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f5ede3'; g.fillRect(0, 0, W, H);
      const ar = img.width / img.height, tar = W / (H - 170);
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ar > tar) { sw = img.height * tar; sx = (img.width - sw) / 2; } else { sh = img.width / tar; sy = (img.height - sh) / 2; }
      g.save(); g.beginPath(); g.roundRect(30, 30, W - 60, H - 200, 36); g.clip();
      g.drawImage(img, sx, sy, sw, sh, 30, 30, W - 60, H - 200);
      g.restore();
      const logo = new Image();
      logo.onload = () => {
        g.drawImage(logo, 50, H - 150, 110, 110);
        g.fillStyle = '#5a2f2d'; g.font = '600 64px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'left';
        g.fillText('Jas Fitness', 180, H - 88);
        g.font = '500 30px Rubik, sans-serif'; g.fillStyle = '#9a6a5a';
        g.fillText(`Day ${this.state.s.day} · ${this.state.bodyLabel().label}`, 182, H - 44);
        g.textAlign = 'right'; g.font = '800 44px Rubik, sans-serif'; g.fillStyle = '#c8973f';
        g.fillText('#JASFIT', W - 50, H - 70);
        this.showPhoto(c);
      };
      logo.src = logoUrl;
    };
    img.src = shot;
    this.state.progress('selfie', 1);
  }

  private showPhoto(c: HTMLCanvasElement): void {
    const url = c.toDataURL('image/jpeg', 0.9);
    this.ui.modal((box, close) => {
      box.innerHTML = `<h2>📸 איזה יופי!</h2><p class="subtitle">שתפי את הרגע עם העולם ✨</p><img class="photo-prev" src="${url}" alt="selfie">`;
      const a = el('div', 'actions');
      const share = el('button', 'btn primary', '📤 שיתוף');
      const dl = el('button', 'btn gold', '⬇️ שמירה');
      const x = el('button', 'btn', 'סגירה');
      share.addEventListener('click', async () => {
        try {
          const blob = await (await fetch(url)).blob();
          const file = new File([blob], 'jasfit-selfie.jpg', { type: 'image/jpeg' });
          const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
          if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: 'JAS FIT', text: 'יום בחיים של יסמין 💪 #JASFIT' });
          else dl.click();
        } catch { /* user cancelled */ }
      });
      dl.addEventListener('click', () => { const l = document.createElement('a'); l.href = url; l.download = 'jasfit-selfie.jpg'; l.click(); });
      x.addEventListener('click', close);
      a.append(share, dl, x);
      box.append(a);
    });
  }

  private updateSwim(dt: number): void {
    const sw = this.player.swimming && this.mode !== 'drive';
    if (sw && !this.wasSwimming) {
      this.audio.play('whoosh');
      this.fx.burst(this.player.pos.clone().setY(-0.6), ['#b8d8e8', '#7fb6d6'], 30, 1.2);
      this.ui.toast('🌊 יסמין שוחה! שחייה שורפת שומן ובונה סבולת · Shift / עד הקצה = קרול מהיר', 'good');
    }
    if (!sw && this.wasSwimming) this.fx.burst(this.player.pos.clone().setY(-0.6), ['#b8d8e8'], 14);
    this.wasSwimming = sw;
    if (!sw) return;
    this.splashT -= dt;
    if (this.splashT <= 0) {
      const moving = this.player.speed > 0.4;
      this.splashT = moving ? (this.player.speed > 2.5 ? 0.18 : 0.3) : 0.9;
      this.spectacle.ripple(this.player.pos.x, this.player.pos.z);
      if (moving) {
        this.fx.burst(this.player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.75, (Math.random() - 0.5) * 0.8)), ['#9fb8c8', '#7a99ad'], 5, 0.5);
        if (Math.random() < 0.3) this.audio.play('drink');
      }
    }
  }

  // ---------------- bubbles & hints ----------------
  private project(p: THREE.Vector3): { x: number; y: number; ok: boolean } {
    const v = p.clone().project(this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, ok: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }

  private updateBubbles(): void {
    const t = this.elapsed;
    const show = this.mode === 'explore' || this.mode === 'track' || this.mode === 'drive';
    for (const n of this.npcs) {
      let b = this.bubbleState.get(n.def.id);
      if (!b) { b = { text: '', until: 0, next: t + 2 + Math.random() * 6 }; this.bubbleState.set(n.def.id, b); }
      const d = n.pos.distanceTo(this.player.pos);
      if (t > b.next && d < 14) { b.text = n.def.bubbles[Math.floor(Math.random() * n.def.bubbles.length)]; b.until = t + 3.5; b.next = t + 9 + Math.random() * 8; }
      if (show && t < b.until && d < 18 && !n.talking) {
        n.chibi.headWorld(this.tmp); this.tmp.y += 0.75;
        const s = this.project(this.tmp);
        this.ui.bubble(n.def.id, n.def.name, s.ok ? b.text : null, s.x, s.y);
      } else this.ui.bubble(n.def.id, null, null);
    }
    // Yasmin's own thoughts when she needs something
    const st = this.state.st;
    if (t > this.thought.next) {
      this.thought.next = t + 14;
      const h = this.state.hour;
      const txt = st.hydration < 22 ? 'אני צמאה... 💧' : st.satiety < 18 ? 'אני רעבה 🍎' : st.energy < 18 ? 'אני מותשת 😴' : (h >= 22 || h < 5) ? 'מאוחר... למיטה 🌙' : this.state.fatN > 0.55 ? 'אוף, קשה לי לזוז 😮‍💨' : this.state.toneN > 0.7 ? 'מרגישה מדהים! 🔥' : '';
      if (txt) { this.thought.text = txt; this.thought.until = t + 3.5; }
    }
    if (show && t < this.thought.until && this.mode !== 'drive') {
      this.player.chibi.headWorld(this.tmp); this.tmp.y += 0.8;
      const s = this.project(this.tmp);
      this.ui.bubble('yasmin', null, s.ok ? this.thought.text : null, s.x, s.y);
    } else this.ui.bubble('yasmin', null, null);
  }

  private hints(): void {
    this.hintT -= 1;
    if (this.hintT > 0 || this.mode !== 'explore') return;
    this.hintT = 45;
    const st = this.state.st;
    if (st.energy < 12) this.ui.toast('⚡ האנרגיה כמעט נגמרה — אוכל, מים או שינה!', 'bad');
    else if (this.phone.unread() > 0) this.ui.toast(`💬 יש לך ${this.phone.unread()} הודעות חדשות בטלפון (Tab)`);
  }
}
