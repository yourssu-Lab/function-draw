import { compileExpression, compileEquation } from "./expressions";
import {
  FieldError,
  type Binding,
  type Expr,
  type FieldNode,
  type Point,
} from "./types";
type Token = {
  text: string;
  pos: number;
  kind: "number" | "name" | "symbol" | "end";
};
function tokenize(source: string): Token[] {
  const equation = /^(?:\s|\/\/[^\n]*\n)*(?:f\s*\(|[A-Za-z_]\w*\s*=)/.test(
    source,
  );
  const limit = equation ? 1000000 : 60000;
  if (source.length > limit)
    throw new FieldError(
      `Function is too large. Limit: ${limit.toLocaleString("en-US")} characters.`,
    );
  const tokens: Token[] = [];
  const re =
    /\s+|\/\/[^\n]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/^,\[\]=;]/gy;
  let pos = 0;
  while (pos < source.length) {
    re.lastIndex = pos;
    const m = re.exec(source);
    if (!m)
      throw new FieldError(
        `Unexpected character “${source[pos]}”. Only field expressions are allowed.`,
        pos,
      );
    const text = m[0];
    if (!/^\s|^\/\//.test(text))
      tokens.push({
        text,
        pos,
        kind: /^[\d.]/.test(text)
          ? "number"
          : /^[A-Za-z_]/.test(text)
            ? "name"
            : "symbol",
      });
    pos = re.lastIndex;
    if (tokens.length > (equation ? 250000 : 12000))
      throw new FieldError(
        "Function is too complex. Reduce the number of terms.",
        pos,
      );
  }
  return [...tokens, { text: "", pos: source.length, kind: "end" }];
}
export function parse(source: string): FieldNode {
  const tokens = tokenize(source);
  const equation = tokens[0].text === "f" || tokens[1]?.text === "=";
  let index = 0,
    depth = 0,
    nodes = 0;
  const peek = () => tokens[index];
  const take = (expected: string) => {
    if (peek().text !== expected)
      throw new FieldError(
        `Expected “${expected}”${peek().text ? `, found “${peek().text}”` : " before end of function"}.`,
        peek().pos,
      );
    index++;
  };
  function expression(min = 0): Expr {
    if (++depth > 80 || ++nodes > (equation ? 100000 : 4000))
      throw new FieldError(
        "Expression is too complex or deeply nested.",
        peek().pos,
      );
    const t = tokens[index++];
    let node: Expr;
    if (t.kind === "number") {
      const value = Number(t.text);
      if (!Number.isFinite(value))
        throw new FieldError("Numbers must be finite.", t.pos);
      node = { type: "number", value, pos: t.pos };
    } else if (t.text === "-" || t.text === "+")
      node = { type: "unary", op: t.text, value: expression(30), pos: t.pos };
    else if (t.text === "(") {
      node = expression();
      take(")");
    } else if (t.text === "[")
      node = { type: "array", args: list("]"), pos: t.pos };
    else if (t.kind === "name") {
      if (peek().text === "(") {
        index++;
        node = { type: "call", name: t.text, args: list(")"), pos: t.pos };
      } else node = { type: "variable", name: t.text, pos: t.pos };
    } else
      throw new FieldError(
        t.kind === "end"
          ? "Expected a field expression."
          : `Unexpected token “${t.text}”.`,
        t.pos,
      );
    while (true) {
      const op = peek();
      const prec =
        (
          { "+": 10, "-": 10, "*": 20, "/": 20, "^": 30 } as Record<
            string,
            number
          >
        )[op.text] ?? -1;
      if (prec < min) break;
      index++;
      node = {
        type: "binary",
        op: op.text,
        left: node,
        right: expression(op.text === "^" ? prec : prec + 1),
        pos: op.pos,
      };
    }
    depth--;
    return node;
  }
  function list(end: string): Expr[] {
    const args: Expr[] = [];
    if (peek().text !== end)
      while (true) {
        args.push(expression());
        if (peek().text !== ",") break;
        index++;
        if (peek().text === end) break;
      }
    take(end);
    return args;
  }
  if (equation) {
    const bindings: Binding[] = [];
    while (peek().text !== "f") {
      const name = peek();
      if (name.kind !== "name")
        throw new FieldError(
          "Expected an intermediate definition or f(x, y) = expression.",
          name.pos,
        );
      index++;
      take("=");
      bindings.push({
        name: name.text,
        expression: expression(),
        pos: name.pos,
      });
      take(";");
      if (bindings.length > 4096)
        throw new FieldError(
          "Too many intermediate variables. Limit: 4096.",
          name.pos,
        );
    }
    take("f");
    take("(");
    take("x");
    take(",");
    take("y");
    take(")");
    take("=");
    const result = expression();
    if (peek().text === ";") index++;
    if (peek().kind !== "end")
      throw new FieldError("Expected the end of f(x, y).", peek().pos);
    compileEquation(result, bindings);
    return {
      kind: "field",
      expression: result,
      ...(bindings.length ? { bindings } : {}),
    };
  }
  const tree = expression();
  if (peek().kind !== "end")
    throw new FieldError(
      "Expected the end of one field expression.",
      peek().pos,
    );
  return toField(tree);
}
function number(expr: Expr, name: string): number {
  try {
    const n = compileExpression(expr, true)(0, 0);
    if (!Number.isFinite(n)) throw new Error();
    return n;
  } catch {
    throw new FieldError(
      `${name}() expects finite numeric arguments.`,
      expr.pos,
    );
  }
}
function toField(expr: Expr): FieldNode {
  if (expr.type !== "call")
    throw new FieldError(
      "Expected a field function, such as circle(...) or field(...).",
      expr.pos,
    );
  const { name, args, pos } = expr;
  const arity = (n: number, max = n) => {
    if (args.length < n || args.length > max)
      throw new FieldError(
        `${name}() expects ${n === max ? n : `${n}–${max}`} argument(s); received ${args.length}.`,
        pos,
      );
  };
  const nums = (n = args.length) =>
    args.slice(0, n).map((a) => number(a, name));
  const positive = (values: number[]) => {
    if (values.some((n) => n <= 0))
      throw new FieldError(
        `${name}() requires positive sizes, spacing or thickness.`,
        pos,
      );
  };
  switch (name) {
    case "circle": {
      arity(3);
      const values = nums();
      positive(values.slice(2));
      return { kind: name, values };
    }
    case "box": {
      arity(4);
      const values = nums();
      positive(values.slice(2));
      return { kind: name, values };
    }
    case "line": {
      arity(5);
      const values = nums();
      positive(values.slice(4));
      return { kind: name, values };
    }
    case "polyline": {
      arity(2);
      const p = args[0];
      if (p.type !== "call" || p.name !== "points")
        throw new FieldError(
          "polyline() expects points([x, y], ...) as its first argument.",
          p.pos,
        );
      if (p.args.length < 2 || p.args.length > 2048)
        throw new FieldError(
          "points() expects 2–2048 coordinate pairs.",
          p.pos,
        );
      const points: Point[] = p.args.map((pair) => {
        if (pair.type !== "array" || pair.args.length !== 2)
          throw new FieldError("Each point must be [x, y].", pair.pos);
        return [number(pair.args[0], name), number(pair.args[1], name)];
      });
      const thickness = number(args[1], name);
      positive([thickness]);
      return { kind: name, points, thickness };
    }
    case "union":
    case "intersect":
      arity(2, 64);
      return { kind: name, children: args.map(toField) };
    case "subtract":
      arity(2);
      return { kind: name, children: args.map(toField) };
    case "translate": {
      arity(3);
      return { kind: name, values: nums(2), children: [toField(args[2])] };
    }
    case "scale":
    case "rotate": {
      arity(2);
      const values = nums(1);
      if (name === "scale") positive(values);
      return { kind: name, values, children: [toField(args[1])] };
    }
    case "repeat": {
      let values: number[], child: Expr;
      if (
        args.length === 2 &&
        args[0].type === "call" &&
        args[0].name === "spacing"
      ) {
        if (args[0].args.length !== 2)
          throw new FieldError(
            "spacing() expects two numeric arguments.",
            args[0].pos,
          );
        values = args[0].args.map((a) => number(a, "spacing"));
        child = args[1];
      } else {
        arity(3);
        values = nums(2);
        child = args[2];
      }
      positive(values);
      return { kind: name, values, children: [toField(child)] };
    }
    case "mirrorX":
    case "mirrorY":
      arity(1);
      return { kind: name, values: [], children: [toField(args[0])] };
    case "smoothUnion": {
      arity(3);
      const k = number(args[2], name);
      positive([k]);
      return {
        kind: name,
        values: [k],
        children: args.slice(0, 2).map(toField),
      };
    }
    case "field":
      arity(1);
      compileExpression(args[0]);
      return { kind: name, expression: args[0] };
    default:
      throw new FieldError(`Unknown field function “${name}”.`, pos);
  }
}
