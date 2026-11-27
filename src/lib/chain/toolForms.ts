import {
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { lightScene, tokenReader } from "./studio";

export type ToolFormKind =
  | "transactions"
  | "data"
  | "batch"
  | "utxos"
  | "proof"
  | "mint"
  | "drep"
  | "treasury"
  | "track"
  | "participate"
  | "markets"
  | "mempool"
  | "network"
  | "bridge"
  | "leios";

/**
 * One small lit object per creation tool, built from three finishes: polished
 * metal, dark lacquer and the section colour. A single renderer draws all of
 * them; each tile copies its picture onto its own 2D canvas.
 */
export function createToolForms(host: Element) {
  const token = tokenReader(host);
  const accent = token("--accent");
  const area = token("--area");
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = NeutralToneMapping;
  const scene = new Scene();
  const environment = lightScene(renderer, scene, accent, area);
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const camera = new PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(3.6, 2.7, 5.6);
  camera.lookAt(0, 0, 0);

  const metal = new MeshPhysicalMaterial({
    color: 0xf2f5f5,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const lacquer = new MeshPhysicalMaterial({
    color: 0x101917,
    metalness: 0.6,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const colour = new MeshPhysicalMaterial({
    color: area,
    metalness: 0.25,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const owned: BufferGeometry[] = [];
  const keep = <T extends BufferGeometry>(geometry: T) => {
    owned.push(geometry);
    return geometry;
  };
  const part = (geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(keep(geometry), material);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const box = (w: number, h: number, d: number, r = 0.1) =>
    new RoundedBoxGeometry(w, h, d, 4, r);
  const disc = (r: number, h: number) => new CylinderGeometry(r, r, h, 64);
  const up = new Vector3(0, 1, 0);
  const rod = (from: Vector3, to: Vector3) => {
    const mesh = part(new CylinderGeometry(0.03, 0.03, from.distanceTo(to), 12), lacquer);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    return mesh;
  };

  const builders: Record<ToolFormKind, () => Group> = {
    // Layers of one transaction: body, witnesses, the signed whole.
    transactions() {
      const group = new Group();
      group.add(
        part(box(2.2, 0.26, 2.2), lacquer, 0, -0.56, 0),
        part(box(2.2, 0.26, 2.2), metal, 0, 0, 0),
        part(box(2.2, 0.26, 2.2), colour, 0, 0.56, 0),
      );
      return group;
    },
    // A datum held between two braces.
    data() {
      const group = new Group();
      const left = part(new TorusGeometry(1.2, 0.08, 20, 64, Math.PI), metal, -0.35, 0, 0);
      left.rotation.z = Math.PI / 2;
      const right = part(new TorusGeometry(1.2, 0.08, 20, 64, Math.PI), metal, 0.35, 0, 0);
      right.rotation.z = -Math.PI / 2;
      const datum = part(box(0.95, 0.95, 0.95, 0.14), colour);
      datum.rotation.set(0.4, 0.6, 0);
      group.add(left, right, datum);
      return group;
    },
    // One payment fanning out to many recipients.
    batch() {
      const group = new Group();
      const source = new Vector3(-1.15, 0, 0);
      group.add(part(box(0.9, 0.9, 0.9, 0.14), colour, source.x, 0, 0));
      for (let i = 0; i < 5; i++) {
        const at = new Vector3(1.25 - Math.abs(i - 2) * 0.16, (i - 2) * 0.5, (i % 2) * 0.5 - 0.25);
        group.add(part(new SphereGeometry(0.2, 32, 24), metal, at.x, at.y, at.z), rod(source, at));
      }
      return group;
    },
    // Many small outputs around the one they merge into.
    utxos() {
      const group = new Group();
      const centre = new Vector3();
      group.add(part(box(1, 1, 1, 0.14), colour));
      for (const [x, y, z] of [
        [-1.4, 0.6, 0.3],
        [-1.4, -0.6, -0.3],
        [1.4, 0.6, -0.3],
        [1.4, -0.6, 0.3],
      ]) {
        const at = new Vector3(x, y, z);
        group.add(part(box(0.44, 0.44, 0.44, 0.08), metal, x, y, z), rod(centre, at));
      }
      return group;
    },
    // A document and the seal that timestamps it.
    proof() {
      const group = new Group();
      group.add(part(box(1.7, 0.14, 2.2, 0.06), lacquer, -0.15, -0.2, 0));
      for (let i = 0; i < 3; i++)
        group.add(part(box(1.1 - i * 0.25, 0.05, 0.1, 0.02), metal, -0.3 - i * 0.12, -0.11, -0.6 + i * 0.4));
      group.add(part(disc(0.46, 0.16), colour, 0.75, 0.05, 0.75));
      group.add(part(new TorusGeometry(0.46, 0.06, 16, 64), metal, 0.75, 0.05, 0.75));
      group.children[group.children.length - 1].rotation.x = Math.PI / 2;
      group.rotation.x = 0.3;
      group.scale.setScalar(1.2);
      return group;
    },
    // A stack of minted coins, one still on its edge.
    mint() {
      const group = new Group();
      [lacquer, metal, lacquer, colour].forEach((material, i) =>
        group.add(part(disc(0.85, 0.2), material, -0.3, -0.6 + i * 0.27, 0)),
      );
      const loose = part(disc(0.6, 0.16), metal, 1.2, -0.1, 0.2);
      loose.rotation.set(Math.PI / 2, 0, 0.35);
      group.add(loose);
      return group;
    },
    // A representative: one figure on a plinth.
    drep() {
      const group = new Group();
      group.add(
        part(disc(0.9, 0.16), lacquer, 0, -0.85, 0),
        part(new CylinderGeometry(0.26, 0.72, 1.1, 64), colour, 0, -0.2, 0),
        part(new SphereGeometry(0.5, 48, 32), metal, 0, 0.75, 0),
      );
      return group;
    },
    // The treasury: columns under a pediment.
    treasury() {
      const group = new Group();
      group.add(part(box(2.5, 0.2, 1.4, 0.06), lacquer, 0, -0.85, 0));
      for (const x of [-0.84, -0.28, 0.28, 0.84]) group.add(part(disc(0.16, 1.1), metal, x, -0.2, 0.3));
      group.add(part(box(2.5, 0.18, 1.4, 0.06), lacquer, 0, 0.44, 0));
      const roof = part(new CylinderGeometry(1.3, 1.3, 1.3, 3), colour, 0, 0.8, 0);
      roof.rotation.x = -Math.PI / 2;
      roof.scale.set(1, 1, 0.42);
      group.add(roof);
      return group;
    },
    // A transaction passing its checkpoints on the way into a block.
    track() {
      const group = new Group();
      const stops = [-1.5, -0.6, 0.3].map((x) => new Vector3(x, 0, 0));
      const end = new Vector3(1.35, 0, 0);
      stops.forEach((at, i) => {
        group.add(part(new SphereGeometry(0.2, 32, 24), metal, at.x, 0, 0), rod(at, stops[i + 1] ?? end));
      });
      const block = part(box(0.85, 0.85, 0.85, 0.12), colour, end.x, 0, 0);
      block.rotation.y = 0.5;
      group.add(block);
      // Turned to run across the picture instead of away from the camera.
      const frame = new Group();
      group.rotation.y = 0.75;
      group.position.x = 0.15;
      group.scale.setScalar(0.9);
      frame.add(group);
      return frame;
    },
    // A ballot dropping into its box.
    participate() {
      const group = new Group();
      group.add(
        part(box(1.7, 1.1, 1.3, 0.1), lacquer, 0, -0.45, 0),
        part(box(1.1, 0.04, 0.16, 0.02), metal, 0, 0.11, 0),
      );
      const ballot = part(box(0.95, 0.95, 0.08, 0.03), colour, 0, 0.55, 0);
      ballot.rotation.z = 0.12;
      group.add(ballot);
      return group;
    },
    // Two assets changing places.
    markets() {
      const group = new Group();
      const give = part(disc(0.7, 0.18), colour, -0.5, 0.15, 0.2);
      give.rotation.set(Math.PI / 2, 0, 0.3);
      const take = part(disc(0.7, 0.18), metal, 0.5, -0.15, -0.2);
      take.rotation.set(Math.PI / 2, 0, -0.3);
      const orbit = part(new TorusGeometry(1.35, 0.05, 16, 96), lacquer);
      orbit.rotation.x = Math.PI / 2.3;
      group.add(give, take, orbit);
      return group;
    },
    // Pending transactions waiting above the tray that will take them.
    mempool() {
      const group = new Group();
      group.add(part(box(2.4, 0.16, 1.7, 0.06), lacquer, 0, -0.8, 0));
      const lifts = [0.1, 0.55, 0.25, 0.7, 0.15, 0.45];
      lifts.forEach((lift, i) => {
        const x = ((i % 3) - 1) * 0.72;
        const z = (Math.floor(i / 3) - 0.5) * 0.72;
        group.add(part(box(0.46, 0.46, 0.46, 0.08), i === 3 ? colour : metal, x, -0.45 + lift, z));
      });
      return group;
    },
    // Peers around the node they connect to.
    network() {
      const group = new Group();
      const centre = new Vector3();
      group.add(part(new SphereGeometry(0.5, 48, 32), colour));
      for (const [x, y, z] of [
        [-1.4, 0.5, 0.2],
        [-0.9, -0.8, -0.4],
        [1.3, 0.7, -0.3],
        [1.2, -0.6, 0.5],
        [0.1, 1.05, 0.5],
      ]) {
        const at = new Vector3(x, y, z);
        group.add(part(new SphereGeometry(0.2, 32, 24), metal, x, y, z), rod(centre, at));
      }
      return group;
    },
    // Two chains joined by an arch, with a token crossing.
    bridge() {
      const group = new Group();
      group.add(
        part(box(0.8, 0.9, 0.8, 0.1), lacquer, -1.2, -0.55, 0),
        part(box(0.8, 0.9, 0.8, 0.1), lacquer, 1.2, -0.55, 0),
        part(new TorusGeometry(1.2, 0.08, 20, 64, Math.PI), metal, 0, -0.1, 0),
        part(new SphereGeometry(0.28, 32, 24), colour, 0.55, 0.97, 0),
      );
      return group;
    },
    // Leios: many input blocks under the one ranking block that orders them.
    leios() {
      const group = new Group();
      for (let i = 0; i < 6; i++) {
        const x = ((i % 3) - 1) * 0.78;
        group.add(part(box(0.66, 0.18, 1.5, 0.05), i % 2 ? metal : lacquer, x, -0.7 + Math.floor(i / 3) * 0.3, 0));
      }
      group.add(part(box(2.4, 0.24, 1.7, 0.08), colour, 0, 0.35, 0));
      return group;
    },
  };
  const built = new Map<ToolFormKind, Group>();

  return {
    /** Renders one object and copies it onto `target`, turned by `turn` radians. */
    draw(kind: ToolFormKind, target: HTMLCanvasElement, turn: number) {
      // A card may carry its own hue; otherwise the section colour is used.
      const own = getComputedStyle(target).getPropertyValue("--art").trim();
      colour.color.copy(own ? tokenReader(target)("--art") : area);
      const ratio = Math.min(window.devicePixelRatio, 2);
      const width = Math.round(target.clientWidth * ratio);
      const height = Math.round(target.clientHeight * ratio);
      if (!width || !height) return;
      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
      }
      let group = built.get(kind);
      if (!group) built.set(kind, (group = builders[kind]()));
      group.rotation.y = -0.35 + turn;
      scene.add(group);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      scene.remove(group);
      const context = target.getContext("2d")!;
      context.clearRect(0, 0, width, height);
      context.drawImage(canvas, 0, 0);
    },
    dispose() {
      for (const item of [...owned, metal, lacquer, colour, environment]) item.dispose();
      renderer.dispose();
    },
  };
}
