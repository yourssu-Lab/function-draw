import { FieldError, type Binding, type Expr, type ScalarField } from "./types";
const math: Record<
  string,
  { min: number; max: number; fn: (...args: number[]) => number }
> = {
  sin: { min: 1, max: 1, fn: Math.sin },
  cos: { min: 1, max: 1, fn: Math.cos },
  tan: { min: 1, max: 1, fn: Math.tan },
  sqrt: { min: 1, max: 1, fn: Math.sqrt },
  abs: { min: 1, max: 1, fn: Math.abs },
  pow: { min: 2, max: 2, fn: Math.pow },
  min: { min: 2, max: 64, fn: Math.min },
  max: { min: 2, max: 64, fn: Math.max },
  floor: { min: 1, max: 1, fn: Math.floor },
  ceil: { min: 1, max: 1, fn: Math.ceil },
};
export function compileExpression(
  expr: Expr,
  constantsOnly = false,
  resolve?: (name: string) => ScalarField | undefined,
): ScalarField {
  switch (expr.type) {
    case "number":
      return () => expr.value;
    case "variable": {
      if (expr.name === "PI") return () => Math.PI;
      if (expr.name === "E") return () => Math.E;
      if (!constantsOnly && expr.name === "x") return (x) => x;
      if (!constantsOnly && expr.name === "y") return (_, y) => y;
      const local = !constantsOnly && resolve?.(expr.name);
      if (local) return local;
      throw new FieldError(
        constantsOnly
          ? "Expected a numeric constant. Coordinates x and y belong inside field()."
          : `Unknown variable “${expr.name}”. Use x, y, PI or E.`,
        expr.pos,
      );
    }
    case "unary": {
      const f = compileExpression(expr.value, constantsOnly, resolve);
      return expr.op === "-" ? (x, y) => -f(x, y) : f;
    }
    case "binary": {
      const a = compileExpression(expr.left, constantsOnly, resolve),
        b = compileExpression(expr.right, constantsOnly, resolve);
      switch (expr.op) {
        case "+":
          return (x, y) => a(x, y) + b(x, y);
        case "-":
          return (x, y) => a(x, y) - b(x, y);
        case "*":
          return (x, y) => a(x, y) * b(x, y);
        case "/":
          return (x, y) => a(x, y) / b(x, y);
        case "^":
          return (x, y) => a(x, y) ** b(x, y);
        default:
          throw new FieldError("Unsupported operator.", expr.pos);
      }
    }
    case "call": {
      const spec = Object.hasOwn(math, expr.name) ? math[expr.name] : undefined;
      if (!spec)
        throw new FieldError(`Unknown math function “${expr.name}”.`, expr.pos);
      if (expr.args.length < spec.min || expr.args.length > spec.max)
        throw new FieldError(
          `${expr.name}() expects ${spec.min === spec.max ? spec.min : "2–64"} numeric argument(s).`,
          expr.pos,
        );
      const args = expr.args.map((a) =>
        compileExpression(a, constantsOnly, resolve),
      );
      if (args.length === 1) return (x, y) => spec.fn(args[0](x, y));
      if (args.length === 2)
        return (x, y) => spec.fn(args[0](x, y), args[1](x, y));
      return (x, y) => spec.fn(...args.map((f) => f(x, y)));
    }
    default:
      throw new FieldError("Expected a mathematical expression.", expr.pos);
  }
}

/** Each definition is a scalar value at the current (x, y), computed once per sample. */
export function compileEquation(
  expression: Expr,
  bindings: Binding[] = [],
): ScalarField {
  const slots = new Float64Array(bindings.length);
  const scope = new Map<string, ScalarField>();
  const resolve = (name: string) => scope.get(name);
  const definitions = bindings.map((binding, index) => {
    if (
      ["x", "y", "PI", "E", "f"].includes(binding.name) ||
      Object.hasOwn(math, binding.name) ||
      scope.has(binding.name)
    )
      throw new FieldError(
        `“${binding.name}” is reserved or already defined. Use a unique intermediate variable.`,
        binding.pos,
      );
    // Resolve before adding this definition: forward references and cycles are impossible.
    const evaluate = compileExpression(binding.expression, false, resolve);
    scope.set(binding.name, () => slots[index]);
    return evaluate;
  });
  const result = compileExpression(expression, false, resolve);
  return (x, y) => {
    for (let i = 0; i < definitions.length; i++) {
      slots[i] = definitions[i](x, y);
      if (!Number.isFinite(slots[i])) return NaN;
    }
    return result(x, y);
  };
}
