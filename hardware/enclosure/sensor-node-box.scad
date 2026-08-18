// Sentry Sonar — sensor-node enclosure
// INTERNAL cavity 60 (L) x 30 (W) x 40 (H) mm. Body + snap-fit lid
// (rounded detents on the lip click into pockets in the body walls; a pry
// notch in the rim pops it open by thumbnail).
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
tol = 0.3;         // fit clearance for the lid lip (tighter = less lateral wobble)

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

/* ---- Snap-fit detents (lip beads <-> body wall pockets) + pry notch ---- */
// Two rounded beads on each long lip face click into shallow pockets in the
// body's inner walls. Interference at the pass point = detent_r - tol, so tune
// the snap feel by nudging detent_r (0.8 @ tol 0.3 -> 0.5 mm = firm, pry-open;
// drop to 0.7 if too stiff, raise to 0.9 if it still pops loose). Positions are
// symmetric in X and Y, so the lid latches whichever way it is flipped.
detent_r     = 0.8;        // bead radius = protrusion from the lip face
detent_len   = 6;         // bead length along the wall
detent_below = 2.0;        // bead centre this far below the lid seam
detent_xs    = [22, 42];   // X centres (symmetric about L/2); sit above the vent slits
pocket_depth = 1.0;        // how deep the catch pocket bites into the 2 mm wall
pocket_h     = 2.0;        // pocket height (bead dia 1.6 + clearance)
pocket_over  = 1.0;        // pocket longer than the bead (total) for easy seating

pry_notch    = true;       // scallop in the rim to lift the lid by thumbnail
pry_notch_w  = 12;         // width along Y
pry_notch_d  = 2.5;        // depth down from the rim

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

// Catch pockets in the two long inner walls; the lid beads snap in below the
// pocket's top edge (which forms the pull-out catch). zc matches the lid bead:
//   body-frame z  = body_h - detent_below
//   lid-frame z   = lid_t  + detent_below   (the lid prints flipped)
// so assembled they meet at z = body_h + lid_t - detent_below.
module detent_pockets() {
    zc = body_h - detent_below;
    plen = detent_len + pocket_over;
    for (x = detent_xs) {
        translate([x - plen / 2, wall - pocket_depth, zc - pocket_h / 2])
            cube([plen, pocket_depth + 0.02, pocket_h]);              // -Y wall
        translate([x - plen / 2, W - wall - 0.01, zc - pocket_h / 2])
            cube([plen, pocket_depth + 0.02, pocket_h]);              // +Y wall
    }
}

// Thumbnail scallop in the +X rim (opposite corner from any cabling), just
// outboard of the lip, so a nail slips under the lid edge to pop it.
module pry_cut() {
    translate([L - wall - 0.5, (W - pry_notch_w) / 2, body_h - pry_notch_d])
        cube([wall + 1, pry_notch_w, pry_notch_d + 1]);
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
        detent_pockets();
        if (pry_notch) pry_cut();
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

// Rounded snap beads on the two long lip faces. The lip outer face sits at
// (wall + tol) from the box centre line, so each bead protrudes past the wall
// inner face by (detent_r - tol) -> the interference that has to be pushed over.
module detent_beads() {
    zc = lid_t + detent_below;
    yA = wall + tol;           // -Y lip face
    yB = W - wall - tol;       // +Y lip face
    for (x = detent_xs) {
        translate([x - detent_len / 2, yA, zc]) rotate([0, 90, 0]) cylinder(h = detent_len, r = detent_r);
        translate([x - detent_len / 2, yB, zc]) rotate([0, 90, 0]) cylinder(h = detent_len, r = detent_r);
    }
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
            detent_beads();
        }
        lid_vents();
        radar_window();
    }
}

// ---------------------------------------------------------------- layout
if (part == "body" || part == "all") body();
if (part == "lid"  || part == "all") translate([0, W + 10, 0]) lid();
