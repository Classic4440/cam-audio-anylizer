export const EDITOR_PATH = "/editor";

/** True for `/editor` and `/editor/` (the router may or may not keep the trailing slash). */
export function isEditorPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === EDITOR_PATH;
}
