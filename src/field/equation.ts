import type { Binding, Expr, FieldNode } from "./types";

const n = (value: number): Expr => ({ type: "number", value, pos: 0 });
const v = (name: string): Expr => ({ type: "variable", name, pos: 0 });
const op = (operator: string, left: Expr, right: Expr): Expr => ({
  type: "binary",
  op: operator,
  left,
  right,
  pos: 0,
});
const call = (name: string, ...args: Expr[]): Expr => ({
  type: "call",
  name,
  args,
  pos: 0,
});
const neg = (value: Expr): Expr => ({ type: "unary", op: "-", value, pos: 0 });
const add = (a: Expr, b: Expr) => op("+", a, b);
const sub = (a: Expr, b: Expr) => op("-", a, b);
const mul = (a: Expr, b: Expr) => op("*", a, b);
const div = (a: Expr, b: Expr) => op("/", a, b);
const square = (a: Expr) => op("^", a, n(2));
const length = (x: Expr, y: Expr) => call("sqrt", add(square(x), square(y)));
const clamp = (value: Expr) => call("min", n(1), call("max", n(0), value));

/** Lower every shape/operation to arithmetic. Locals share repeated scalar calculations. */
export function toEquation(node: FieldNode): string {
  const bindings: Binding[] = [];
  let serial = 0;
  const bind = (expression: Expr, prefix: string): Expr => {
    const name = `${prefix}${++serial}`;
    bindings.push({ name, expression, pos: 0 });
    return v(name);
  };
  const replace = (expr: Expr, scope: Map<string, Expr>): Expr => {
    switch (expr.type) {
      case "variable":
        return scope.get(expr.name) ?? expr;
      case "unary":
        return { ...expr, value: replace(expr.value, scope) };
      case "binary":
        return {
          ...expr,
          left: replace(expr.left, scope),
          right: replace(expr.right, scope),
        };
      case "call":
      case "array":
        return { ...expr, args: expr.args.map((a) => replace(a, scope)) };
      default:
        return expr;
    }
  };
  function segment(
    x: Expr,
    y: Expr,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): Expr {
    const px = sub(x, n(ax)),
      py = sub(y, n(ay));
    const dx = sub(n(bx), n(ax)),
      dy = sub(n(by), n(ay));
    if (ax === bx && ay === by) return length(px, py);
    const t = bind(
      clamp(div(add(mul(px, dx), mul(py, dy)), add(square(dx), square(dy)))),
      "t",
    );
    return length(sub(px, mul(t, dx)), sub(py, mul(t, dy)));
  }
  // Keep variadic math calls within the same small arity as handwritten expressions.
  function minimum(values: Expr[]): Expr {
    if (values.length === 1) return values[0];
    if (values.length <= 64) return call("min", ...values);
    const groups: Expr[] = [];
    for (let i = 0; i < values.length; i += 64)
      groups.push(minimum(values.slice(i, i + 64)));
    return minimum(groups);
  }
  function lower(field: FieldNode, x: Expr, y: Expr): Expr {
    switch (field.kind) {
      case "circle": {
        const [cx, cy, r] = field.values;
        return sub(length(sub(x, n(cx)), sub(y, n(cy))), n(r));
      }
      case "box": {
        const [cx, cy, w, h] = field.values;
        const qx = bind(sub(call("abs", sub(x, n(cx))), div(n(w), n(2))), "qx");
        const qy = bind(sub(call("abs", sub(y, n(cy))), div(n(h), n(2))), "qy");
        return add(
          length(call("max", qx, n(0)), call("max", qy, n(0))),
          call("min", call("max", qx, qy), n(0)),
        );
      }
      case "line": {
        const [ax, ay, bx, by, t] = field.values;
        return sub(segment(x, y, ax, ay, bx, by), div(n(t), n(2)));
      }
      case "polyline": {
        const distances: Expr[] = [];
        for (let i = 1; i < field.points.length; i++)
          distances.push(
            bind(
              segment(x, y, ...field.points[i - 1], ...field.points[i]),
              "d",
            ),
          );
        return sub(minimum(distances), div(n(field.thickness), n(2)));
      }
      case "field": {
        const scope = new Map([
          ["x", x],
          ["y", y],
        ]);
        for (const local of field.bindings ?? [])
          scope.set(local.name, bind(replace(local.expression, scope), "s"));
        return replace(field.expression, scope);
      }
      case "union":
        return call(
          "min",
          ...field.children.map((child) => lower(child, x, y)),
        );
      case "intersect":
        return call(
          "max",
          ...field.children.map((child) => lower(child, x, y)),
        );
      case "subtract":
        return call(
          "max",
          lower(field.children[0], x, y),
          neg(lower(field.children[1], x, y)),
        );
      case "translate":
        return lower(
          field.children[0],
          bind(sub(x, n(field.values[0])), "u"),
          bind(sub(y, n(field.values[1])), "v"),
        );
      case "scale": {
        const s = n(field.values[0]);
        return mul(
          lower(field.children[0], bind(div(x, s), "u"), bind(div(y, s), "v")),
          s,
        );
      }
      case "rotate": {
        const a = n(field.values[0]),
          c = call("cos", a),
          s = call("sin", a);
        return lower(
          field.children[0],
          bind(add(mul(c, x), mul(s, y)), "u"),
          bind(add(mul(neg(s), x), mul(c, y)), "v"),
        );
      }
      case "repeat": {
        const wrap = (p: Expr, spacing: number) => {
          const q = sub(p, n(0.5)),
            s = n(spacing);
          return sub(p, mul(s, call("floor", div(add(q, div(s, n(2))), s))));
        };
        return lower(
          field.children[0],
          bind(wrap(x, field.values[0]), "u"),
          bind(wrap(y, field.values[1]), "v"),
        );
      }
      case "mirrorX":
        return lower(
          field.children[0],
          bind(add(n(0.5), call("abs", sub(x, n(0.5)))), "u"),
          y,
        );
      case "mirrorY":
        return lower(
          field.children[0],
          x,
          bind(add(n(0.5), call("abs", sub(y, n(0.5)))), "v"),
        );
      case "smoothUnion": {
        const a = bind(lower(field.children[0], x, y), "a"),
          b = bind(lower(field.children[1], x, y), "b"),
          k = n(field.values[0]);
        const h = bind(clamp(add(n(0.5), div(mul(n(0.5), sub(b, a)), k))), "h");
        return sub(add(b, mul(sub(a, b), h)), mul(mul(k, h), sub(n(1), h)));
      }
    }
  }
  const result = lower(node, v("x"), v("y"));
  return [
    ...bindings.map((b) => `${b.name} = ${format(b.expression)};`),
    `f(x, y) =\n  ${format(result, 0, 2)}`,
  ].join("\n");
}

