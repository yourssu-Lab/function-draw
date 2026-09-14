import { useCallback, useEffect, useRef, useState } from "react";
import GraphicsCanvas from "./components/GraphicsCanvas";
import FunctionEditor, { type EditorError } from "./components/FunctionEditor";
import Icon from "./components/Icon";
import Reference from "./components/Reference";
import {
  convertToField,
  emptyScene,
  type Scene,
  type Tool,
} from "./drawing/drawing";
import { parse } from "./field/parser";
import { toEquation } from "./field/equation";
import { describeError, type FieldNode, type Point } from "./field/types";
import { rasterize, type RenderMode } from "./render/rasterize";
import { defaultCode, examples } from "./examples";
const STORAGE = "function-native-graphics.code.v1";
const tools: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "pen", label: "Pen", key: "P" },
  { id: "line", label: "Line", key: "L" },
  { id: "circle", label: "Circle", key: "C" },
  { id: "box", label: "Rectangle", key: "R" },
  { id: "eraser", label: "Eraser", key: "E" },
];
function initialCode() {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (!saved) return defaultCode;
    if (/\bf\s*\(\s*x\s*,\s*y\s*\)\s*=/.test(saved)) return saved;
    try {
      return toEquation(parse(saved));
    } catch {
      return saved;
    }
  } catch {
    return defaultCode;
  }
}
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Tree({ node, depth = 0 }: { node: FieldNode; depth?: number }) {
  return (
    <div className="tree-node">
      <span>
        {depth > 0 ? "↳ " : ""}
        {node.kind}
      </span>
      {"children" in node &&
        node.children.map((n, i) => (
          <Tree node={n} key={i} depth={depth + 1} />
        ))}
    </div>
  );
}
export default function App() {
  const [code, setCode] = useState(initialCode),
    [scene, setScene] = useState<Scene>(emptyScene),
    [tool, setTool] = useState<Tool>("select"),
    [thickness, setThickness] = useState(0.012);
  const [past, setPast] = useState<Scene[]>([]),
    [future, setFuture] = useState<Scene[]>([]),
    [convertedScene, setConvertedScene] = useState<Scene | null>(null);
  const [error, setError] = useState<
    (EditorError & { line: number; column: number }) | null
  >(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<RenderMode>("solid"),
    [resolution, setResolution] = useState(512);
  const [grid, setGrid] = useState(false),
    [position, setPosition] = useState<Point | null>(null),
    [cursor, setCursor] = useState([1, 1]);
  const [selectedExample, setSelectedExample] = useState("difference"),
    [inspector, setInspector] = useState(false);
  const [modal, setModal] = useState<"guide" | "about" | null>(null),
    [toast, setToast] = useState(""),
    [filename, setFilename] = useState("untitled.fg");
  const fileInput = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    busyRef = useRef(false);
  const edited = code !== scene.source || mode !== (scene.mode ?? "solid");
  const drawingModified = scene !== convertedScene;
  const notify = (message: string) => setToast(message);
  const commit = useCallback(
    (next: Scene) => {
      setPast((p) => [...p.slice(-29), scene]);
      setFuture([]);
      setScene(next);
    },
    [scene],
  );
  const undo = useCallback(() => {
    if (!past.length || busyRef.current) return;
    setFuture((f) => [scene, ...f]);
    setScene(past.at(-1)!);
    setPast((p) => p.slice(0, -1));
  }, [past, scene]);
  const redo = useCallback(() => {
    if (!future.length || busyRef.current) return;
    setPast((p) => [...p, scene]);
    setScene(future[0]);
    setFuture((f) => f.slice(1));
  }, [future, scene]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, code);
    } catch {
      /* Private mode and full storage must not interrupt editing. */
    }
  }, [code]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const ac = new AbortController();
    let disposed = false;
    controller.current = ac;
    busyRef.current = true;
    setBusy(true);
    const node = parse(defaultCode);
    rasterize(node, 512, "solid", setProgress, ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return;
        const next: Scene = {
          base: node,
          pixels: new ImageData(
            result.pixels as Uint8ClampedArray<ArrayBuffer>,
            512,
            512,
          ),
          elements: [],
          source: defaultCode,
          mode: "solid",
          ms: result.ms,
        };
        setScene(next);
        setConvertedScene(next);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(describeError(e, defaultCode));
      })
      .finally(() => {
        if (!disposed) {
          setBusy(false);
          busyRef.current = false;
        }
      });
    return () => {
      disposed = true;
      ac.abort();
    };
  }, []);
  const render = useCallback(async () => {
    if (busyRef.current) return;
    const source = code;
    let node: FieldNode;
    try {
      node = parse(source);
    } catch (e) {
      setError(describeError(e, source));
      return;
    }
    const ac = new AbortController();
    controller.current = ac;
    busyRef.current = true;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const result = await rasterize(
        node,
        resolution,
        mode,
        setProgress,
        ac.signal,
      );
      const next: Scene = {
        base: node,
        pixels: new ImageData(
          result.pixels as Uint8ClampedArray<ArrayBuffer>,
          resolution,
          resolution,
        ),
        elements: [],
        source,
        mode,
        ms: result.ms,
      };
      commit(next);
      setConvertedScene(next);
      notify("Function rendered · every pixel evaluated.");
    } catch (e) {
      if (!ac.signal.aborted) setError(describeError(e, source));
      else notify("Render cancelled. Previous canvas preserved.");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [code, resolution, mode, commit]);
  const convert = () => {
    try {
      const source = toEquation(convertToField(scene));
      parse(source);
      setCode(source);
      setConvertedScene(scene);
      setError(null);
      setSelectedExample("");
      notify(
        "Drawing converted to one field expression. Render to evaluate it.",
      );
    } catch (e) {
      notify(
        `Unable to convert: ${e instanceof Error ? e.message : "drawing is too complex"}`,
      );
    }
  };
  const expandEquation = () => {
    try {
      setCode(toEquation(parse(code)));
      setError(null);
      notify("Expanded to arithmetic. Press Render to evaluate.");
    } catch (e) {
      setError(describeError(e, code));
    }
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("dialog")) return;
      const editing = target.closest(".cm-editor, input, textarea, select");
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "Enter" &&
        !target.closest(".cm-editor")
      ) {
        e.preventDefault();
        void render();
        return;
      }
      if (editing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = tools.find(
          (t) => t.key.toLowerCase() === e.key.toLowerCase(),
        );
        if (t) setTool(t.id);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [render, undo, redo]);
  const exportPNG = () => {
    if (!scene.pixels) return;
    const c = document.createElement("canvas");
    c.width = c.height = scene.pixels.width;
    c.getContext("2d")!.putImageData(scene.pixels, 0, 0);
    c.toBlob((blob) => {
      if (blob) {
        saveFile(blob, filename.replace(/\.[^.]+$/, "") + ".png");
        notify("PNG exported.");
      } else notify("PNG export failed. Try rendering again.");
    }, "image/png");
  };
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(fg|txt)$/i.test(file.name)) {
      notify("Choose a .fg or .txt function file.");
      return;
    }
    if (file.size > 1000000) {
      notify("Function file is too large. Limit: 1 MB.");
      return;
    }
    try {
      setCode(await file.text());
      setFilename(file.name.replace(/\.txt$/i, ".fg"));
      setError(null);
      setSelectedExample("");
      notify("Function imported. Press Render to evaluate.");
    } catch {
      notify("Could not read this file.");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify("Function copied to clipboard.");
    } catch {
      notify(
        "Clipboard unavailable. Select the function and copy with Ctrl / ⌘ + C.",
      );
    }
  };
  return (
    <>
      <header className="app-header">
        <a
          className="brand"
          href="./"
          aria-label="Function-Native Graphics home"
        >
          <span className="brand-mark">ƒ</span>
          <span>
            Function-Native <b>Graphics</b>
            <small>AN EXPERIMENT IN REPRESENTATION</small>
          </span>
        </a>
        <nav>
          <span className="local-badge">
            <i />
            Browser only
          </span>
          <button onClick={() => setModal("guide")}>
            <Icon name="book" size={16} />
            Reference
          </button>
          <button onClick={() => setModal("about")}>
            About <Icon name="info" size={15} />
          </button>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              THE PLAYGROUND <span> / </span> V 1.0
            </div>
            <h1>A graphic is a function.</h1>
            <p>Draw a shape. Compose a function. Explore the space between.</p>
          </div>
          <div className="equation">
            <span>ƒ(x, y)</span>
            <span className="equation-arrow">→</span>
            <span>distance</span>
            <small>NEGATIVE INSIDE · ZERO AT THE EDGE · POSITIVE OUTSIDE</small>
          </div>
        </section>
        <section className="workspace" aria-label="Graphics playground">
          <section className="panel graphics-panel">
            <div className="panel-title">
              <h2>
                <span>01</span> Graphic Canvas
              </h2>
              <span
                className={`state-label ${drawingModified ? "changed" : ""}`}
              >
                {drawingModified
                  ? "Drawing modified"
                  : scene.elements.length
                    ? "Converted · ready to render"
                    : "Field rendered"}
              </span>
            </div>
            <div className="drawing-toolbar">
              <div className="tools" role="toolbar" aria-label="Drawing tools">
                {tools.map((t) => (
                  <button
                    className={tool === t.id ? "tool active" : "tool"}
                    key={t.id}
                    aria-label={t.label}
                    aria-pressed={tool === t.id}
                    title={`${t.label} (${t.key})`}
                    onClick={() => setTool(t.id)}
                    disabled={busy}
                  >
                    <Icon name={t.id} />
                    <span className="tooltip">
                      {t.label}
                      <kbd>{t.key}</kbd>
                    </span>
                  </button>
                ))}
              </div>
              <div className="toolbar-divider" />
              <div className="history-tools">
                <button
                  className="icon-button"
                  aria-label="Undo drawing"
                  title="Undo drawing (Ctrl/⌘ Z)"
                  onClick={undo}
                  disabled={!past.length || busy}
                >
                  <Icon name="undo" size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Redo drawing"
                  title="Redo drawing (Ctrl/⌘ Shift Z)"
                  onClick={redo}
                  disabled={!future.length || busy}
                >
                  <Icon name="redo" size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Clear canvas"
                  title="Clear canvas"
                  onClick={() => {
                    commit(emptyScene());
                    setConvertedScene(null);
                    notify("Canvas cleared. Undo restores your drawing.");
                  }}
                  disabled={busy || (!scene.base && !scene.elements.length)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
            <div className="canvas-area">
              <GraphicsCanvas
                scene={scene}
                onCommit={commit}
                tool={tool}
                thickness={thickness}
                disabled={busy}
                grid={grid}
                onPosition={setPosition}
              />
              {busy && (
                <div className="render-progress" role="status">
                  <span className="spinner" />
                  Rendering… {Math.round(progress * 100)}%
                  <button onClick={() => controller.current?.abort()}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="canvas-options">
              <label className="grid-control">
                <input
                  type="checkbox"
                  checked={grid}
                  onChange={(e) => setGrid(e.target.checked)}
                />
                <Icon name="grid" size={14} />
                Grid
              </label>
              <label className="stroke-control">
                Stroke{" "}
                <select
                  value={thickness}
                  onChange={(e) => setThickness(Number(e.target.value))}
                  aria-label="Stroke thickness"
                >
                  <option value="0.006">0.006</option>
                  <option value="0.012">0.012</option>
                  <option value="0.024">0.024</option>
                  <option value="0.04">0.040</option>
                </select>
              </label>
              <span className="coordinate">
                {position
                  ? `x ${position[0].toFixed(3)}  y ${position[1].toFixed(3)}`
                  : "x —       y —"}
              </span>
            </div>
            <div className="panel-action">
              <button
                className="convert-button"
                onClick={convert}
                disabled={busy}
              >
                Convert to Function <Icon name="arrow" size={18} />
              </button>
              <span>DRAWING → EXPRESSION</span>
            </div>
          </section>
          <section className="panel editor-panel">
            <div className="panel-title">
              <h2>
                <span>02</span> Equation Editor
              </h2>
              <span className={`state-label ${edited ? "changed" : ""}`}>
                {edited ? "Function modified · not rendered" : "In sync"}
              </span>
            </div>
            <div className="editor-toolbar">
              <span className="file-label">
                <span>ƒ</span>
                {filename}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Expand to equation"
                  title="Expand all shapes and operations to arithmetic"
                  onClick={expandEquation}
                >
                  ƒ=
                </button>
                <button
                  className="icon-button"
                  aria-label="Import function"
                  title="Import .fg or .txt"
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon name="upload" size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Copy Function"
                  title="Copy Function"
                  onClick={() => void copy()}
                >
                  <Icon name="copy" size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Save Function"
                  title="Save Function (.fg)"
                  onClick={() => {
                    saveFile(
                      new Blob([code], { type: "text/plain;charset=utf-8" }),
                      filename,
                    );
                    notify("Function saved as plain text.");
                  }}
                >
                  <Icon name="download" size={16} />
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".fg,.txt"
                hidden
                onChange={(e) => void importFile(e)}
              />
            </div>
            <div className="editor-body">
              <FunctionEditor
                value={code}
                onChange={(s) => {
                  setCode(s);
                  setError(null);
                }}
                onRender={() => void render()}
                error={error}
                onCursor={(line, col) => setCursor([line, col])}
              />
              {error && (
                <div className="error-message" role="alert">
                  <Icon name="info" size={17} />
                  <span>
                    <strong>
                      Line {error.line}, column {error.column}
                    </strong>
                    {error.message}
                    <small>Previous canvas preserved.</small>
                  </span>
                </div>
              )}
              <div className="editor-bottom">
                <button
                  className="structure-toggle"
                  onClick={() => setInspector(!inspector)}
                  aria-expanded={inspector}
                >
                  <Icon name="chevron" size={14} />
                  <span>Function structure</span>
                  <small>LAST RENDER</small>
                </button>
                {inspector && (
                  <div className="structure-tree">
                    {scene.base && <Tree node={scene.base} />}
                  </div>
                )}
                <div className="field-reminder">
                  <span>ƒ</span>
                  <p>
                    One expression. Every point in space.
                    <small>Each pixel evaluates this function at (x, y).</small>
                  </p>
                </div>
              </div>
            </div>
            <div className="editor-options">
              <label>
                <input
                  type="checkbox"
                  checked={mode === "field"}
                  onChange={(e) =>
                    setMode(e.target.checked ? "field" : "solid")
                  }
                />
                Show field <span className="muted">· on render</span>
              </label>
              <span>
                Ln {cursor[0]}, Col {cursor[1]}
              </span>
              <select
                aria-label="Render resolution"
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value))}
              >
                <option value="256">Draft · 256²</option>
                <option value="512">Standard · 512²</option>
                <option value="768">Fine · 768²</option>
              </select>
            </div>
            <div className="panel-action">
              <button
                className="render-button"
                onClick={() => void render()}
                disabled={busy}
              >
                <Icon name="left" size={18} />
                {busy ? "Rendering…" : "Render Function"}
                <kbd>⌘ / Ctrl ↵</kbd>
              </button>
              <span>EXPRESSION → SAMPLED FIELD</span>
            </div>
          </section>
        </section>
        <div className="workspace-foot">
          <span>
            <i className="status-dot" />
            {busy
              ? "Evaluating field…"
              : scene.ms === undefined
                ? "Ready"
                : `${scene.pixels?.width ?? 512} × ${scene.pixels?.width ?? 512} samples · ${(scene.ms / 1000).toFixed(2)} s`}
            <span className="foot-separator">/</span>Manual conversion. Always.
          </span>
          <button
            onClick={exportPNG}
            disabled={!scene.pixels || scene.elements.length > 0 || busy}
            title={
              scene.elements.length
                ? "Convert and render pending drawing before export"
                : "Export the displayed raster as PNG"
            }
          >
            <Icon name="download" size={14} />
            Export PNG
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <section className="examples-section">
          <div className="section-heading">
            <div>
              <h2>Start with a function</h2>
              <p>A few small expressions. A different way to see graphics.</p>
            </div>
            <span>
              LOAD AN EXAMPLE, THEN RENDER <Icon name="arrow" size={14} />
            </span>
          </div>
          <div className="example-grid">
            {examples.map((ex, i) => (
              <button
                key={ex.id}
                className={`example-card ${selectedExample === ex.id ? "selected" : ""}`}
                onClick={() => {
                  setCode(ex.code);
                  setSelectedExample(ex.id);
                  setError(null);
                  notify(`${ex.name} loaded. Press Render to evaluate.`);
                }}
              >
                <div
                  className={`example-symbol symbol-${ex.id}`}
                  aria-hidden="true"
                >
                  {ex.id === "wave" ? (
                    "∿"
                  ) : ex.id === "pattern" ? (
                    "▧"
                  ) : ex.id === "repetition" ? (
                    Array.from({ length: 9 }, (_, i) => <i key={i} />)
                  ) : (
                    <>
                      <i />
                      <i />
                    </>
                  )}
                </div>
                <div className="example-meta">
                  <span>
                    {String(i + 1).padStart(2, "0")} / {ex.tag}
                  </span>
                  <h3>{ex.name}</h3>
                </div>
                <Icon name="arrow" size={14} />
              </button>
            ))}
          </div>
        </section>
        <footer>
          <span>
            FUNCTION-NATIVE GRAPHICS <b> / </b> A SMALL GRAPHICS RESEARCH TOOL
          </span>
          <span>
            Graphic = <i>ƒ(x, y)</i>
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={16} />
          {toast}
        </div>
      )}
      {modal && <Reference tab={modal} onClose={() => setModal(null)} />}
    </>
  );
}
