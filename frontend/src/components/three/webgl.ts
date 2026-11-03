import { useEffect, useState } from "react";

let cached: boolean | null = null;

/** True when the browser can create a WebGL context (false in tests, old devices or when disabled). */
export function canUseWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return (cached = false);
    if (/jsdom/i.test(navigator.userAgent)) return (cached = false);
    const c = document.createElement("canvas");
    cached = !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    cached = false;
  }
  return cached;
}

let tier: boolean | null = null;

/**
 * Whether this device should run the real-time 3D scene. Devices that would render WebGL in
 * software (no GPU: SwiftShader / llvmpipe / "Basic Render Driver"), have very little memory or
 * CPU, or ask to save data get the lightweight illustrated fallback instead.
 */
export function shouldRender3D(): boolean {
  if (tier !== null) return tier;
  if (!canUseWebGL()) return (tier = false);
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return (tier = false);
    if ((nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2) return (tier = false);
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return (tier = false);
  } catch {
    /* keep 3D when detection itself fails */
  }
  return (tier = true);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Becomes true once the browser is idle after the first paint, so heavy work (downloading and
 * initialising the 3D scene) never competes with the page's first render or first input.
 */
export function useIdleReady(timeout = 1200): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idle: number | undefined;
    const raf = requestAnimationFrame(() => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(() => setReady(true), { timeout });
      else idle = window.setTimeout(() => setReady(true), 200);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (idle !== undefined) (w.cancelIdleCallback ? w.cancelIdleCallback(idle) : clearTimeout(idle));
    };
  }, [timeout]);
  return ready;
}

/** False while the browser tab is hidden, so render loops can stop. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}
