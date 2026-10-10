import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AudioWaveform, Layers, ListPlus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isEditorPath } from "@/components/editor/paths";
import { editorHasAudio, exportEditorFile, getEditorWindow } from "@/lib/editor/bridge";
import { sendToStudio, type StudioIntake } from "@/lib/editor/handoff";

const tab =
  "inline-flex h-full items-center gap-2 border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4";
const tabActive = "border-primary text-foreground";

/** Top bar that switches between the analysis studio and the AudioMass waveform editor. */
export function AppNav() {
  const onEditor = useRouterState({ select: (s) => isEditorPath(s.location.pathname) });
  const navigate = useNavigate();
  const [busy, setBusy] = useState<StudioIntake | null>(null);

  const sendBack = async (mode: StudioIntake) => {
    if (busy) return;
    const win = getEditorWindow();
    if (!editorHasAudio(win)) {
      toast.error("Open or record some audio in the editor first.");
      return;
    }
    setBusy(mode);
    try {
      const file = await exportEditorFile(win, "AudioMass edit");
      if (!file) {
        toast.error("The editor has nothing to send yet.");
        return;
      }
      sendToStudio(file, mode);
      await navigate({ to: "/" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-[var(--shell-h)] items-stretch gap-1 border-b border-border bg-card px-2">
      <nav className="flex items-stretch" aria-label="Workspace">
        <Link to="/" activeOptions={{ exact: true }} className={tab} activeProps={{ className: tabActive }}>
          <Layers />
          Studio
        </Link>
        <Link to="/editor" className={tab} activeProps={{ className: tabActive }}>
          <AudioWaveform />
          Editor
        </Link>
      </nav>
      {onEditor ? (
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={busy !== null}
            title="Send the editor's audio to the studio as a new, analysed project"
            onClick={() => void sendBack("analyse")}
          >
            <Send />
            Analyse in Studio
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={busy !== null}
            title="Add the editor's audio to the open studio project as a new track"
            onClick={() => void sendBack("track")}
          >
            <ListPlus />
            Add as track
          </Button>
        </div>
      ) : null}
    </header>
  );
}