function format(expr: Expr, parent = 0, indent = 0): string {
  switch (expr.type) {
    case "number":
      return expr.value < 0 && parent > 25
        ? `(${expr.value})`
        : String(expr.value);
    case "variable":
      return expr.name;
    case "unary": {
      const text = expr.op + format(expr.value, 25, indent);
      return parent > 25 ? `(${text})` : text;
    }
    case "binary": {
      const precedence = (
        { "+": 10, "-": 10, "*": 20, "/": 20, "^": 30 } as Record<
          string,
          number
        >
      )[expr.op];
      const text = `${format(expr.left, precedence + (expr.op === "^" ? 1 : 0), indent)} ${expr.op} ${format(expr.right, precedence + (expr.op === "^" ? 0 : 1), indent)}`;
      return precedence < parent ? `(${text})` : text;
    }
    case "call": {
      const args = expr.args.map((a) => format(a, 0, indent + 2));
      const inline = `${expr.name}(${args.join(", ")})`;
      if (inline.length + indent <= 78 && !inline.includes("\n")) return inline;
      return `${expr.name}(\n${args.map((a) => " ".repeat(indent + 2) + a).join(",\n")}\n${" ".repeat(indent)})`;
    }
    case "array":
      return `[${expr.args.map((a) => format(a)).join(", ")}]`;
  }
}
