import { describe, it, expect } from "vitest";
import { parse } from "../src/field/parser";
import { evaluate, segmentDistance } from "../src/field/evaluate";
import { serialize } from "../src/field/serializer";
import { simplify, convertToField, emptyScene } from "../src/drawing/drawing";
import { rasterize } from "../src/render/rasterize";
import { examples } from "../src/examples";
import { describeError, type Point } from "../src/field/types";
const sample = (code: string, x: number, y: number) =>
  evaluate(parse(code), x, y);
describe("actual signed distance geometry", () => {
  it("circle: inside, boundary, outside", () => {
    expect(sample("circle(.5,.5,.2)", 0.5, 0.5)).toBeCloseTo(-0.2);
    expect(sample("circle(.5,.5,.2)", 0.7, 0.5)).toBeCloseTo(0);
    expect(sample("circle(.5,.5,.2)", 0.9, 0.5)).toBeCloseTo(0.2);
  });
  it("box: center, side, corner distance", () => {
    expect(sample("box(.5,.5,.4,.2)", 0.5, 0.5)).toBeCloseTo(-0.1);
    expect(sample("box(.5,.5,.4,.2)", 0.7, 0.5)).toBeCloseTo(0);
    expect(sample("box(.5,.5,.4,.2)", 0.8, 0.7)).toBeCloseTo(Math.sqrt(0.02));
  });
  it("segment: clamped projection and degenerate endpoints", () => {
    expect(segmentDistance(0.5, 0.2, 0, 0, 1, 0)).toBeCloseTo(0.2);
    expect(segmentDistance(2, 0, 0, 0, 1, 0)).toBe(1);
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });
  it("line subtracts half thickness and has round ends", () => {
    expect(sample("line(.2,.5,.8,.5,.1)", 0.5, 0.5)).toBeCloseTo(-0.05);
    expect(sample("line(.2,.5,.8,.5,.1)", 0.85, 0.5)).toBeCloseTo(0);
  });
  it("polyline takes the minimum segment distance", () => {
    const code = "polyline(points([.1,.1],[.5,.1],[.5,.8]),.02)";
    expect(sample(code, 0.5, 0.4)).toBeCloseTo(-0.01);
    expect(sample(code, 0.3, 0.3)).toBeCloseTo(0.19);
  });
});
describe("composition is evaluation of functions", () => {
  const a = "circle(.4,.5,.2)",
    b = "circle(.6,.5,.2)";
  it("union uses min", () => {
    expect(sample(`union(${a},${b})`, 0.3, 0.5)).toBeCloseTo(-0.1);
  });
  it("intersection uses max", () => {
    expect(sample(`intersect(${a},${b})`, 0.3, 0.5)).toBeCloseTo(0.1);
    expect(sample(`intersect(${a},${b})`, 0.5, 0.5)).toBeCloseTo(-0.1);
  });
  it("subtraction negates the second function", () => {
    expect(sample(`subtract(${a},${b})`, 0.3, 0.5)).toBeCloseTo(-0.1);
    expect(sample(`subtract(${a},${b})`, 0.5, 0.5)).toBeCloseTo(0.1);
  });
  it("translate evaluates inverse coordinates", () => {
    expect(sample("translate(.2,.1,circle(.3,.4,.1))", 0.5, 0.5)).toBeCloseTo(
      -0.1,
    );
  });
  it("scale preserves distance magnitude and scales around origin", () => {
    expect(sample("scale(2,circle(.2,.2,.1))", 0.4, 0.4)).toBeCloseTo(-0.2);
    expect(sample("scale(2,circle(.2,.2,.1))", 0.6, 0.4)).toBeCloseTo(0);
  });
  it("rotate uses inverse coordinates in radians", () => {
    expect(sample("rotate(PI/2,box(.4,0,.2,.1))", 0, 0.4)).toBeCloseTo(-0.05);
    expect(sample("rotate(PI/2,box(.4,0,.2,.1))", 0.1, 0.4)).toBeCloseTo(0.05);
  });
  it("repeat wraps a cell around canvas center", () => {
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9])
      expect(sample("repeat(.2,.2,circle(.5,.5,.04))", x, 0.5)).toBeCloseTo(
        -0.04,
      );
    expect(
      sample("repeat(spacing(.2,.2),circle(.5,.5,.04))", 0.7, 0.5),
    ).toBeCloseTo(-0.04);
  });
  it("mirror copies the right and bottom halves", () => {
    expect(sample("mirrorX(circle(.7,.5,.1))", 0.3, 0.5)).toBeCloseTo(-0.1);
    expect(sample("mirrorY(circle(.5,.7,.1))", 0.5, 0.3)).toBeCloseTo(-0.1);
  });
  it("smooth union rounds the joint", () => {
    expect(sample(`smoothUnion(${a},${b},.1)`, 0.5, 0.5)).toBeCloseTo(-0.125);
  });
});
describe("safe mathematical parser", () => {
  it("raw circle equals primitive at many coordinates", () => {
    for (let x = 0; x <= 1; x += 0.1)
      for (let y = 0; y <= 1; y += 0.1)
        expect(sample("field(sqrt((x-.5)^2+(y-.5)^2)-.2)", x, y)).toBeCloseTo(
          sample("circle(.5,.5,.2)", x, y),
        );
  });
  it("precedence, right-associative powers, and unary minus", () => {
    expect(sample("field(2+3*4)", 0, 0)).toBe(14);
    expect(sample("field(2^3^2)", 0, 0)).toBe(512);
    expect(sample("field(-2^2)", 0, 0)).toBe(-4);
    expect(sample("field(2^-2)", 0, 0)).toBe(0.25);
  });
  it("supports all allowed functions, constants, scientific notation and comments", () => {
    expect(
      sample(
        "// note\nfield(sin(PI/2)+cos(0)+tan(0)+sqrt(4)+abs(-2)+pow(2,3)+min(1,2)+max(3,4)+floor(1.2)+ceil(1.2)+E-E+1e-2)",
        0,
        0,
      ),
    ).toBeCloseTo(22.01);
  });
  it("wave is negative at its centerline", () => {
    for (const x of [0.1, 0.2, 0.5, 0.8])
      expect(
        sample(
          examples.find((e) => e.id === "wave")!.code,
          x,
          0.5 + 0.1 * Math.sin(x * 30),
        ),
      ).toBeCloseTo(-0.01);
  });
  it.each([
    "field(window.location)",
    "field(eval(1))",
    "field(constructor(1))",
    "field(__proto__(1))",
    "new Function(1)",
    "circle(hello,.5,.2)",
    "circle(x,.5,.2)",
    "circle(.5,.5,-.2)",
    "box(.5,.5,0,1)",
    "line(0,0,1,1,0)",
    "scale(0,circle(0,0,1))",
    "repeat(0,.2,circle(0,0,1))",
    "field(sqrt(1,2))",
    "circle(1,2)",
    "union(circle(0,0,1))",
    "polyline(points([0,0]),.1)",
    "circle(0,0,1);alert(1)",
    "field(x = 1)",
    "field(1e999)",
  ])("rejects unsafe or invalid input: %s", (code) => {
    expect(() => parse(code)).toThrow();
  });
  it("reports the line and column without crashing", () => {
    const code = "union(\n circle(.5,.5,.2),\n circle(hello,.5,.2)\n)";
    try {
      parse(code);
      throw new Error("Expected parse to fail");
    } catch (e) {
      const d = describeError(e, code);
      expect(d.line).toBe(3);
      expect(d.column).toBe(9);
      expect(d.message).toContain("numeric");
    }
  });
  it("rejects extreme nesting and input length", () => {
    expect(() =>
      parse("field(" + "(".repeat(100) + "1" + ")".repeat(100) + ")"),
    ).toThrow(/complex/);
    expect(() => parse(" ".repeat(60001))).toThrow(/large/);
  });
});
describe("serialization and drawing round trips", () => {
  const codes = [
    ...examples.map((e) => e.code),
    "translate(.1,.2,rotate(PI/3,scale(.7,box(.1,.2,.3,.4))))",
    "mirrorX(mirrorY(circle(.6,.7,.1)))",
    "smoothUnion(circle(.3,.5,.2),circle(.6,.5,.2),.1)",
    "polyline(points([.1,.2],[.3,.5],[.8,.3]),.02)",
  ];
  it.each(codes)(
    "serialize → parse is structurally and numerically equivalent: %s",
    (code) => {
      const a = parse(code),
        serialized = serialize(a),
        b = parse(serialized);
      const strip = (obj: unknown): unknown =>
        JSON.parse(
          JSON.stringify(obj, (key, value) =>
            key === "pos" ? undefined : value,
          ),
        );
      expect(strip(b)).toEqual(strip(a));
      for (let i = 0; i < 30; i++) {
        const x = ((i * 13) % 31) / 31,
          y = ((i * 19) % 31) / 31;
        expect(evaluate(b, x, y)).toBeCloseTo(evaluate(a, x, y), 12);
      }
    },
  );
  it("reduces a thousand point stroke while preserving endpoints and tolerance", () => {
    const points: Point[] = Array.from({ length: 1000 }, (_, i) => [
      i / 999,
      0.5 + 0.1 * Math.sin(i / 70),
    ]);
    const reduced = simplify(points, 0.0015);
    expect(reduced.length).toBeLessThan(100);
    expect(reduced[0]).toEqual(points[0]);
    expect(reduced.at(-1)).toEqual(points.at(-1));
    for (const p of points) {
      let min = Infinity;
      for (let i = 1; i < reduced.length; i++)
        min = Math.min(
          min,
          segmentDistance(...p, ...reduced[i - 1], ...reduced[i]),
        );
      expect(min).toBeLessThanOrEqual(0.0015 + 1e-9);
    }
  });
  it("keeps a sharp corner", () => {
    expect(
      simplify([
        [0, 0],
        [0.5, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });
  it("one drawn circle becomes circle; two become one union", () => {
    const scene = emptyScene();
    scene.elements = [
      {
        id: 1,
        kind: "circle",
        points: [
          [0.3, 0.5],
          [0.5, 0.5],
        ],
        thickness: 0.01,
      },
    ];
    expect(convertToField(scene).kind).toBe("circle");
    scene.elements.push({
      id: 2,
      kind: "circle",
      points: [
        [0.6, 0.5],
        [0.8, 0.5],
      ],
      thickness: 0.01,
    });
    const node = convertToField(scene);
    expect(node.kind).toBe("union");
    expect(sample(serialize(node), 0.5, 0.5)).toBeLessThan(0);
  });
  it("eraser is a subtraction field and a tap is valid", () => {
    const node = convertToField({
      base: parse("circle(.5,.5,.3)"),
      pixels: null,
      elements: [
        {
          id: 1,
          kind: "polyline",
          erase: true,
          points: [[0.5, 0.5]],
          thickness: 0.1,
        },
      ],
    });
    expect(node.kind).toBe("subtract");
    expect(sample(serialize(node), 0.5, 0.5)).toBeCloseTo(0.05);
  });
  it("empty drawing represents an everywhere-positive field", () => {
    expect(evaluate(convertToField(emptyScene()), 0.5, 0.5)).toBe(1);
  });
});
describe("rasterization evaluates fields and fails atomically", () => {
  it("produces an opaque monochrome raster and normalized coordinates", async () => {
    const { pixels } = await rasterize(parse("circle(.5,.5,.2)"), 32);
    expect(pixels[(16 * 32 + 16) * 4]).toBe(0);
    expect(pixels[0]).toBe(255);
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(pixels[i + 1]);
      expect(pixels[i]).toBe(pixels[i + 2]);
      expect(pixels[i + 3]).toBe(255);
    }
  });
  it("rejects non-finite raw values", async () => {
    await expect(rasterize(parse("field(sqrt(-1))"), 16)).rejects.toThrow(
      /non-finite/,
    );
  });
  it("can cancel chunked rendering", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      rasterize(
        parse("circle(.5,.5,.2)"),
        32,
        "solid",
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow(/cancelled/);
  });
});
