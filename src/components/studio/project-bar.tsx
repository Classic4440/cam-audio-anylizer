import { useNavigate } from "@tanstack/react-router";
import { AudioWaveform, Download, FilePlus2, FolderOpen, Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Controller } from "@/lib/daw/controller";
import { sendToEditor } from "@/lib/editor/handoff";
import { formatSaved, useControllerState, useProjectState } from "./use-studio";

export function ProjectBar({ controller, onOpen }: { controller: Controller; onOpen: () => void }) {
  const ps = useProjectState(controller);
  const cs = useControllerState(controller);
  const project = ps.project!;
  const [name, setName] = useState(project.name);
  const [exportOpen, setExportOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => setName(project.name), [project.name]);

  const commitName = () => {
    if (name.trim() && name.trim() !== project.name) controller.renameProject(name);
    else setName(project.name);
  };
  const editMix = async () => {
    const file = await controller.renderMixFile();
    if (!file) return;
    sendToEditor(file);
    await navigate({ to: "/editor" });
  };
  const run = (fn: () => void | Promise<void>) => () => {
    setExportOpen(false);
    void fn();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <p className="font-display text-sm font-semibold tracking-tight">LANES</p>
      <input
        value={name}
        maxLength={80}
        aria-label="Project name"
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-44 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-foreground outline-none hover:border-border focus:border-primary"
      />
      <span className={"text-xs " + (cs.saveError ? "text-destructive" : "text-muted-foreground")} role="status">
        {cs.saveError ? "Could not save" : formatSaved(ps.lastSavedAt, ps.dirty)}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="ghost" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!ps.canUndo} onClick={() => controller.store.undo()}>
          <Undo2 className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!ps.canRedo} onClick={() => controller.store.redo()}>
          <Redo2 className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" title="New project" onClick={() => void controller.closeProject()}>
          <FilePlus2 className="size-4" />
          New
        </Button>
        <Button type="button" size="sm" variant="ghost" title="Open a saved project" onClick={onOpen}>
          <FolderOpen className="size-4" />
          Open
        </Button>
        <Button type="button" size="sm" variant="ghost" title="Save now (Ctrl+S)" onClick={() => void controller.saveNow()}>
          <Save className="size-4" />
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title="Save a copy under a new name"
          onClick={() => {
            const n = window.prompt("Save a copy as:", `${project.name} copy`);
            if (n && n.trim()) void controller.saveAs(n);
          }}
        >
          Save as…
        </Button>
        <Button type="button" size="sm" variant="ghost" title="Bounce the mix and open it in the waveform editor" onClick={() => void editMix()}>
          <AudioWaveform className="size-4" />
          Edit mix
        </Button>
        <div className="relative">
          <Button type="button" size="sm" variant="secondary" aria-expanded={exportOpen} onClick={() => setExportOpen((o) => !o)}>
            <Download className="size-4" />
            Export
          </Button>
          {exportOpen ? (
            <div role="menu" className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-md border border-border bg-card shadow-lg">
              <Item onClick={run(() => controller.exportMixWav())} title="Mix to WAV" hint="Bounces everything you hear" />
              <Item onClick={run(() => controller.exportTrackWavs())} title="Each audio track to WAV" hint="Stems and imports, one file each" />
              <Item onClick={run(() => controller.exportSelectionWav())} disabled={ps.selection.length === 0} title="Selected clips to WAV" hint={ps.selection.length ? `${ps.selection.length} selected` : "Select clips first"} />
              <Item onClick={run(() => controller.exportMidiFile())} title="MIDI file" hint="Drums, bass, chords and MIDI tracks" />
              <Item onClick={run(() => controller.exportProjectFile())} title="Project file (.lanes.json)" hint="Edits and analysis, without audio" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Item({ title, hint, onClick, disabled }: { title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className="block w-full px-3 py-2 text-left hover:bg-secondary disabled:opacity-40">
      <span className="block text-sm text-foreground">{title}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
