# Enclosure — 3D-printable case

OpenSCAD source for a two-piece snap-fit demo enclosure. Optimised for
the CDT2026 build day: print on-site if needed (PLA, ~5 hr total on a
Prusa-class printer at 0.2 mm).

## Render STLs

```bash
# Preview
openscad seismoguard_case.scad

# Export STLs
openscad -o case_base.stl -D 'PART="base"' seismoguard_case.scad
openscad -o case_lid.stl  -D 'PART="lid"'  seismoguard_case.scad
```

## Design choices

- **Rigid floor coupling.** Four outer corner holes for M4 bolts to the
  table. Vibration must couple cleanly into the IMU — foam standoffs
  defeat the whole detection chain.
- **UNO Q on the left, three Modulinos in a row on the right.** Cable
  channels between the pockets keep Qwiic links short and tidy.
- **Front face cutouts:** 8 LED windows for the Pixels module, a 2×4
  grille for the Buzzer. Both face the judge by default.
- **USB-C passthrough** on the left wall.

## Tolerances + edits

- `CLEAR = 0.5` mm — increase to 0.7 if your printer over-extrudes.
- `UNOQ_L/W/H`, `MOD_L/W/H` — verify against your actual modules before
  printing; placeholder dimensions in the .scad are from the datasheet
  but tolerance stacking on a snap-fit case bites hard.
- Screw bosses use **M3 self-tapping**. Drill out for M3 inserts if you
  need to reopen the case repeatedly.

## If you don't have a printer

Fallback: laser-cut 3 mm acrylic from the BUILD_DAY.md bag (the kit
allows it). Use the `.scad` dimensions as your template. Cable-tie the
Modulinos to a foamboard base if neither is available — but warn the
judges the vibration coupling will be looser.
