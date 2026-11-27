import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { lightScene } from "./studio";

export interface ChainBlock {
  hash: string;
  height: number;
  size: number;
  tx_count: number;
}

interface Options {
  reducedMotion: boolean;
  /** Positioned every frame above the largest block; hidden when there is none. */
  callout: HTMLElement;
  onHover: (block: ChainBlock | null, x: number, y: number) => void;
  onSelect: (block: ChainBlock) => void;
}

const SPACING = 1.4;
const EMPTY_HEIGHT = 0.2;
const FULL_HEIGHT = EMPTY_HEIGHT + 2;
const MAX_LAYERS = 10;
const GAP = 0.04;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

interface Entry {
  block: ChainBlock;
  group: Group;
  hit: Mesh;
  slot: number;
  rise: number;
  delay: number;
  lift: number;
  leaving: boolean;
}

/**
 * Recent blocks as a row of slabs. Height encodes serialized size relative to
 * the largest loaded block; each slab is cut into one layer per transaction.
 */
export function createChainScene(canvas: HTMLCanvasElement, options: Options) {
  // Tokens are OKLCH, which three's Color cannot parse: let the browser
  // resolve each one to sRGB by painting it.
  const probe = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  })!;
  const css = getComputedStyle(canvas);
  const token = (name: string) => {
    probe.fillStyle = css.getPropertyValue(name).trim();
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  };
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  // Neutral tone mapping keeps the brand teal the colour the tokens say it is.
  renderer.toneMapping = NeutralToneMapping;

  const scene = new Scene();
  const accent = token("--accent");
  // The same studio the other 3D objects on the site reflect.
  const environment = lightScene(renderer, scene, accent, token("--area-explore"), () => {
    if (!raf) raf = requestAnimationFrame(tick);
  });
  // Orthographic, so equal block sizes read as equal wherever they sit in the
  // row. The row recedes from the newest block, front right, to the oldest.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(10, 8.2, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-2, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.radius = 5;
  scene.add(key);
  // The tip lights its own surroundings.
  const glow = new PointLight(accent, 4, 5, 1.6);
  glow.position.set(0.3, 1.2, 1);

  const row = new Group();
  row.add(glow);
  scene.add(row);

  const ground = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.5 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Polished finishes: dark lacquer for quiet blocks, the accent for busy ones.
  const gloss = { clearcoat: 1, clearcoatRoughness: 0.08 };
  const lacquer = new Color(0x1b2624);
  const body = new MeshPhysicalMaterial({
    color: lacquer,
    roughness: 0.3,
    metalness: 0.7,
    ...gloss,
  });
  // Blocks holding more transactions sit closer to the accent.
  const shades = [0.16, 0.34, 0.52].map(
    (amount) =>
      new MeshPhysicalMaterial({
        color: lacquer.clone().lerp(accent, amount + 0.1),
        roughness: 0.28,
        metalness: 0.55,
        ...gloss,
      }),
  );
  const tip = new MeshPhysicalMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.12,
    roughness: 0.25,
    metalness: 0.25,
    ...gloss,
  });
  const invisible = new MeshBasicMaterial({ visible: false });
  const unit = new RoundedBoxGeometry(1, 1, 1, 3, 0.07);
  const hitBox = new BoxGeometry(1, 1, 1);

  const rail = new Mesh(
    new BoxGeometry(1, 0.02, 0.1),
    new MeshBasicMaterial({ color: token("--line-strong") }),
  );
  rail.position.y = 0.01;
  row.add(rail);

  let entries: Entry[] = [];
  let hovered: Entry | null = null;
  let biggest: Entry | null = null;
  const anchor = new Vector3();
  let count = 0;

  function build(block: ChainBlock, largest: number): Group {
    const group = new Group();
    const layers = Math.min(MAX_LAYERS, block.tx_count);
    const height =
      EMPTY_HEIGHT + (FULL_HEIGHT - EMPTY_HEIGHT) * Math.sqrt(block.size / largest);
    if (layers === 0) {
      const plate = new Mesh(unit, body);
      plate.scale.set(1, EMPTY_HEIGHT, 1);
      plate.position.y = EMPTY_HEIGHT / 2;
      plate.userData.y = plate.position.y;
      group.add(plate);
    }
    const layerHeight = (height - GAP * (layers - 1)) / Math.max(1, layers);
    for (let i = 0; i < layers; i++) {
      const layer = new Mesh(unit, body);
      layer.scale.set(1, layerHeight, 1);
      layer.position.y = i * (layerHeight + GAP) + layerHeight / 2;
      // Scrolling pulls the layers apart; this is where each one rests.
      layer.userData.y = layer.position.y;
      layer.userData.index = i;
      group.add(layer);
    }
    group.userData.height = layers === 0 ? EMPTY_HEIGHT : height;
    for (const child of group.children) child.castShadow = true;
    return group;
  }

  function setBlocks(blocks: ChainBlock[]) {
    const largest = Math.max(1, ...blocks.map((block) => block.size));
    const first = entries.length === 0;
    const next: Entry[] = [];
    blocks.forEach((block, slot) => {
      const existing = entries.find((entry) => entry.block.hash === block.hash);
      if (existing) {
        existing.slot = slot;
        next.push(existing);
        return;
      }
      const group = build(block, largest);
      const height = group.userData.height as number;
      const hit = new Mesh(hitBox, invisible);
      hit.scale.set(1.2, Math.max(0.6, height), 1.2);
      hit.position.y = Math.max(0.6, height) / 2;
      group.add(hit);
      group.position.x = -slot * SPACING;
      group.scale.y = options.reducedMotion ? 1 : 0.001;
      row.add(group);
      next.push({
        block,
        group,
        hit,
        slot,
        rise: options.reducedMotion ? 1 : 0,
        // First paint builds the chain toward the tip; later blocks arrive
        // after the row has made room.
        delay: first ? (blocks.length - 1 - slot) * 0.05 : 0.3,
        lift: 0,
        leaving: false,
      });
    });
    for (const entry of entries)
      if (!next.includes(entry)) {
        entry.leaving = true;
        entry.slot = blocks.length;
        next.push(entry);
      }
    entries = next;
    count = blocks.length;
    // An empty block is not worth pointing at.
    biggest = entries
      .filter((entry) => !entry.leaving && entry.block.tx_count > 0)
      .reduce<Entry | null>(
        (top, entry) => (!top || entry.block.size > top.block.size ? entry : top),
        null,
      );
    const busiest = Math.max(1, ...entries.map((entry) => entry.block.tx_count));
    for (const entry of entries) {
      const newest = entry.slot === 0 && !entry.leaving;
      const level = Math.ceil((3 * entry.block.tx_count) / busiest);
      const shade = level > 0 ? shades[level - 1] : body;
      entry.group.traverse((child) => {
        if (child instanceof Mesh && child !== entry.hit)
          child.material = newest ? tip : shade;
      });
    }
    frame();
  }

  const corner = new Vector3();
  function frame() {
    const length = Math.max(1, count - 1) * SPACING;
    rail.scale.x = length + 1;
    rail.position.x = -length / 2;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    // Fit the frustum to the row as if every block were full height, so the
    // framing does not jump when a large block arrives.
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    for (const x of [0.6, -length - 0.6])
      for (const y of [0, FULL_HEIGHT])
        for (const z of [-0.6, 0.6]) {
          corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          left = Math.min(left, corner.x);
          right = Math.max(right, corner.x);
          bottom = Math.min(bottom, corner.y);
          top = Math.max(top, corner.y);
        }
    // Headroom for the callout, a margin everywhere else.
    top += (top - bottom) * 0.22;
    const aspect = width / height;
    const half = Math.max((right - left) / (2 * aspect), (top - bottom) / 2) * 1.08;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    camera.left = cx - half * aspect;
    camera.right = cx + half * aspect;
    camera.top = cy + half;
    camera.bottom = cy - half;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    wake();
  }

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  function pick(event: PointerEvent): Entry | null {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(
      entries.filter((entry) => !entry.leaving).map((entry) => entry.hit),
    )[0];
    return hit ? (entries.find((entry) => entry.hit === hit.object) ?? null) : null;
  }
  function onMove(event: PointerEvent) {
    hovered = pick(event);
    wake();
    canvas.style.cursor = hovered ? "pointer" : "";
    const rect = canvas.getBoundingClientRect();
    options.onHover(
      hovered?.block ?? null,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }
  function onLeave() {
    hovered = null;
    wake();
    canvas.style.cursor = "";
    options.onHover(null, 0, 0);
  }
  function onClick(event: PointerEvent) {
    const entry = pick(event);
    if (entry) options.onSelect(entry.block);
  }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick as EventListener);

  // Render only while something is moving: no idle loop, nothing to pause.
  let raf = 0;
  let last = 0;
  // How far the reader has scrolled past the hero, 0 to 1. The chain turns
  // toward them and each block opens into its transactions.
  let progress = 0;
  let opened = 0;
  function setProgress(value: number) {
    if (options.reducedMotion) return;
    progress = Math.min(1, Math.max(0, value));
    wake();
  }
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const follow = options.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    opened += (progress - opened) * follow;
    if (Math.abs(progress - opened) > 0.001) moving = true;
    else opened = progress;
    // Turns about the newest block, which sits at the row's origin, so the
    // tip stays put while the older blocks swing toward the reader.
    row.rotation.y = -opened * 0.22;
    glow.intensity = 4 + opened * 6;
    for (const entry of entries) {
      const { group } = entry;
      const target = -entry.slot * SPACING;
      group.position.x += (target - group.position.x) * follow;
      if (Math.abs(target - group.position.x) > 0.001) moving = true;
      else group.position.x = target;
      if (entry.leaving) entry.rise = Math.max(0, entry.rise - dt * 3);
      else if (entry.delay > 0) entry.delay -= dt;
      else entry.rise = Math.min(1, entry.rise + dt / 0.7);
      if (entry.leaving || entry.rise < 1) moving = true;
      group.scale.y = Math.max(0.001, easeOut(entry.rise));
      const lift = entry === hovered ? 0.16 : 0;
      entry.lift += (lift - entry.lift) * Math.min(1, follow * 1.6);
      if (Math.abs(lift - entry.lift) > 0.001) moving = true;
      else entry.lift = lift;
      group.position.y = entry.lift;
      for (const child of group.children)
        if (child !== entry.hit && typeof child.userData.index === "number")
          child.position.y =
            (child.userData.y as number) + child.userData.index * opened * 0.2;
    }
    const gone = entries.filter((entry) => entry.leaving && entry.rise === 0);
    for (const entry of gone) row.remove(entry.group);
    if (gone.length) entries = entries.filter((entry) => !gone.includes(entry));
    renderer.render(scene, camera);
    if (biggest) {
      const { group } = biggest;
      anchor.set(0, (group.userData.height as number) * group.scale.y, 0);
      group.localToWorld(anchor).project(camera);
      const x = ((anchor.x + 1) / 2) * canvas.clientWidth;
      const y = ((1 - anchor.y) / 2) * canvas.clientHeight;
      options.callout.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      options.callout.style.opacity = String(easeOut(biggest.rise));
    } else options.callout.style.opacity = "0";
    raf = moving ? requestAnimationFrame(tick) : 0;
  }

  const resize = new ResizeObserver(frame);
  resize.observe(canvas);

  return {
    setBlocks,
    setProgress,
    dispose() {
      cancelAnimationFrame(raf);
      resize.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick as EventListener);
      for (const item of [
        unit,
        hitBox,
        rail.geometry,
        ground.geometry,
        body,
        ...shades,
        tip,
        invisible,
        rail.material as MeshBasicMaterial,
        ground.material,
        environment,
      ])
        item.dispose();
      renderer.dispose();
    },
  };
}
