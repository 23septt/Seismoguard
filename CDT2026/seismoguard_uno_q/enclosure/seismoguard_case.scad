// seismoguard_case.scad — UNO Q + Modulino enclosure for CDT2026 demo
//
// Two-piece snap-fit case:
//   - Base tray: holds UNO Q + Modulino Movement (rigidly bolted to floor
//     so vibration couples cleanly into the IMU). Cable channels for Qwiic.
//   - Lid: cutouts for Pixels (8 LEDs visible from front) + Buzzer (grille)
//     + USB-C passthrough.
//
// Print:
//   - PLA, 0.2 mm layers, 20% infill, no supports needed.
//   - Print time: ~3 hr base + ~2 hr lid on a Prusa MK4-class printer.
//
// Render: openscad -o case_base.stl -D 'PART="base"' seismoguard_case.scad
//         openscad -o case_lid.stl  -D 'PART="lid"'  seismoguard_case.scad
//         openscad seismoguard_case.scad        // preview both

PART = "all";        // "base" | "lid" | "all"

// ── Dimensions (mm) ──────────────────────────────────────────────────
$fn = 64;

// UNO Q board footprint (datasheet: 68.6 x 53.4 x ~16 mm w/ headers)
UNOQ_L  = 70;
UNOQ_W  = 55;
UNOQ_H  = 18;

// Modulino footprint (datasheet: 30 x 22 mm typical)
MOD_L   = 32;
MOD_W   = 24;
MOD_H   = 12;

// Wall + tolerances
WALL    = 2.5;
CLEAR   = 0.5;       // fit clearance between board and pocket
FOOT    = 4;         // standoff height for boards
PIX_HOLE = 5;        // diameter of each LED window

// Overall case
CASE_L = UNOQ_L + 2*WALL + 2*CLEAR + 3*MOD_L + 30;   // room for 3 Modulinos
CASE_W = max(UNOQ_W, MOD_W) + 2*WALL + 2*CLEAR;
CASE_H = max(UNOQ_H, MOD_H) + FOOT + WALL + 4;

// ── Helpers ──────────────────────────────────────────────────────────
module board_pocket(l, w, h) {
    translate([0, 0, FOOT])
        cube([l + 2*CLEAR, w + 2*CLEAR, h + 1]);
}

module floor_screw_post(x, y) {
    translate([x, y, 0]) {
        cylinder(d = 6, h = FOOT);
        cylinder(d = 3, h = FOOT + 4);   // M3 self-tap pilot
    }
}

// ── BASE: tray with UNO Q + Modulino pockets ─────────────────────────
module base() {
    difference() {
        // Outer shell
        cube([CASE_L, CASE_W, CASE_H - 6]);
        // UNO Q pocket (left side)
        translate([WALL, WALL, 0]) board_pocket(UNOQ_L, UNOQ_W, UNOQ_H);
        // 3x Modulino pockets in a row (right side)
        for (i = [0:2]) {
            translate([WALL + UNOQ_L + 2*CLEAR + 10 + i*(MOD_L + 2),
                       WALL + (UNOQ_W - MOD_W)/2,
                       0])
                board_pocket(MOD_L, MOD_W, MOD_H);
        }
        // Cable channels between pockets (10 mm wide, full case height)
        for (i = [0:2]) {
            translate([WALL + UNOQ_L + 2*CLEAR + 2 + i*(MOD_L + 2),
                       CASE_W/2 - 5,
                       FOOT])
                cube([6, 10, CASE_H]);
        }
        // USB-C passthrough on left wall
        translate([-1, CASE_W/2 - 6, FOOT + UNOQ_H/2 - 3])
            cube([WALL + 2, 12, 5]);
    }
    // Mounting bosses for UNO Q (M3 self-tap, ~58x49 hole spacing — check actual)
    translate([WALL, WALL, 0]) {
        floor_screw_post(3,  3);
        floor_screw_post(UNOQ_L - 3, 3);
        floor_screw_post(3,  UNOQ_W - 3);
        floor_screw_post(UNOQ_L - 3, UNOQ_W - 3);
    }
    // Floor mount: 4 outer-corner holes for tabletop bolts (vibration coupling)
    for (xy = [[5, 5], [CASE_L-5, 5], [5, CASE_W-5], [CASE_L-5, CASE_W-5]])
        translate([xy[0], xy[1], 0])
            difference() {
                cylinder(d = 9, h = 3);
                translate([0,0,-0.1]) cylinder(d = 4, h = 4);
            }
}

// ── LID: snaps onto base, cutouts for Pixels + Buzzer ────────────────
module lid() {
    difference() {
        cube([CASE_L, CASE_W, 6]);
        // Pixels LED window: 8 round holes in a row, above the 2nd Modulino
        for (i = [0:7]) {
            translate([WALL + UNOQ_L + 2*CLEAR + 10 + MOD_L + 2 + i*3.5,
                       CASE_W/2,
                       -1])
                cylinder(d = PIX_HOLE - 1.5, h = 8);
        }
        // Buzzer grille: small holes in a grid above the 1st Modulino
        for (xi = [0:3]) for (yi = [0:1]) {
            translate([WALL + UNOQ_L + 2*CLEAR + 14 + xi*4,
                       CASE_W/2 - 4 + yi*4,
                       -1])
                cylinder(d = 2.5, h = 8);
        }
        // Status label slot (engrave): "SeismoGuard EEW"
        translate([WALL + 3, CASE_W/2 + 8, 5])
            linear_extrude(2)
                text("SeismoGuard EEW", size = 4, font = "Liberation Sans");
    }
    // Snap-fit lips (corners)
    for (xy = [[2, 2], [CASE_L-3, 2], [2, CASE_W-3], [CASE_L-3, CASE_W-3]])
        translate([xy[0], xy[1], -3])
            cube([1, 1, 3]);
}

// ── Render ────────────────────────────────────────────────────────────
if (PART == "base" || PART == "all") base();
if (PART == "lid"  || PART == "all") translate([0, CASE_W + 10, 0]) lid();
