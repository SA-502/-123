<!-- انسخ كل ما تحت هذا السطر والصقه للوكيل (Gemini) -->

# Task: create the environment and UI art for GRAVEWAVE

You are the art agent for **GRAVEWAVE**, a top-down neon synthwave zombie survival browser game. Another agent (Claude) owns all code. Your job is images only.

## Repository
- GitHub: `https://github.com/SA-502/-123`
- Read first: `docs/ART_BRIEF.md` on branch `claude/friendly-goodall-njen4s`. It contains the style rules, the exact list of images, sizes, file names and the manifest format. Follow it exactly.

## Rules
1. Create your own branch **`art/nano-banana`** from `claude/friendly-goodall-njen4s`.
2. Only add or change files inside **`assets/`**, plus your notes in **`docs/ART_NOTES.md`**. Never edit `js/`, `css/`, `index.html`, `server/`, `tools/`, or any other file.
3. Never merge into or push to `claude/friendly-goodall-njen4s` or `main`. Claude reviews your branch and integrates the art.
4. Do not copy art, logos or characters from Call of Duty or any existing game. Original designs only.

## How to work
1. Generate images with **Nano Banana**. Run sub-agents in parallel, one per group: (a) UI, (b) floors, (c) props, (d) machines, (e) cards and icons. Give every sub-agent the full "Style rules" section of the brief so all images match.
2. For every image:
   - Crop and resize to the exact pixel size in the brief.
   - Make prop backgrounds transparent.
   - Make floors tile seamlessly.
   - Compress to ≤ 300 KB.
3. Run the "Self-check" in section 5 of the brief on each file. Regenerate anything that fails, especially perspective (must be straight top-down) and seams.
4. Add each finished file to `assets/manifest.json`.
5. Deliver in the brief's batch order: **Batch 1** (UI + floors) first, then Batch 2, then Batch 3. Push after each batch with a clear commit message, e.g. `Art batch 1: UI and floors`.
6. In `docs/ART_NOTES.md`, list per batch: what was delivered, anything skipped and why, and any style decisions.

## Feedback loop
Claude writes review notes in `docs/ART_REVIEW.md` on branch `claude/friendly-goodall-njen4s`. Before each new batch, read that file and redo any image marked "redo". Keep the same file name so the game picks up the new version.

## Done when
All three batches are on `art/nano-banana`, `assets/manifest.json` lists every file, every file passes the self-check, and the whole `assets/` folder is ≤ 4 MB.
