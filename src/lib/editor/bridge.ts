/**
 * Typed, defensive access to the AudioMass editor that runs in the same-origin iframe
 * (`/audiomass/index.html`). AudioMass is plain browser-global JavaScript; everything we rely on is
 * listed in the `*Like` interfaces below, and every function tolerates the editor not being ready.
 */
import { channelsOf, encodeWav } from "../daw/wav.ts";

export interface AudioBufferLike {
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

interface MultitrackLike {
  IsOn?(): boolean;
  HasClips?(): boolean;
  AddFilesAuto?(files: ArrayLike<File>): boolean;
  Mixdown?(selection: [number, number] | null): AudioBufferLike | null;
  MixdownAsync?(
    selection: [number, number] | null,
    done: (buffer: AudioBufferLike | null) => void,
  ): void;
  Pause?(): void;
}

interface EngineLike {
  is_ready?: boolean;
  LoadFile?(input: { files: ArrayLike<File> }): void;
  wavesurfer?: { backend?: { buffer?: AudioBufferLike | null } };
}

export interface EditorApi {
  engine?: EngineLike;
  multitrack?: MultitrackLike | null;
  fireEvent?(name: string, a?: unknown, b?: unknown): unknown;
}

export type EditorWindow = Window & { PKAudioEditor?: EditorApi };

/* ----- the host registers where the iframe lives so other components can reach it ----- */

let windowProvider: (() => EditorWindow | null) | null = null;

export function setEditorWindowProvider(provider: (() => EditorWindow | null) | null): void {
  windowProvider = provider;
}

export function getEditorWindow(): EditorWindow | null {
  try {
    return windowProvider ? windowProvider() : null;
  } catch {
    return null;
  }
}

/* ----------------------------------- access ---------------------------------- */

/** The editor API once AudioMass has finished booting, otherwise `null`. */
export function getEditor(win: EditorWindow | null | undefined): EditorApi | null {
  try {
    const editor = win?.PKAudioEditor;
    return editor && editor.engine ? editor : null;
  } catch {
    return null;
  }
}

function multitrackOn(editor: EditorApi): MultitrackLike | null {
  const mt = editor.multitrack;
  return mt && typeof mt.IsOn === "function" && mt.IsOn() ? mt : null;
}

/** Open a file in the editor. In multitrack mode it lands on the first empty track. */
export function loadIntoEditor(win: EditorWindow | null | undefined, file: File): boolean {
  const editor = getEditor(win);
  if (!editor) return false;
  try {
    const mt = multitrackOn(editor);
    if (mt && typeof mt.AddFilesAuto === "function") return mt.AddFilesAuto([file]) !== false;
    if (typeof editor.engine?.LoadFile !== "function") return false;
    editor.engine.LoadFile({ files: [file] });
    return true;
  } catch {
    return false;
  }
}

/** Is there anything in the editor that could be sent back? */
export function editorHasAudio(win: EditorWindow | null | undefined): boolean {
  const editor = getEditor(win);
  if (!editor) return false;
  const mt = multitrackOn(editor);
  if (mt) return typeof mt.HasClips === "function" ? mt.HasClips() : true;
  return Boolean(editor.engine?.is_ready && editor.engine.wavesurfer?.backend?.buffer);
}

const MIXDOWN_TIMEOUT_MS = 60_000;

/** The audio the editor would export: the multitrack mixdown, or the single-track buffer. */
export async function readEditorBuffer(
  win: EditorWindow | null | undefined,
): Promise<AudioBufferLike | null> {
  const editor = getEditor(win);
  if (!editor) return null;
  try {
    const mt = multitrackOn(editor);
    if (mt) {
      const mixdownAsync = mt.MixdownAsync;
      if (typeof mixdownAsync === "function") {
        return await new Promise<AudioBufferLike | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), MIXDOWN_TIMEOUT_MS);
          mixdownAsync.call(mt, null, (buffer) => {
            clearTimeout(timer);
            resolve(buffer ?? null);
          });
        });
      }
      return typeof mt.Mixdown === "function" ? mt.Mixdown(null) : null;
    }
    if (!editor.engine?.is_ready) return null;
    return editor.engine.wavesurfer?.backend?.buffer ?? null;
  } catch {
    return null;
  }
}

/** Render the editor's audio to a 24-bit WAV `File`, or `null` when there is nothing to send. */
export async function exportEditorFile(
  win: EditorWindow | null | undefined,
  baseName = "AudioMass edit",
): Promise<File | null> {
  const buffer = await readEditorBuffer(win);
  if (!buffer || buffer.numberOfChannels < 1 || buffer.getChannelData(0).length === 0) return null;
  const bytes = encodeWav(channelsOf(buffer), buffer.sampleRate, 24);
  return new File([bytes as BlobPart], `${baseName}.wav`, { type: "audio/wav" });
}

/** Stop editor playback (used when the user leaves the editor tab). */
export function pauseEditor(win: EditorWindow | null | undefined): void {
  const editor = getEditor(win);
  if (!editor) return;
  try {
    const mt = multitrackOn(editor);
    if (mt && typeof mt.Pause === "function") mt.Pause();
    else editor.fireEvent?.("RequestPause");
  } catch {
    /* the editor is mid-load or mid-teardown; nothing to pause */
  }
}
