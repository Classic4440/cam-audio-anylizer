import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  loadIntoEditor,
  pauseEditor,
  setEditorWindowProvider,
  type EditorWindow,
} from "@/lib/editor/bridge";
import { subscribeEditorInbox, takeForEditor } from "@/lib/editor/handoff";
import { isEditorPath } from "./paths";

/** `skipintro=1` is AudioMass's own flag for suppressing its welcome dialog. */
const EDITOR_SRC = "/audiomass/index.html?skipintro=1";

/**
 * Hosts the AudioMass editor in an iframe that stays mounted once opened, so switching to the
 * studio and back never loses the user's waveform, undo history or multitrack session. When the
 * editor tab is not active the frame is hidden (not removed) and its playback is paused.
 */
export function EditorHost() {
  const active = useRouterState({ select: (s) => isEditorPath(s.location.pathname) });
  const [mounted, setMounted] = useState(false);
  const [opened, setOpened] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const booted = useRef(false);

  // The iframe is client-only: rendering it during SSR would let `load` fire before hydration.
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);

  useEffect(() => {
    setEditorWindowProvider(() => (frame.current?.contentWindow as EditorWindow | null) ?? null);
    return () => setEditorWindowProvider(null);
  }, []);

  const deliver = useCallback(() => {
    if (!booted.current) return;
    const file = takeForEditor();
    if (!file) return;
    const win = frame.current?.contentWindow as EditorWindow | null;
    if (loadIntoEditor(win, file)) toast.success(`Opened “${file.name}” in the editor`);
    else toast.error("The editor could not open that audio. Try loading it from the File menu.");
  }, []);

  useEffect(() => subscribeEditorInbox(deliver), [deliver]);

  useEffect(() => {
    if (!opened) return;
    const win = frame.current?.contentWindow as EditorWindow | null;
    if (active) {
      // Hand keyboard focus to the editor so its shortcuts work straight away.
      requestAnimationFrame(() => {
        try {
          frame.current?.focus();
          win?.focus();
        } catch {
          /* focus is best-effort */
        }
      });
    } else {
      pauseEditor(win);
    }
  }, [active, opened]);

  if (!mounted || !opened) return null;

  return (
    <iframe
      ref={frame}
      title="AudioMass audio editor"
      src={EDITOR_SRC}
      allow="microphone; autoplay; clipboard-read; clipboard-write"
      onLoad={() => {
        booted.current = true;
        deliver();
      }}
      className={
        "fixed inset-x-0 z-30 w-full border-0 bg-black " +
        (active ? "" : "pointer-events-none invisible")
      }
      // An <iframe> is a replaced element: top/bottom insets do not stretch it, so the height is explicit.
      style={{ top: "var(--shell-h)", height: "calc(100dvh - var(--shell-h))" }}
    />
  );
}
