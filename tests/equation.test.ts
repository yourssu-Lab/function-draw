import { describe, it, expect } from "vitest";
import { parse } from "../src/field/parser";
import { toEquation } from "../src/field/equation";
import { evaluate } from "../src/field/evaluate";
import { serialize } from "../src/field/serializer";
import { convertToField } from "../src/drawing/drawing";
import { rasterize } from "../src/render/rasterize";
import { examples } from "../src/examples";
import type { FieldNode, Point } from "../src/field/types";

const cases = [
  "circle(.5,.5,.2)",
  "circle(-.5,.2,.1)",
  "box(.5,.5,.4,.2)",
  "line(.1,.2,.8,.9,.02)",
  "line(.4,.5,.4,.5,.04)",
  "polyline(points([.1,.2],[.4,.6],[.4,.6],[.9,.8]),.02)",
  "union(circle(.4,.5,.2),box(.6,.5,.3,.3))",
  "intersect(circle(.4,.5,.2),box(.6,.5,.3,.3))",
  "subtract(circle(.5,.5,.3),circle(.6,.5,.2))",
  "translate(.15,-.2,circle(.4,.6,.2))",
  "rotate(-PI/3,box(.3,.2,.1,.3))",
  "scale(2,circle(.2,.2,.1))",
  "repeat(.2,.25,circle(.5,.5,.04))",
  "mirrorX(circle(.7,.5,.2))",
  "mirrorY(circle(.5,.7,.2))",
  "smoothUnion(circle(.4,.5,.2),box(.6,.5,.2,.2),.1)",
  "translate(.5,.5,rotate(PI/4,scale(.7,box(0,0,.3,.5))))",
  "repeat(.25,.25,translate(.5,.5,rotate(PI/5,box(0,0,.1,.03))))",
  "field(abs(sin(x*20)*cos(y*20))-.3)",
  "field(-2^2 + 2^-2 + (x^2)^3 - x^(2^3))",
  "r = .2; dx = x - .5; dy = y - .5; f(x,y) = sqrt(dx^2 + dy^2) - r",
  "f(x) = x",
  "a = .2; b = a * sin(2 * PI * x); f(x) = .5 + b",
];
describe("every field lowers to mathematical equations", () => {
  it.each(cases)("preserves scalar values: %s", (code) => {
    const node = parse(code),
      equation = toEquation(node),
      expanded = parse(equation);
    expect(equation).toContain("f(x, y) =");
    expect(equation).not.toMatch(
      /\b(circle|box|line|polyline|points|union|intersect|subtract|translate|rotate|scale|repeat|mirrorX|mirrorY|smoothUnion|field)\s*\(/,
    );
    for (let i = 0; i < 150; i++) {
      const x = ((i * 37) % 157) / 157,
        y = ((i * 61) % 163) / 163;
      expect(evaluate(expanded, x, y)).toBeCloseTo(evaluate(node, x, y), 11);
    }
  });
  it("all examples are equations without geometry calls", () => {
    for (const example of examples) {
      expect(example.code).toMatch(/f\(x(?:, y)?\) =/);
      expect(parse(example.code).kind).toBe("field");
    }
  });
  it("serializes intermediate definitions without losing their scope", () => {
    const node = parse("r=.2; dx=x-.5; f(x,y)=sqrt(dx^2+(y-.5)^2)-r");
    const rebuilt = parse(serialize(node));
    expect(evaluate(rebuilt, 0.5, 0.5)).toBe(-0.2);
    expect(evaluate(rebuilt, 0.7, 0.5)).toBeCloseTo(0);
  });
  it("substitutes coordinates and alpha-renames local variables when composing equations", () => {
    const raw = parse("qx=x-.5; qy=y-.5; f(x,y)=sqrt(qx^2+qy^2)-.15");
    const node: FieldNode = {
      kind: "union",
      children: [
        { kind: "translate", values: [0.2, 0], children: [raw] },
        { kind: "scale", values: [0.5], children: [raw] },
      ],
    };
    const expanded = parse(toEquation(node));
    const serialized = parse(serialize(node));
    for (const p of [
      [0.7, 0.5],
      [0.25, 0.25],
      [0.3, 0.7],
    ] as Point[])
      {
        expect(evaluate(expanded, ...p)).toBeCloseTo(evaluate(node, ...p), 12);
        expect(evaluate(serialized, ...p)).toBeCloseTo(evaluate(node, ...p), 12);
      }
  });
  it("new strokes compose with an already-rendered equation", () => {
    const base = parse(
      "qx=abs(x-.5)-.2; qy=abs(y-.5)-.1; f(x,y)=sqrt(max(qx,0)^2+max(qy,0)^2)+min(max(qx,qy),0)",
    );
    const node = convertToField({
      base,
      pixels: null,
      elements: [
        {
          id: 1,
          kind: "circle",
          points: [
            [0.2, 0.2],
            [0.3, 0.2],
          ],
          thickness: 0.01,
        },
      ],
    });
    const expanded = parse(toEquation(node));
    for (let i = 0; i < 20; i++)
      expect(evaluate(expanded, i / 20, 0.2)).toBeCloseTo(
        evaluate(node, i / 20, 0.2),
      );
  });
  it("keeps long freehand equations linear in size and samples them", async () => {
    const points: Point[] = Array.from({ length: 900 }, (_, i) => [
      i / 899,
      0.5 + 0.2 * Math.sin(i * 0.07),
    ]);
    const node: FieldNode = { kind: "polyline", points, thickness: 0.01 };
    const source = toEquation(node),
      expanded = parse(source);
    expect(source.length).toBeLessThan(1000000);
    expect(evaluate(expanded, 0.4, 0.5)).toBeCloseTo(
      evaluate(node, 0.4, 0.5),
      12,
    );
    const { pixels } = await rasterize(expanded, 16);
    expect(pixels).toHaveLength(1024);
  });
  it("matches rendered pixels for the default crescent", async () => {
    const node = parse("subtract(circle(.5,.5,.28),circle(.58,.45,.2))");
    const a = await rasterize(node, 64),
      b = await rasterize(parse(toEquation(node)), 64);
    expect(b.pixels).toEqual(a.pixels);
  });
});
describe("equation grammar stays mathematical and safe", () => {
  it.each([
    "a=a+1; f(x,y)=a",
    "a=b; b=1; f(x,y)=a",
    "a=1; a=2; f(x,y)=a",
    "x=1; f(x,y)=x",
    "sin=1; f(x,y)=sin",
    "PI=1; f(x,y)=PI",
    "f(y,x)=x",
    "f(x,y)=window.location",
    "f(x,y)=eval(1)",
    "a=1; f(x,y)=a; alert(1)",
    "a=1 f(x,y)=a",
    "f(x,y)=circle(.5,.5,.2)",
    "f(x,y)=(x=1)",
    "a=1; f(x,y)=a.constructor",
  ])("rejects invalid definitions and code: %s", (code) =>
    expect(() => parse(code)).toThrow(),
  );
  it("resets intermediate values for every sampled coordinate", () => {
    const field = parse("a=x+y; b=a^2; f(x,y)=b-a");
    expect(evaluate(field, 1, 2)).toBe(6);
    expect(evaluate(field, 0, 0)).toBe(0);
    expect(evaluate(field, 1, 2)).toBe(6);
  });
  it("rejects non-finite intermediate values", async () => {
    await expect(rasterize(parse("a=1/0; f(x,y)=1"), 16)).rejects.toThrow(
      /non-finite/,
    );
  });
});
