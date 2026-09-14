export type Point = [number, number];
export type Binding = { name: string; expression: Expr; pos: number };
export type Expr =
  | { type: "number"; value: number; pos: number }
  | { type: "variable"; name: string; pos: number }
  | { type: "unary"; op: string; value: Expr; pos: number }
  | { type: "binary"; op: string; left: Expr; right: Expr; pos: number }
  | { type: "call"; name: string; args: Expr[]; pos: number }
  | { type: "array"; args: Expr[]; pos: number };
export type FieldNode =
  | { kind: "circle" | "box" | "line"; values: number[] }
  | { kind: "polyline"; points: Point[]; thickness: number }
  | { kind: "union" | "intersect" | "subtract"; children: FieldNode[] }
  | {
      kind:
        | "translate"
        | "scale"
        | "rotate"
        | "repeat"
        | "mirrorX"
        | "mirrorY"
        | "smoothUnion";
      values: number[];
      children: FieldNode[];
    }
  | { kind: "field"; expression: Expr; bindings?: Binding[] };
export type ScalarField = (x: number, y: number) => number;
export class FieldError extends Error {
  constructor(
    message: string,
    public pos = 0,
  ) {
    super(message);
    this.name = "FieldError";
  }
}
export function describeError(error: unknown, source: string) {
  const pos =
    error instanceof FieldError ? Math.min(error.pos, source.length) : 0;
  const before = source.slice(0, pos).split("\n");
  return {
    message:
      error instanceof Error
        ? error.message
        : "Unable to evaluate this function.",
    line: before.length,
    column: before.at(-1)!.length + 1,
    pos,
  };
}
