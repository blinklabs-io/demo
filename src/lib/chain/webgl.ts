let supported: boolean | undefined;

/**
 * True only when a WebGL context can actually be created. The API can exist
 * while the context cannot (GPU blocklist, WebGL switched off), and three.js
 * throws in that case, so every scene checks this before it builds.
 */
export function canUseWebGL() {
  if (supported === undefined) {
    supported = false;
    if (typeof window !== "undefined" && "WebGLRenderingContext" in window) {
      try {
        const probe = document.createElement("canvas");
        const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
        supported = Boolean(context);
        context?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        supported = false;
      }
    }
  }
  return supported;
}

/** For tests. */
export function resetWebGLProbe() {
  supported = undefined;
}
