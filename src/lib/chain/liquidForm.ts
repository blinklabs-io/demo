import {
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  WebGLRenderer,
} from "three";
import { lightScene, tokenReader } from "./studio";

export type LiquidShape = "liquid" | "ring" | "knot" | "block" | "coin";

/**
 * A slow, glossy body of liquid: a solid whose surface is pushed around by a
 * few overlapping waves. It is polished metal, so its colour is whatever it
 * reflects: a dark room with one panel in each of the two CSS token colours.
 * It stops drawing while off screen, and holds still under reduced motion.
 */
export function createLiquidForm(
  canvas: HTMLCanvasElement,
  {
    reducedMotion,
    tokens,
    shape: kind = "liquid",
  }: { reducedMotion: boolean; tokens: [string, string]; shape?: LiquidShape },
) {
  const token = tokenReader(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  // A soft backdrop: it does not need retina sharpness.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = NeutralToneMapping;

  const scene = new Scene();
  const [first, second] = tokens.map(token);
  const environment = lightScene(renderer, scene, first, second, () => wake());
  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 6.4);

  const geometry =
    kind === "ring"
      ? new TorusGeometry(0.84, 0.3, 64, 140)
      : kind === "knot"
        ? new TorusKnotGeometry(0.72, 0.25, 200, 32, 2, 3)
        : new SphereGeometry(1.35, 80, 60);
  // The sphere is the base of three solids: itself, a rounded cube, a disc.
  if (kind === "block" || kind === "coin") {
    const at = geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      const x = at.getX(i), y = at.getY(i), z = at.getZ(i);
      if (kind === "coin") at.setXYZ(i, x * 0.9, y * 0.24, z * 0.9);
      else {
        const n = 6;
        const length = Math.hypot(x, y, z) || 1;
        const reach =
          1.05 /
          ((Math.abs(x / length) ** n + Math.abs(y / length) ** n + Math.abs(z / length) ** n) **
            (1 / n));
        at.setXYZ(i, (x / length) * reach, (y / length) * reach, (z / length) * reach);
      }
    }
  }
  // Tubes swell along their own normals, the sphere family from the centre.
  const tube = kind === "ring" || kind === "knot";
  const out = Float32Array.from(geometry.attributes.normal.array);
  const depth = tube ? 0.45 : kind === "liquid" ? 1 : kind === "block" ? 0.28 : 0.6;
  const pose = { liquid: 0, ring: 0.95, knot: 0.3, block: 0.5, coin: 0.85 }[kind];
  const material = new MeshPhysicalMaterial({
    color: 0xf2f5f5,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const body = new Mesh(geometry, material);
  scene.add(body);

  const position = geometry.attributes.position;
  const rest = Float32Array.from(position.array);
  function shape(time: number) {
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      const z = rest[i * 3 + 2];
      const swell =
        0.2 * Math.sin(2.1 * x + time) * Math.sin(1.7 * y + time * 1.3) +
        0.12 * Math.sin(3.3 * z + time * 0.8 + 1.6 * x) +
        0.07 * Math.sin(4.6 * y - time * 1.1 + 2.2 * z);
      if (tube) {
        const push = swell * depth;
        position.setXYZ(
          i,
          x + out[i * 3] * push,
          y + out[i * 3 + 1] * push,
          z + out[i * 3 + 2] * push,
        );
      } else {
        const scale = 1 + (swell * depth) / 1.35;
        position.setXYZ(i, x * scale, y * scale, z * scale);
      }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    body.rotation.x = pose;
    body.rotation.y = time * 0.12;
    body.rotation.z = Math.sin(time * 0.2) * 0.18;
    body.position.set(Math.sin(time * 0.31) * 0.1, Math.sin(time * 0.47) * 0.14, 0);
  }

  let frame = 0;
  let visible = true;
  let start = performance.now();
  // The motion is slow, so 30 frames a second is enough. The surface is
  // reshaped on the CPU each frame, which is the cost worth halving.
  let drawn = -Infinity;
  function draw(now: number) {
    if (now - drawn >= 30) {
      drawn = now;
      shape((now - start) / 1000 * 0.55 + 4);
      renderer.render(scene, camera);
    }
    frame = visible && !reducedMotion ? requestAnimationFrame(draw) : 0;
  }
  function wake() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wake();
  }
  const sizes = new ResizeObserver(resize);
  sizes.observe(canvas);
  const sight = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      start = performance.now() - 1;
      wake();
    }
  });
  sight.observe(canvas);
  resize();

  return {
    dispose() {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      sight.disconnect();
      geometry.dispose();
      material.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
