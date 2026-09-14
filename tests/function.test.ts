import { describe, expect, it } from "vitest";
import { parse } from "../src/field/parser";
import { evaluate } from "../src/field/evaluate";
import { serialize } from "../src/field/serializer";
import { toEquation } from "../src/field/equation";
import { rasterize } from "../src/render/rasterize";
import { convertToField } from "../src/drawing/drawing";

describe("single-variable function graphs", () => {
  it.each([
    ["f(x) = x", 0.25, 0.25],
    ["f ( x ) = x^2; // parabola", 0.5, 0.25],
    ["f(x) = .5", 0.2, 0.5],
    ["a=.2; b=a*sin(2*PI*x); f(x)=.5+b", 0.25, 0.7],
  ] as const)("draws the curve for %s", (source, x, y) => {
    const node = parse(source);
    for (const field of [node, parse(serialize(node)), parse(toEquation(node))]) {
      expect(evaluate(field, x, y)).toBeCloseTo(-0.006);
      expect(evaluate(field, x, y + 0.1)).toBeGreaterThan(0);
      expect(evaluate(field, x, y - 0.1)).toBeGreaterThan(0);
    }
  });

  it("renders a diagonal line with white pixels on both sides", async () => {
    const { pixels } = await rasterize(parse("f(x) = x"), 128);
    const pixel = (x: number, y: number) => pixels[(y * 128 + x) * 4];
    for (const p of [16, 64, 112]) expect(pixel(p, p)).toBe(0);
    expect(pixel(16, 112)).toBe(255);
    expect(pixel(112, 16)).toBe(255);
  });

  it("composes a plotted curve with new drawing strokes", () => {
    const node = convertToField({
      base: parse("f(x)=x^2"), pixels: null,
      elements: [{ id: 1, kind: "circle", points: [[0.2, 0.8], [0.3, 0.8]], thickness: 0.012 }],
    });
    const expanded = parse(toEquation(node));
    expect(evaluate(expanded, 0.5, 0.25)).toBeLessThan(0);
    expect(evaluate(expanded, 0.2, 0.8)).toBeLessThan(0);
    expect(evaluate(expanded, 0.8, 0.2)).toBeGreaterThan(0);
  });

  it.each(["f(x)=y", "a=y; f(x)=a", "a=sin(y); f(x)=x"])(
    "rejects undeclared y in %s", (source) => {
      expect(() => parse(source)).toThrow(/cannot depend on y/);
    },
  );

  it.each(["f()=1", "f(y)=y", "f(x,x)=x", "f(x)=", "f(x)=z", "a=a; f(x)=a"])(
    "rejects invalid function %s", (source) => {
      expect(() => parse(source)).toThrow();
    },
  );

  it("continues to interpret f(x, y) as a scalar field", () => {
    expect(evaluate(parse("f(x,y)=x"), 0.25, 0.75)).toBe(0.25);
  });
});
