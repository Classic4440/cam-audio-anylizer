import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IdleScreen({
  onFiles,
  onDemo,
  onBlank,
  onOpenProjects,
  recent,
  onOpenRecent,
  busy,
}: {
  onFiles: (files: FileList | File[]) => void;
  onDemo: () => void;
  onBlank: () => void;
  onOpenProjects: () => void;
  recent: { id: string; name: string; updatedAt: number }[];
  onOpenRecent: (id: string) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <p className="font-display text-lg font-semibold tracking-tight">LANES</p>
        <p className="hidden text-xs text-muted-foreground sm:block">Producer playlist</p>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-16 md:px-10">
        <div className="stagger-in max-w-xl">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Audio analyzer
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
            Drop a track. Watch the arrangement write itself.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Kicks, snares, hats, bass, vocals, and chords laid out on a studio playlist — with BPM,
            key, and a moving playhead.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" />
              Upload audio
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onDemo}>
              Play studio demo
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onBlank}>
              Empty project
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onOpenProjects}>
              Open project
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {recent.length ? (
          <div className="mt-8 max-w-xl">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent projects</p>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {recent.slice(0, 4).map((r) => (
                <li key={r.id}>
                  <button type="button" disabled={busy} onClick={() => onOpenRecent(r.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-secondary disabled:opacity-50">
                    <span className="truncate text-sm text-foreground">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.updatedAt).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <MiniPlaylist />
      </main>
    </div>
  );
}

function MiniPlaylist() {
  return (
    <div
      className="relative mt-14 overflow-hidden rounded-xl border border-border bg-card p-4 md:p-5"
      aria-hidden="true"
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Playlist</span>
        <span className="font-mono tabular-nums">120.0 BPM · A minor</span>
      </div>
      <div className="relative space-y-2">
        <Lane color="var(--lane-kick)" label="Kick" blocks={[0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5]} w={7} />
        <Lane color="var(--lane-snare)" label="Snare" blocks={[12.5, 37.5, 62.5, 87.5]} w={8} />
        <Lane
          color="var(--lane-hats)"
          label="Hats"
          blocks={[0, 6, 12.5, 18, 25, 31, 37.5, 44, 50, 56, 62.5, 69, 75, 81, 87.5, 94]}
          w={3}
        />
        <Lane color="var(--lane-bass)" label="Bass" blocks={[0, 25, 50, 75]} w={22} />
        <Lane color="var(--lane-vocals)" label="Vocals" blocks={[25, 50, 62]} w={18} />
        <Lane color="var(--lane-chords)" label="Chords" blocks={[0, 25, 50, 75]} w={23} labels={["Am", "F", "C", "G"]} />
        <span className="idle-playhead pointer-events-none absolute top-0 bottom-0 left-16 w-px bg-playhead" />
      </div>
    </div>
  );
}

function Lane({
  color,
  label,
  blocks,
  w,
  labels,
}: {
  color: string;
  label: string;
  blocks: number[];
  w: number;
  labels?: string[];
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="relative h-8 flex-1 rounded-sm bg-background">
        {blocks.map((left, i) => (
          <span
            key={`${label}-${left}`}
            className="absolute top-1.5 bottom-1.5 rounded-sm"
            style={{ left: `${left}%`, width: `${w}%`, background: color, opacity: 0.85 }}
          >
            {labels?.[i] ? (
              <span className="absolute inset-0 flex items-center justify-center font-display text-xs font-semibold text-background">
                {labels[i]}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
