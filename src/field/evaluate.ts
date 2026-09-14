import { compileEquation } from "./expressions";
import type { FieldNode, ScalarField } from "./types";
export function segmentDistance(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax,
    vy = by - ay,
    length = vx * vx + vy * vy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / length));
  return Math.hypot(x - ax - t * vx, y - ay - t * vy);
}
const cache = new WeakMap<FieldNode, ScalarField>();
export function compileField(node: FieldNode): ScalarField {
  const cached = cache.get(node);
  if (cached) return cached;
  let result: ScalarField;
  switch (node.kind) {
    case "circle": {
      const [cx, cy, r] = node.values;
      result = (x, y) => Math.hypot(x - cx, y - cy) - r;
      break;
    }
    case "box": {
      const [cx, cy, w, h] = node.values;
      result = (x, y) => {
        const qx = Math.abs(x - cx) - w / 2,
          qy = Math.abs(y - cy) - h / 2;
        return (
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0)
        );
      };
      break;
    }
    case "line": {
      const [ax, ay, bx, by, t] = node.values;
      result = (x, y) => segmentDistance(x, y, ax, ay, bx, by) - t / 2;
      break;
    }
    case "polyline": {
      const { points, thickness } = node;
      result = (x, y) => {
        let d = Infinity;
        for (let i = 1; i < points.length; i++)
          d = Math.min(
            d,
            segmentDistance(x, y, ...points[i - 1], ...points[i]),
          );
        return d - thickness / 2;
      };
      break;
    }
    case "field":
      result = compileEquation(node.expression, node.bindings);
      break;
    default: {
      const fs = node.children.map(compileField);
      switch (node.kind) {
        case "union":
          result = (x, y) => {
            let d = Infinity;
            for (const f of fs) d = Math.min(d, f(x, y));
            return d;
          };
          break;
        case "intersect":
          result = (x, y) => {
            let d = -Infinity;
            for (const f of fs) d = Math.max(d, f(x, y));
            return d;
          };
          break;
        case "subtract":
          result = (x, y) => Math.max(fs[0](x, y), -fs[1](x, y));
          break;
        case "translate": {
          const [dx, dy] = node.values;
          result = (x, y) => fs[0](x - dx, y - dy);
          break;
        }
        // Scale and rotation are about the origin. Translate to/from a pivot explicitly.
        case "scale": {
          const [s] = node.values;
          result = (x, y) => fs[0](x / s, y / s) * s;
          break;
        }
        case "rotate": {
          const c = Math.cos(node.values[0]),
            s = Math.sin(node.values[0]);
          result = (x, y) => fs[0](c * x + s * y, -s * x + c * y);
          break;
        }
        case "repeat": {
          const [sx, sy] = node.values;
          const wrap = (v: number, s: number) =>
            v - s * Math.floor((v + s / 2) / s);
          result = (x, y) =>
            fs[0](0.5 + wrap(x - 0.5, sx), 0.5 + wrap(y - 0.5, sy));
          break;
        }
        case "mirrorX":
          result = (x, y) => fs[0](0.5 + Math.abs(x - 0.5), y);
          break;
        case "mirrorY":
          result = (x, y) => fs[0](x, 0.5 + Math.abs(y - 0.5));
          break;
        case "smoothUnion": {
          const [k] = node.values;
          result = (x, y) => {
            const a = fs[0](x, y),
              b = fs[1](x, y),
              h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
            return b + (a - b) * h - k * h * (1 - h);
          };
          break;
        }
      }
    }
  }
  cache.set(node, result);
  return result;
}
/** The sole source of geometry for final rasterization. */
export function evaluate(node: FieldNode, x: number, y: number): number {
  return compileField(node)(x, y);
}
