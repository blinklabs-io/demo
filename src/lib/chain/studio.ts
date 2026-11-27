import {
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  type WebGLRenderer,
} from "three";

/** Design tokens are OKLCH, which three's Color cannot parse: paint and read back. */
export function tokenReader(element: Element) {
  const probe = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  })!;
  const css = getComputedStyle(element);
  return (name: string) => {
    probe.fillStyle = css.getPropertyValue(name).trim();
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  };
}

/**
 * What polished objects reflect: a dark room with one glowing panel in each
 * of two colours, a white strip overhead and a dim wall behind.
 */
export function studioEnvironment(renderer: WebGLRenderer, first: Color, second: Color) {
  const pmrem = new PMREMGenerator(renderer);
  const room = new Scene();
  room.background = new Color(0x030606);
  const box = new BoxGeometry();
  const panels = (
    [
      [first, 5, [-6, 2.5, 2], [0.4, 9, 9]],
      [second, 7, [6, -2, 1.5], [0.4, 6, 8]],
      [new Color(0xffffff), 9, [1, 7, 1], [5, 0.3, 4]],
      [first, 2, [0, -1, -7], [10, 5, 0.4]],
    ] as const
  ).map(([color, power, at, size]) => {
    const panel = new Mesh(
      box,
      new MeshBasicMaterial({ color: color.clone().multiplyScalar(power) }),
    );
    panel.position.fromArray(at);
    panel.scale.fromArray(size);
    room.add(panel);
    return panel;
  });
  const texture = pmrem.fromScene(room, 0.03).texture;
  box.dispose();
  panels.forEach((panel) => panel.material.dispose());
  pmrem.dispose();
  return texture;
}

/**
 * Lights a scene with the studio room. A browser can drop a WebGL context and
 * hand it back empty, so the room is rendered again when that happens.
 */
export function lightScene(
  renderer: WebGLRenderer,
  scene: Scene,
  first: Color,
  second: Color,
  redraw?: () => void,
) {
  const canvas = renderer.domElement;
  let texture = (scene.environment = studioEnvironment(renderer, first, second));
  const restore = () => {
    texture.dispose();
    texture = scene.environment = studioEnvironment(renderer, first, second);
    redraw?.();
  };
  canvas.addEventListener("webglcontextrestored", restore);
  return {
    dispose() {
      canvas.removeEventListener("webglcontextrestored", restore);
      texture.dispose();
    },
  };
}
