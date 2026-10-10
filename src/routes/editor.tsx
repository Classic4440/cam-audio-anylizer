import { createFileRoute } from "@tanstack/react-router";

/**
 * The editor itself is rendered by `EditorHost` in the root layout so it can stay alive while the
 * user visits the studio. This route only exists so `/editor` is a real, linkable URL.
 */
export const Route = createFileRoute("/editor")({
  head: () => ({ meta: [{ title: "Editor · LANES" }] }),
  component: EditorRoute,
});

function EditorRoute() {
  return null;
}
