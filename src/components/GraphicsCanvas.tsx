import { useEffect, useRef, useState } from "react";
import {
  bounds,
  type DrawingElement,
  type Scene,
  type Tool,
} from "../drawing/drawing";
import type { Point } from "../field/types";
function Preview({ element }: { element: DrawingElement }) {
  const [a, b = a] = element.points,
    ink = element.erase ? "white" : "#171717";
  switch (element.kind) {
    case "circle":
      return (
        <circle
          cx={a[0]}
          cy={a[1]}
          r={Math.hypot(b[0] - a[0], b[1] - a[1])}
          fill={ink}
        />
      );
    case "box":
      return (
        <rect
          x={Math.min(a[0], b[0])}
          y={Math.min(a[1], b[1])}
          width={Math.abs(a[0] - b[0])}
          height={Math.abs(a[1] - b[1])}
          fill={ink}
        />
      );
    default:
      return (
        <polyline
          points={element.points.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke={ink}
          strokeWidth={element.thickness}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}
let nextId = 1;
export default function GraphicsCanvas({
  scene,
  onCommit,
  tool,
  thickness,
  disabled,
  grid,
  onPosition,
}: {
  scene: Scene;
  onCommit: (s: Scene) => void;
  tool: Tool;
  thickness: number;
  disabled: boolean;
  grid: boolean;
  onPosition: (p: Point | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    surface = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<DrawingElement | null>(null),
    [selected, setSelected] = useState<number | null>(null);
  const gesture = useRef<{
    start: Point;
    element: DrawingElement;
    moving: boolean;
  } | null>(null);
  useEffect(() => {
    const c = canvas.current!;
    c.width = c.height = scene.pixels?.width ?? 512;
    const ctx = c.getContext("2d")!;
    if (scene.pixels) ctx.putImageData(scene.pixels, 0, 0);
    else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }, [scene.pixels]);
  useEffect(() => {
    setSelected(null);
    setDraft(null);
    gesture.current = null;
  }, [scene]);
  const point = (e: React.PointerEvent): Point => {
    const b = surface.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    ];
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "select") {
      const hit = [...scene.elements].reverse().find((el) => {
        const [x, y, w, h] = bounds(el);
        return (
          p[0] >= x - 0.01 &&
          p[0] <= x + w + 0.01 &&
          p[1] >= y - 0.01 &&
          p[1] <= y + h + 0.01
        );
      });
      setSelected(hit?.id ?? null);
      if (hit) {
        gesture.current = { start: p, element: hit, moving: true };
        setDraft(hit);
      }
      return;
    }
    const el: DrawingElement = {
      id: nextId++,
      kind: tool === "pen" || tool === "eraser" ? "polyline" : tool,
      points: [p, p],
      thickness: tool === "eraser" ? Math.max(0.035, thickness * 3) : thickness,
      erase: tool === "eraser",
    };
    gesture.current = { start: p, element: el, moving: false };
    setDraft(el);
    setSelected(null);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = point(e);
    onPosition(p);
    const g = gesture.current;
    if (!g) return;
    if (g.moving) {
      setDraft({
        ...g.element,
        points: g.element.points.map((a) => [
          a[0] + p[0] - g.start[0],
          a[1] + p[1] - g.start[1],
        ]),
      });
    } else if (g.element.kind === "polyline") {
      const last = g.element.points.at(-1)!;
      if (
        Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.001 &&
        g.element.points.length < 8000
      ) {
        g.element = { ...g.element, points: [...g.element.points, p] };
        setDraft(g.element);
      }
    } else {
      g.element = { ...g.element, points: [g.start, p] };
      setDraft(g.element);
    }
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    const final = g.moving
      ? {
          ...g.element,
          points: g.element.points.map(
            (a) =>
              [a[0] + p[0] - g.start[0], a[1] + p[1] - g.start[1]] as Point,
          ),
        }
      : g.element.kind === "polyline"
        ? { ...g.element, points: [...g.element.points, p] }
        : { ...g.element, points: [g.start, p] };
    gesture.current = null;
    setDraft(null);
    onCommit({
      ...scene,
      elements: g.moving
        ? scene.elements.map((el) => (el.id === final.id ? final : el))
        : [...scene.elements, final],
    });
  };
  const chosen =
    draft?.id === selected
      ? draft
      : scene.elements.find((el) => el.id === selected);
  const rect = chosen ? bounds(chosen) : null;
  return (
    <div className={`canvas-stage ${grid ? "with-grid" : ""}`}>
      <div className="axis axis-top">
        <span>0.0</span>
        <span>0.5</span>
        <span>
          1.0 <em>x</em>
        </span>
      </div>
      <div className="axis axis-side">
        <span>0.0</span>
        <span>0.5</span>
        <span>
          1.0 <em>y</em>
        </span>
      </div>
      <div className={`canvas-surface tool-${tool}`}>
        <canvas ref={canvas} aria-label="Rasterized scalar field" />
        <svg
          ref={surface}
          className="drawing-overlay"
          viewBox="0 0 1 1"
          tabIndex={0}
          aria-label="Graphic drawing surface"
          role="application"
          aria-description="Choose a tool and drag to draw. Select and drag to move a pending shape. Delete removes a selected shape."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(null);
          }}
          onPointerLeave={() => {
            if (!gesture.current) onPosition(null);
          }}
          onKeyDown={(e) => {
            if (
              (e.key === "Delete" || e.key === "Backspace") &&
              selected !== null &&
              !disabled
            ) {
              e.preventDefault();
              onCommit({
                ...scene,
                elements: scene.elements.filter((el) => el.id !== selected),
              });
              setSelected(null);
            }
          }}
        >
          {scene.elements.map((el) => (
            <Preview key={el.id} element={draft?.id === el.id ? draft : el} />
          ))}
          {draft && !scene.elements.some((el) => el.id === draft.id) && (
            <Preview element={draft} />
          )}
          {rect && (
            <rect
              x={rect[0] - 0.008}
              y={rect[1] - 0.008}
              width={rect[2] + 0.016}
              height={rect[3] + 0.016}
              fill="none"
              stroke="#888"
              strokeWidth=".0015"
              strokeDasharray=".008 .006"
            />
          )}
        </svg>
      </div>
      <span className="canvas-origin">[0, 1]²</span>
    </div>
  );
}
