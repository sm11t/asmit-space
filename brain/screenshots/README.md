# Brain — screenshot drop-zone

The `/brain` page (asmit.space/brain) references four image files in this folder. Drop PNGs/JPGs with these exact filenames and they will wire up automatically. If a file is missing, the page falls back to a placeholder label — no broken images.

## Required files

| Filename | Shown as | What to capture |
|---|---|---|
| `graph.png` | Hero "Graph View" feature block | **Full vault graph.** Open Obsidian → Graph view (Ctrl/Cmd+G). Zoom out so every cluster is visible. Turn on "Group by tag" or "Group by folder" so colors pop. Dark theme. Let the simulation settle before capturing. |
| `local-graph.png` | Screenshots grid — "Local graph" | **Local graph of a single well-connected note.** Open a company or person note (e.g. `TraqCheck.md`, `Anthropic.md`, or a central MOC), then open Local Graph pane (Ctrl/Cmd+P → "Open local graph"). Set depth to 2. Shows the note's immediate neighborhood — exactly the slice the agent walks during retrieval. |
| `moc.png` | Screenshots grid — "Map of Content" | **A rendered MOC note.** Open something like `AI-Agents-MOC.md`, `People-MOC.md`, or any `maps/` file. Preview mode (not edit). Show the curated list of wikilinks as a human table of contents. Backlinks panel open in the sidebar is a bonus. |
| `backlinks.png` | Screenshots grid — "Backlinks" | **Backlinks panel showing 5+ references.** Open a heavily-referenced note (a central person, company, or MOC) and open the Backlinks pane in the right sidebar. Ideally capture both the note and the backlinks panel side-by-side, so the viewer understands the bidirectional mesh. |

## Tips

- **Size:** 1920×1200 or similar 16:10 works best. PNG recommended. Keep each file under 500KB if possible — use a compressor like Squoosh.
- **Theme:** Keep Obsidian on a dark theme so screenshots match the razer styling of the page. Solarized Dark / Obsidian default / Minimal Dark all work.
- **Crop:** Trim OS chrome (menu bars, dock). A clean rectangle of the app itself looks best.
- **Sensitive content:** If a note contains private notes you don't want on the public page, either redact them in the screenshot, or open a different note first.

After dropping files here, hard-refresh `/brain` in the browser (Cmd/Ctrl+Shift+R) to bust cache.
