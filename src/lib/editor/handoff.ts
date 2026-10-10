/**
 * A tiny mailbox for moving audio between the LANES studio and the embedded AudioMass editor.
 *
 * The two screens are different routes, so only one of them is mounted at a time on the studio
 * side. The sender drops a file here, navigates, and whichever side wakes up picks it up. Module
 * state survives client-side navigation, which is exactly the lifetime we need.
 */

/** How the studio should take audio that came from the editor. */
export type StudioIntake = "analyse" | "track";

export interface StudioDelivery {
  file: File;
  mode: StudioIntake;
}

type Listener = () => void;

let toEditor: File | null = null;
let toStudio: StudioDelivery | null = null;
const editorListeners = new Set<Listener>();

/** Studio → editor. Wakes the editor host if it is already running, otherwise waits for it. */
export function sendToEditor(file: File): void {
  toEditor = file;
  for (const listener of [...editorListeners]) listener();
}

/** Editor side: take the waiting file (if any) and clear the slot. */
export function takeForEditor(): File | null {
  const file = toEditor;
  toEditor = null;
  return file;
}

/** Editor side: be told when something new is waiting. Returns the unsubscribe function. */
export function subscribeEditorInbox(listener: Listener): () => void {
  editorListeners.add(listener);
  return () => {
    editorListeners.delete(listener);
  };
}

/** Editor → studio. The studio takes it when it next mounts. */
export function sendToStudio(file: File, mode: StudioIntake): void {
  toStudio = { file, mode };
}

/** Studio side: take the waiting delivery (if any) and clear the slot. */
export function takeForStudio(): StudioDelivery | null {
  const delivery = toStudio;
  toStudio = null;
  return delivery;
}
