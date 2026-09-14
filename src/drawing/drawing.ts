import { segmentDistance } from "../field/evaluate";
import type { FieldNode, Point } from "../field/types";
export type Tool = "select" | "pen" | "line" | "circle" | "box" | "eraser";
export type DrawingElement = {
  id: number;
  kind: "circle" | "box" | "line" | "polyline";
  points: Point[];
  thickness: number;
  erase?: boolean;
};
export type Scene = {
  base: FieldNode | null;
  pixels: ImageData | null;
  elements: DrawingElement[];
  source?: string;
  mode?: "solid" | "field";
  ms?: number;
};
export const emptyScene = (): Scene => ({
  base: null,
  pixels: null,
  elements: [],
});
/** Iterative Ramer–Douglas–Peucker: bounded stack even for long pen gestures. */
export function simplify(points: Point[], tolerance = 0.0015): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = -1,
      max = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(...points[i], ...points[start], ...points[end]);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const round = (n: number) => Number(n.toFixed(5));
export function elementToField(element: DrawingElement): FieldNode {
  const [a, b = a] = element.points;
  switch (element.kind) {
    case "circle":
      return {
        kind: "circle",
        values: [
          ...a,
          Math.max(0.0001, Math.hypot(b[0] - a[0], b[1] - a[1])),
        ].map(round),
      };
    case "box":
      return {
        kind: "box",
        values: [
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          Math.max(0.0001, Math.abs(a[0] - b[0])),
          Math.max(0.0001, Math.abs(a[1] - b[1])),
        ].map(round),
      };
    case "line":
      return {
        kind: "line",
        values: [...a, ...b, element.thickness].map(round),
      };
    case "polyline": {
      let points = simplify(element.points);
      let tolerance = 0.002;
      while (points.length > 900) {
        points = simplify(element.points, tolerance);
        tolerance *= 1.5;
      }
      if (points.length === 1) points = [points[0], points[0]];
      return {
        kind: "polyline",
        points: points.map((p) => p.map(round) as Point),
        thickness: element.thickness,
      };
    }
  }
}
/** Temporary drawing objects collapse to ONE composed scalar field. */
export function convertToField(scene: Scene): FieldNode {
  let result = scene.base;
  for (const element of scene.elements) {
    const field = elementToField(element);
    if (element.erase) {
      if (result) result = { kind: "subtract", children: [result, field] };
    } else if (!result) result = field;
    else if (result.kind === "union" && result.children.length < 64)
      result = { kind: "union", children: [...result.children, field] };
    else result = { kind: "union", children: [result, field] };
  }
  return (
    result ?? {
      kind: "field",
      expression: { type: "number", value: 1, pos: 0 },
    }
  );
}
export function bounds(
  element: DrawingElement,
): [number, number, number, number] {
  if (element.kind === "circle") {
    const [a, b = a] = element.points,
      r = Math.hypot(a[0] - b[0], a[1] - b[1]);
    return [a[0] - r, a[1] - r, 2 * r, 2 * r];
  }
  const xs = element.points.map((p) => p[0]),
    ys = element.points.map((p) => p[1]),
    pad = element.kind === "box" ? 0 : element.thickness / 2;
  return [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) - Math.min(...xs) + 2 * pad,
    Math.max(...ys) - Math.min(...ys) + 2 * pad,
  ];
}
