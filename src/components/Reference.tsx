import { useEffect, useRef } from "react";
import Icon from "./Icon";
export default function Reference({
  tab,
  onClose,
}: {
  tab: "guide" | "about";
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="reference"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="reference-head">
        <span className="eyebrow">
          FIELD NOTES / {tab === "guide" ? "REFERENCE" : "ABOUT"}
        </span>
        <button
          className="icon-button"
          aria-label="Close reference"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {tab === "about" ? (
        <>
          <h2>
            A graphic is a function
            <br />
            over space.
          </h2>
          <p>
            Raster images store pixels. SVG stores shapes and paths.
            Function-Native Graphics explores another representation: a single
            function defines the entire graphic.
          </p>
          <div className="big-equation">ƒ(x, y) → distance</div>
          <div className="signs">
            <span>
              <b>ƒ &lt; 0</b> Inside
            </span>
            <span>
              <b>ƒ = 0</b> Boundary
            </span>
            <span>
              <b>ƒ &gt; 0</b> Outside
            </span>
          </div>
          <p>
            Shapes, transformations and boolean operations are all function
            composition. Every rendered pixel is a sample of the resulting
            field.
          </p>
          <p className="muted">
            Everything runs in your browser. Your last function is saved on this
            device. No account, uploads, or backend.
          </p>
        </>
      ) : (
        <>
          <h2>
            A small language.
            <br />
            An entire space.
          </h2>
          <p>
            Draw on the left, then convert. Or edit a function on the right,
            then render. Changes only cross panels when you ask them to.
          </p>
          <h3>Every shape is an equation</h3>
          <p>
            Drawings and examples expand to arithmetic, with no shape names in
            the result. The boundary is f(x, y) = 0; negative values fill the
            inside.
          </p>
          <pre>{"f(x, y) =\n  sqrt((x - 0.5)^2 + (y - 0.5)^2) - 0.2"}</pre>
          <p>
            For longer equations, define intermediate scalar values once at each
            point. End each definition with a semicolon. Use earlier definitions
            in later ones; the final line defines f(x, y).
          </p>
          <pre>
            {
              "qx = abs(x - 0.5) - 0.2;\nqy = abs(y - 0.5) - 0.1;\nf(x, y) =\n  sqrt(max(qx, 0)^2 + max(qy, 0)^2)\n  + min(max(qx, qy), 0)"
            }
          </pre>
          <p>
            Union becomes min(a, b), intersection becomes max(a, b), and
            difference becomes max(a, -b). Lines use the distance to a clamped
            projection; freehand strokes take the minimum segment distance.
            Repetition uses floor to wrap coordinates.
          </p>
          <h3>Optional shorthand → expand with ƒ=</h3>
          <p>
            Older functions still work. The ƒ= button expands them into editable
            equations without rendering.
          </p>
          <dl>
            <dt>circle(cx, cy, radius)</dt>
            <dd>Drag from center to edge. Negative distance inside.</dd>
            <dt>box(cx, cy, width, height)</dt>
            <dd>Full width and height. Standard signed box distance.</dd>
            <dt>line(x1, y1, x2, y2, thickness)</dt>
            <dd>Segment distance minus half the thickness.</dd>
            <dt>polyline(points([x, y], [x, y], …), thickness)</dt>
            <dd>Minimum distance to all segments. Round caps and joins.</dd>
          </dl>
          <h3>Composition</h3>
          <dl>
            <dt>union(a, b, …) / intersect(a, b, …)</dt>
            <dd>min / max of two or more fields.</dd>
            <dt>subtract(a, b)</dt>
            <dd>max(a, −b): removes b from a.</dd>
            <dt>smoothUnion(a, b, k)</dt>
            <dd>Polynomial smooth minimum. k must be positive.</dd>
          </dl>
          <h3>Transform the input coordinates</h3>
          <dl>
            <dt>translate(dx, dy, shape)</dt>
            <dd>Evaluates shape(x − dx, y − dy).</dd>
            <dt>scale(factor, shape)</dt>
            <dd>Scales about (0, 0); positive factor. Distances scale too.</dd>
            <dt>rotate(radians, shape)</dt>
            <dd>
              Rotates about (0, 0). Positive is clockwise on this y-down canvas.
            </dd>
            <dt>repeat(sx, sy, shape)</dt>
            <dd>
              Tiles a cell centered on (0.5, 0.5). Also accepts
              repeat(spacing(sx, sy), shape). Keep the shape inside its cell for
              seamless repetition.
            </dd>
            <dt>mirrorX(shape) / mirrorY(shape)</dt>
            <dd>Copies the right / bottom half across x = 0.5 / y = 0.5.</dd>
          </dl>
          <p>To rotate around the canvas center:</p>
          <pre>
            translate(0.5, 0.5,{"\n"} rotate(PI / 4,{"\n"} box(0, 0, 0.4, 0.2)
            {"\n"} ){"\n"})
          </pre>
          <h3>Write a mathematical field</h3>
          <pre>{"f(x, y) =\n  abs(y - (0.5 + 0.1 * sin(x * 30))) - 0.01"}</pre>
          <p>
            <code>x, y, PI, E</code> · <code>+ − * / ^</code>
            <br />
            <code>sin cos tan sqrt abs pow min max floor ceil</code>
          </p>
          <p>
            Use <code>^</code> for powers. Expressions can have{" "}
            <code>// comments</code>. Only this mathematical language is
            accepted; JavaScript is never executed. Raw equations and composed
            fields need not be exact distances everywhere.
          </p>
          <h3>Drawing & keyboard</h3>
          <p>
            Select moves pending shapes; Delete removes the selection. Eraser
            subtracts a stroke. Rendering commits a single field; use Undo to
            return to editable strokes. New strokes compose with the committed
            field.
          </p>
          <dl>
            <dt>Ctrl / ⌘ + Enter</dt>
            <dd>Render Function</dd>
            <dt>Ctrl / ⌘ + Z · Ctrl / ⌘ + Shift + Z</dt>
            <dd>Undo / redo drawing when outside the editor.</dd>
            <dt>V · P · L · C · R · E</dt>
            <dd>Select, Pen, Line, Circle, Rectangle, Eraser.</dd>
          </dl>
          <p className="muted">
            Canvas coordinates run from 0 to 1. The square canvas preserves
            their meaning at any display size. Preview is editable geometry;
            final output always evaluates ƒ(x, y). Export PNG becomes available
            after rendering your drawing.
          </p>
        </>
      )}
    </dialog>
  );
}
