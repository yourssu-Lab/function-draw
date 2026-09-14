import { parse } from "./field/parser";
import { toEquation } from "./field/equation";
const sourceExamples = [
  {
    id: "difference",
    name: "Difference",
    tag: "A − B",
    description: "Carve one field out of another.",
    code: "subtract(\n  circle(0.5, 0.5, 0.28),\n  circle(0.58, 0.45, 0.20)\n)",
  },
  {
    id: "circle",
    name: "Circle",
    tag: "SQRT · DISTANCE",
    description: "A distance from the center.",
    code: "circle(0.5, 0.5, 0.2)",
  },
  {
    id: "union",
    name: "Union",
    tag: "MIN(A, B)",
    description: "Combine two regions of space.",
    code: "union(\n  circle(0.42, 0.5, 0.2),\n  circle(0.58, 0.5, 0.2)\n)",
  },
  {
    id: "intersection",
    name: "Intersection",
    tag: "MAX(A, B)",
    description: "Keep only the shared region.",
    code: "intersect(\n  circle(0.42, 0.5, 0.2),\n  circle(0.58, 0.5, 0.2)\n)",
  },
  {
    id: "repetition",
    name: "Repetition",
    tag: "FLOOR · PERIODIC",
    description: "One function. An entire pattern.",
    code: "repeat(\n  0.2, 0.2,\n  circle(0.5, 0.5, 0.04)\n)",
  },
  {
    id: "wave",
    name: "Wave field",
    tag: "SIN(X)",
    description: "Draw directly with an equation.",
    code: "field(\n  abs(\n    y - (0.5 + 0.1 * sin(x * 30))\n  ) - 0.01\n)",
  },
  {
    id: "pattern",
    name: "Math pattern",
    tag: "SCALAR FIELD",
    description: "Define the space between shapes.",
    code: "field(\n  abs(\n    sin(x * 20) * cos(y * 20)\n  ) - 0.3\n)",
  },
];
export const examples = sourceExamples.map((example) => ({
  ...example,
  code: toEquation(parse(example.code)),
}));
export const defaultCode = examples[0].code;
