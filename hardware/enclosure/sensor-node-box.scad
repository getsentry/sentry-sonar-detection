// Sentry Sonar — sensor-node enclosure
// INTERNAL cavity 60 (L) x 30 (W) x 40 (H) mm. Body + drop-in lid.
// Outer size is derived from the wall thickness (see below).
// Vent slits on the long walls and the lid; a 5 mm-tall USB-C opening on one
// short side. Print in PLA or PETG (radar-transparent) — never carbon-fibre /
// metal-filled filament, or the 24 GHz radar won't see out.
//
// Render one part at a time:
//   openscad -D 'part="body"' -o sensor-node-box-body.stl sensor-node-box.scad
//   openscad -D 'part="lid"'  -o sensor-node-box-lid.stl  sensor-node-box.scad

part = "all";      // "body" | "lid" | "all" (all = both, laid out for preview)

/* ---- Internal (usable) cavity, mm ---- */
IL = 60;           // internal length (X)
IW = 30;           // internal width  (Y)
IH = 40;           // internal height (Z), floor to lid underside

/* ---- Shell ---- */
wall = 2;          // side wall thickness
floor_t = 2;       // floor thickness
lid_t = 2;         // lid plate thickness
tol = 0.4;         // fit clearance for the lid lip

/* ---- USB-C opening (on the +X short side) ---- */
usb_w = 22;        // width  (Y) — room for two USB-C connectors side by side
usb_h = 7;         // height (Z) — the USB-C slit (~0.7 cm)
usb_z0 = 0;        // flush with the inner floor (no gap)

/* ---- Vent slits on the two long walls (+/-Y) ---- */
vent_w = 1.0;
vent_h = 26;
vent_n = 6;
vent_end_margin = 9;   // keep slits clear of the short ends

/* ---- Vent slits on the lid (two clusters flanking the radar window) ---- */
lid_vent_w = 1.0;
lid_vent_len = 18;
lid_vent_per_end = 3;
lid_vent_gap = 5;

/* ---- Radar window on the lid (thinned panel; radar antenna faces the lid) ---- */
win_l = 26;        // window length (X)
win_w = 22;        // window width  (Y)
window_t = 1;      // remaining thickness over the window (radar-transparent)

$fn = 48;

/* ---- Derived outer dimensions ---- */
L = IL + 2 * wall;         // outer length -> 64
W = IW + 2 * wall;         // outer width  -> 34
body_h = floor_t + IH;     // outer body height (open top) -> 42
// total outer height = body_h + lid_t -> 44

// ---------------------------------------------------------------- body
module long_wall_vents() {
    step = (L - 2 * vent_end_margin) / (vent_n - 1);
    z0 = (body_h - vent_h) / 2;
    for (i = [0 : vent_n - 1]) {
        x = vent_end_margin + i * step - vent_w / 2;
        translate([x, -1, z0]) cube([vent_w, wall + 2, vent_h]);            // -Y
        translate([x, W - wall - 1, z0]) cube([vent_w, wall + 2, vent_h]);  // +Y
    }
}

module body() {
    difference() {
        cube([L, W, body_h]);
        // hollow interior (open top): exactly IL x IW, full height and above
        translate([wall, wall, floor_t])
            cube([IL, IW, body_h]);
        // USB-C opening on the +X short side
        translate([L - wall - 1, (W - usb_w) / 2, floor_t + usb_z0])
            cube([wall + 2, usb_w, usb_h]);
        long_wall_vents();
    }
}

// ---------------------------------------------------------------- lid
// Vent clusters near each short end (slots run in Y), leaving the centre clear
// for the radar window.
module lid_vents() {
    span = (lid_vent_per_end - 1) * lid_vent_gap + lid_vent_w;
    for (side = [0, 1]) {
        base_x = (side == 0) ? 8 : L - 8 - span;
        for (i = [0 : lid_vent_per_end - 1]) {
            x = base_x + i * lid_vent_gap;
            translate([x, (W - lid_vent_len) / 2, -1])
                cube([lid_vent_w, lid_vent_len, lid_t + 2]);
        }
    }
}

// Radar window: thin the central panel from the interior side so the outer face
// stays flush (and prints support-free). Leaves `window_t` of solid plastic.
module radar_window() {
    translate([(L - win_l) / 2, (W - win_w) / 2, window_t])
        cube([win_l, win_w, lid_t - window_t + 0.01]);
}

module lid() {
    // Printed plate-down with the locating lip pointing UP; flip to assemble.
    lip_out_l = IL - 2 * tol;
    lip_out_w = IW - 2 * tol;
    lip_wall = 1.6;
    lip_h = 3;
    difference() {
        union() {
            cube([L, W, lid_t]);
            translate([(L - lip_out_l) / 2, (W - lip_out_w) / 2, lid_t])
                difference() {
                    cube([lip_out_l, lip_out_w, lip_h]);
                    translate([lip_wall, lip_wall, -1])
                        cube([lip_out_l - 2 * lip_wall, lip_out_w - 2 * lip_wall, lip_h + 2]);
                }
        }
        lid_vents();
        radar_window();
    }
}

// ---------------------------------------------------------------- layout
if (part == "body" || part == "all") body();
if (part == "lid"  || part == "all") translate([0, W + 10, 0]) lid();
