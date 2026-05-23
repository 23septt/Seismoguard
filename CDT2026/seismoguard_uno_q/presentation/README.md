# Presentation

3-minute pitch deck for the CDT2026 judging round.

## Files

| File | Use |
|---|---|
| `slides.md` | Source in pandoc-friendly Markdown |
| `README.md` | this file |

## Render to PDF / HTML / pptx

```bash
# HTML reveal.js (recommended for live demo)
pandoc -t revealjs -s slides.md -o slides.html --slide-level=1

# PDF (for handout)
pandoc -t beamer slides.md -o slides.pdf

# PowerPoint (for backup)
pandoc slides.md -o slides.pptx
```

## Speaker notes

- **Time budget**: 3 minutes for the deck, 2 minutes for the live demo,
  ~5 minutes Q&A. Total stage time ≈ 10 minutes.
- Slide 1 (pain): photo of Sagaing damage. ~25 s. Don't dwell — set up
  the stakes and move on.
- Slide 4 (demo flow): switch to the device + dashboard. Run tap test
  first (proves no false alarm). Then shake test (proves real alarm).
- Slide 6 (numbers): hand judges the printed `assets/flowchart.md`.
- Slide 10 (Q&A): keep on screen during questions. Helps the panel
  remember what they wanted to ask.

## Backup video

Pre-record a 90-second screen capture of the dashboard during a clean
demo run. If the live demo fails on stage, play this. Save as
`presentation/backup_demo.mp4` and bring on a USB flash drive.
