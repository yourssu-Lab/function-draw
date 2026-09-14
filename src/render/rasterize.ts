import { evaluate, compileField } from "../field/evaluate";
import type { FieldNode } from "../field/types";
export type RenderMode = "solid" | "field";
export async function rasterize(
  node: FieldNode,
  size = 512,
  mode: RenderMode = "solid",
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<{ pixels: Uint8ClampedArray; ms: number }> {
  if (signal?.aborted)
    throw new DOMException("Render cancelled.", "AbortError");
  compileField(node);
  const pixels = new Uint8ClampedArray(size * size * 4),
    start = performance.now();
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = (col + 0.5) / size,
        y = (row + 0.5) / size,
        d = evaluate(node, x, y);
      if (!Number.isFinite(d))
        throw new Error(
          `Field returned a non-finite value near (${x.toFixed(3)}, ${y.toFixed(3)}). Check division, powers and square roots.`,
        );
      let value: number;
      if (mode === "field") {
        const bands = Math.abs(Math.sin(d * 150));
        value =
          Math.abs(d) < 1 / size
            ? 0
            : Math.round(
                180 +
                  65 * Math.min(1, Math.abs(d) * 5) -
                  65 * Math.exp(-bands * 20),
              );
      } else value = Math.round(255 * Math.max(0, Math.min(1, 0.5 + d * size)));
      const i = (row * size + col) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
    if (row % 8 === 7) {
      if (signal?.aborted)
        throw new DOMException("Render cancelled.", "AbortError");
      if (performance.now() - start > 15000)
        throw new Error(
          "Render exceeded 15 seconds. Simplify the expression or use Draft resolution.",
        );
      onProgress?.((row + 1) / size);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  if (signal?.aborted)
    throw new DOMException("Render cancelled.", "AbortError");
  return { pixels, ms: performance.now() - start };
}
