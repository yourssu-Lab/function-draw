import { useEffect, useRef } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { setDiagnostics } from "@codemirror/lint";
const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)) return "number";
    if (stream.match(/\b(?:sin|cos|tan|sqrt|abs|pow|min|max|floor|ceil)\b/))
      return "keyword";
    if (stream.match(/[A-Za-z_][\w]*/)) return "variableName";
    stream.next();
    return null;
  },
});
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", background: "#fff" },
  ".cm-scroller": {
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    lineHeight: "1.9",
    overflow: "auto",
  },
  ".cm-content": { padding: "22px 0", caretColor: "#111" },
  ".cm-line": { padding: "0 18px 0 12px" },
  ".cm-gutters": {
    background: "#fff",
    color: "#b2b2ad",
    border: "none",
    minWidth: "44px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  ".cm-activeLine": { background: "#f6f6f3" },
  ".cm-activeLineGutter": { background: "#f6f6f3", color: "#333" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "#deded8",
  },
  ".cm-matchingBracket": {
    background: "#deded8!important",
    outline: "1px solid #aaa",
  },
  ".cm-diagnostic-error": { borderLeft: "3px solid #222" },
  ".cm-lintRange-error": { textDecoration: "underline wavy #777" },
});
export type EditorError = { message: string; pos: number } | null;
export default function FunctionEditor({
  value,
  onChange,
  onRender,
  error,
  onCursor,
}: {
  value: string;
  onChange: (s: string) => void;
  onRender: () => void;
  error: EditorError;
  onCursor: (line: number, col: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onRender, onCursor });
  callbacks.current = { onChange, onRender, onCursor };
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          language,
          theme,
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.keyword, color: "#272725", fontWeight: "600" },
              { tag: tags.number, color: "#77776f" },
              { tag: tags.variableName, color: "#333", fontStyle: "italic" },
              { tag: tags.comment, color: "#96968d", fontStyle: "italic" },
            ]),
          ),
          EditorView.contentAttributes.of({
            "aria-label": "Function code",
            spellcheck: "false",
          }),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  callbacks.current.onRender();
                  return true;
                },
              },
              indentWithTab,
            ]),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const pos = update.state.selection.main.head,
                line = update.state.doc.lineAt(pos);
              callbacks.current.onCursor(line.number, pos - line.from + 1);
            }
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; updates below preserve selection and history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const e = view.current;
    if (e && value !== e.state.doc.toString())
      e.dispatch({
        changes: { from: 0, to: e.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    const e = view.current;
    if (e) {
      const from = Math.min(error?.pos ?? 0, e.state.doc.length);
      e.dispatch(
        setDiagnostics(
          e.state,
          error
            ? [
                {
                  from,
                  to: Math.min(from + 1, e.state.doc.length),
                  severity: "error",
                  message: error.message,
                },
              ]
            : [],
        ),
      );
    }
  }, [error]);
  return <div className="function-editor" ref={host} />;
}
