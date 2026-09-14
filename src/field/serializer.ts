import type { Expr, FieldNode } from "./types";
import { toEquation } from "./equation";
function hasDefinitions(node: FieldNode): boolean {
  return node.kind === 'field' ? !!node.bindings?.length : 'children' in node && node.children.some(hasDefinitions);
}
function exprText(e: Expr): string {
  switch (e.type) {
    case "number":
      return String(e.value);
    case "variable":
      return e.name;
    case "unary":
      return `(${e.op}${exprText(e.value)})`;
    case "binary":
      return `(${exprText(e.left)} ${e.op} ${exprText(e.right)})`;
    case "call":
      return `${e.name}(${e.args.map(exprText).join(", ")})`;
    case "array":
      return `[${e.args.map(exprText).join(", ")}]`;
  }
}
export function serialize(node: FieldNode, depth = 0): string {
  // Definitions have equation scope; never embed a definition block in a shape call.
  if (depth === 0 && node.kind !== 'field' && hasDefinitions(node)) return toEquation(node);
  const pad = "  ".repeat(depth),
    inner = "  ".repeat(depth + 1);
  switch (node.kind) {
    case "circle":
    case "box":
    case "line":
      return `${node.kind}(${node.values.join(", ")})`;
    case "polyline":
      return `polyline(\n${inner}points(\n${node.points.map((p) => `${inner}  [${p.join(", ")}]`).join(",\n")}\n${inner}),\n${inner}${node.thickness}\n${pad})`;
    case "field":
      if (node.bindings?.length)
        return `${node.bindings.map((b) => `${b.name} = ${exprText(b.expression)};`).join("\n")}\nf(x, y) = ${exprText(node.expression)}`;
      return `field(${exprText(node.expression)})`;
    default: {
      const args = node.children.map((c) => serialize(c, depth + 1));
      if ("values" in node) {
        if (node.kind === "smoothUnion") args.push(String(node.values[0]));
        else args.unshift(...node.values.map(String));
      }
      return `${node.kind}(\n${args.map((a) => inner + a).join(",\n")}\n${pad})`;
    }
  }
}
