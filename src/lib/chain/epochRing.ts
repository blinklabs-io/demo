import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";

const COUNT = 48;
const RADIUS = 3;
const REST = 0.14;
const ELAPSED = 0.85;
const NOW = 1.5;

/**
 * An epoch as a ring of 48 posts. Posts for the elapsed share stand up in the
 * accent, the post at the present moment stands tallest, the rest lie low.
 */
export function createEpochRing(
  canvas: HTMLCanvasElement,
  { reducedMotion }: { reducedMotion: boolean },
) {
  // Tokens are OKLCH, which three's Color cannot parse: paint and read back.
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
  renderer.toneMapping = NeutralToneMapping;

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 5.2, 9);
  camera.lookAt(0, 0.35, 0);
  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-6, 7, 3);
  scene.add(key);

  const colors = {
    elapsed: token("--accent"),
    now: token("--text"),
    rest: token("--gray-7"),
  };
  const geometry = new BoxGeometry(0.5, 1, 0.2);
  const material = new MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 });
  const posts = new InstancedMesh(geometry, material, COUNT);
  const ring = new Group();
  ring.add(posts);
  scene.add(ring);

  const height = new Float32Array(COUNT).fill(reducedMotion ? REST : 0.001);
  const target = new Float32Array(COUNT).fill(REST);
  const delay = new Float32Array(COUNT);
  const dummy = new Object3D();
  const tilt = { x: 0, z: 0, toX: 0, toZ: 0 };
  let first = true;
  let frame = 0;
  let last = 0;

  function place() {
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.PI - (i / COUNT) * Math.PI * 2;
      dummy.position.set(
        Math.cos(angle) * RADIUS,
        height[i] / 2,
        -Math.sin(angle) * RADIUS,
      );
      dummy.rotation.y = angle;
      dummy.scale.set(1, height[i], 1);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
  }

  function resize() {
    const { clientWidth: width, clientHeight: tall } = canvas;
    if (!width || !tall) return;
    renderer.setSize(width, tall, false);
    const half = 3.7;
    const aspect = width / tall;
    // Fit the ring's width when the canvas is narrow, its depth when it is wide.
    const vertical = Math.max(half / aspect, 2.6);
    camera.left = -vertical * aspect;
    camera.right = vertical * aspect;
    camera.top = vertical;
    camera.bottom = -vertical;
    camera.updateProjectionMatrix();
  }

  function tick(time: number) {
    const step = Math.min(0.05, (time - last) / 1000);
    last = time;
    let moving = false;
    for (let i = 0; i < COUNT; i++) {
      if (delay[i] > 0) {
        delay[i] -= step;
        moving = true;
        continue;
      }
      const gap = target[i] - height[i];
      if (Math.abs(gap) > 0.002) {
        height[i] += reducedMotion ? gap : gap * Math.min(1, step * 9);
        moving = true;
      } else height[i] = target[i];
    }
    for (const axis of ["x", "z"] as const) {
      const to = axis === "x" ? tilt.toX : tilt.toZ;
      const gap = to - tilt[axis];
      if (Math.abs(gap) > 0.0005) {
        tilt[axis] += gap * Math.min(1, step * 7);
        moving = true;
      } else tilt[axis] = to;
    }
    ring.rotation.set(tilt.x, 0, tilt.z);
    place();
    renderer.render(scene, camera);
    frame = moving ? requestAnimationFrame(tick) : 0;
  }
  function wake() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  const onMove = (event: PointerEvent) => {
    if (reducedMotion) return;
    const box = canvas.getBoundingClientRect();
    tilt.toX = ((event.clientY - box.top) / box.height - 0.5) * 0.3;
    tilt.toZ = -((event.clientX - box.left) / box.width - 0.5) * 0.3;
    wake();
  };
  const onLeave = () => {
    tilt.toX = 0;
    tilt.toZ = 0;
    wake();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  const observer = new ResizeObserver(() => {
    resize();
    wake();
  });
  observer.observe(canvas);
  resize();

  return {
    /** Share of the epoch elapsed, 0 to 100. */
    setProgress(progress: number) {
      const filled = (Math.max(0, Math.min(100, progress)) / 100) * COUNT;
      const present = progress >= 100 ? -1 : Math.floor(filled);
      for (let i = 0; i < COUNT; i++) {
        const state = i === present ? "now" : i < filled ? "elapsed" : "rest";
        target[i] = state === "now" ? NOW : state === "elapsed" ? ELAPSED : REST;
        posts.setColorAt(i, colors[state]);
        // The first paint sweeps round the ring; later changes move at once.
        delay[i] = first && !reducedMotion ? i * 0.018 : 0;
      }
      if (posts.instanceColor) posts.instanceColor.needsUpdate = true;
      first = false;
      wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      geometry.dispose();
      material.dispose();
      posts.dispose();
      renderer.dispose();
    },
  };
}
