"""
Build every Afromoly 3D asset from scratch and export it as glTF.

Run it through Blender, never as a plain Python script:

    blender --background --factory-startup --python build_models.py -- \
        --glb ../../apps/web/public/models --blend .

Or just use ./export.sh, which finds Blender for you.

Everything here is modelled procedurally from primitives, so the .blend files
are outputs rather than hand-edited sources: re-running this script reproduces
them exactly. Edit the script, not the .blend.
"""

import argparse
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geometry as G  # noqa: E402
import palette as P  # noqa: E402
import diorama as D  # noqa: E402


# --------------------------------------------------------------------------- #
# Blender helpers                                                             #
# --------------------------------------------------------------------------- #

_materials = {}


def reset_scene():
    """Start a new empty file, and drop the material cache with it.

    Reading a fresh file frees every datablock, so a cached Material from the
    previous asset is a dangling reference the moment it is touched.
    """
    _materials.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, colour, *, metallic=0.0, roughness=0.6, glow=0.0):
    """A Principled material. `glow` adds self-illumination in the base colour,
    which keeps the corridor bands saturated however the scene is lit."""
    key = (name, colour, metallic, roughness, glow)
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if glow > 0:
            bsdf.inputs["Emission Color"].default_value = (*colour, 1.0)
            bsdf.inputs["Emission Strength"].default_value = glow
    _materials[key] = mat
    return mat


def box(name, location, size, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(mat)
    return ob


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, location=location, rotation=rotation
    )
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def cone(name, location, r1, r2, depth, mat, rotation=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=depth, location=location, rotation=rotation
    )
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def sphere(name, location, radius, mat, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=location
    )
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def shade_smooth(ob):
    """Smooth every face.

    Only ever use this on spheres. On a low-poly cylinder or cone it rounds the
    flat end caps away and the shape reads as a blob, which is exactly what
    happened to the coin and the megaphone the first time round.
    """
    for poly in ob.data.polygons:
        poly.use_smooth = True


def shade_smooth_sides(ob, angle_degrees=40.0):
    """Smooth the curved sides of a cylinder or cone but keep its caps flat.

    Auto-smooth does this by angle. Where it is unavailable, fall back to the
    fact that a cylinder's sides are quads and its end caps are n-gons.
    """
    bpy.context.view_layer.objects.active = ob
    if hasattr(bpy.ops.object, "shade_auto_smooth"):
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_degrees))
            return
        except RuntimeError:
            pass
    for poly in ob.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4


def bevel(ob, width=0.02, segments=2):
    mod = ob.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"


def export(name, glb_dir, blend_dir):
    """Save the current scene as one .blend and one .glb."""
    os.makedirs(glb_dir, exist_ok=True)
    os.makedirs(blend_dir, exist_ok=True)
    blend_path = os.path.join(os.path.abspath(blend_dir), f"{name}.blend")
    glb_path = os.path.join(os.path.abspath(glb_dir), f"{name}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
    )
    size = os.path.getsize(glb_path)
    print(f"  wrote {name}.glb ({size // 1024} KB) and {name}.blend")


# --------------------------------------------------------------------------- #
# The board                                                                    #
# --------------------------------------------------------------------------- #

def build_board():
    reset_scene()
    base = material("BoardBase", P.BOARD_BASE, roughness=0.85)
    face = material("TileFace", P.TILE_FACE, roughness=0.8)
    corner_face = material("CornerFace", P.CORNER_FACE, roughness=0.8)
    hub = material("HubBand", P.HUB, roughness=0.5, glow=0.45)
    utility = material("UtilityBand", P.UTILITY, roughness=0.5, glow=0.45)
    rim = material("BoardRim", P.OCHRE, metallic=0.2, roughness=0.45, glow=0.12)
    group_mats = {
        key: material(f"Group_{key}", colour, roughness=0.5, glow=0.45)
        for key, colour in P.GROUPS.items()
    }

    slab = box(
        "board_base",
        (0, 0, -G.BOARD_THICKNESS / 2),
        (2 * G.HALF, 2 * G.HALF, G.BOARD_THICKNESS),
        base,
    )
    bevel(slab, width=0.06)

    # A thin ochre lip around the outside, so the board reads as an object.
    lip = 0.18
    for sign in (1, -1):
        box("board_rim_x", (sign * (G.HALF + lip / 2), 0, -0.12),
            (lip, 2 * G.HALF + 2 * lip, 0.26), rim)
        box("board_rim_y", (0, sign * (G.HALF + lip / 2), -0.12),
            (2 * G.HALF + 2 * lip, lip, 0.26), rim)

    for index in range(40):
        x, y, sx, sy = G.tile_transform(index)
        is_corner = index in G.CORNERS
        pad = box(
            f"tile_{index:02d}",
            (x, y, G.TILE_RISE / 2),
            (sx - 0.06, sy - 0.06, G.TILE_RISE),
            corner_face if is_corner else face,
        )
        bevel(pad, width=0.02, segments=1)

        band = G.band_transform(index)
        if band is None:
            continue
        group = P.TILE_GROUPS.get(index)
        if group:
            band_mat = group_mats[group]
        elif index in P.HUB_TILES:
            band_mat = hub
        elif index in P.UTILITY_TILES:
            band_mat = utility
        else:
            continue
        bx, by, bsx, bsy = band
        box(
            f"band_{index:02d}",
            (bx, by, G.TILE_RISE + 0.02),
            (bsx - 0.06, bsy - 0.06, 0.05),
            band_mat,
        )

    # The centre well, where the decks and the rank pot sit.
    well = box("centre_well", (0, 0, 0.01),
               (2 * (G.HALF - G.DEPTH) - 0.4, 2 * (G.HALF - G.DEPTH) - 0.4, 0.02), base)
    bevel(well, width=0.04, segments=1)
    return "board"


# --------------------------------------------------------------------------- #
# Development pieces                                                           #
# --------------------------------------------------------------------------- #

def minibus(prefix, body_colour, scale=1.0, plate_colour=None):
    """A high-roof Toyota Quantum, the shape the whole game is built around."""
    body_mat = material(f"{prefix}Body", body_colour, metallic=0.15, roughness=0.4)
    glass_mat = material(f"{prefix}Glass", P.GLASS, metallic=0.35, roughness=0.2)
    rubber_mat = material(f"{prefix}Rubber", P.RUBBER, roughness=0.9)
    trim_mat = material(f"{prefix}Trim", plate_colour or P.OCHRE, metallic=0.3, roughness=0.4)

    s = scale
    rail_mat = material(f"{prefix}Rail", P.DARK_METAL, metallic=0.5, roughness=0.45)

    body = box(f"{prefix}_body", (0, 0, 0.42 * s), (1.55 * s, 0.78 * s, 0.62 * s), body_mat)
    bevel(body, width=0.05 * s, segments=2)
    # The high roof is what makes a Quantum a Quantum. Keep it in body colour
    # and narrower than the body, so it reads as a raised roof and not a lid.
    roof = box(f"{prefix}_roof", (0.02 * s, 0, 0.82 * s), (1.16 * s, 0.68 * s, 0.22 * s), body_mat)
    bevel(roof, width=0.04 * s, segments=2)
    # The carrier is two thin rails, the way they actually sit on a rank van.
    for side in (1, -1):
        box(f"{prefix}_carrier_rail", (0.02 * s, side * 0.26 * s, 0.945 * s),
            (1.00 * s, 0.05 * s, 0.035 * s), rail_mat)

    # Glazing sits in the upper third only, leaving the flank in body colour.
    box(f"{prefix}_screen", (0.76 * s, 0, 0.62 * s), (0.08 * s, 0.62 * s, 0.24 * s), glass_mat)
    for side in (1, -1):
        box(f"{prefix}_side_glass", (0.02 * s, side * 0.395 * s, 0.62 * s),
            (1.00 * s, 0.02 * s, 0.20 * s), glass_mat)

    # A sliding-door stripe low down each flank.
    for side in (1, -1):
        box(f"{prefix}_stripe", (0, side * 0.395 * s, 0.26 * s),
            (1.42 * s, 0.015 * s, 0.07 * s), trim_mat)
    # Wheel arches, so the body does not float over the wheels.
    for fx in (0.52, -0.52):
        for side in (1, -1):
            box(f"{prefix}_arch", (fx * s, side * 0.395 * s, 0.20 * s),
                (0.44 * s, 0.015 * s, 0.16 * s), rail_mat)

    for fx in (0.52, -0.52):
        for fy in (0.42, -0.42):
            wheel = cylinder(
                f"{prefix}_wheel",
                (fx * s, fy * s, 0.16 * s),
                0.17 * s, 0.12 * s, rubber_mat,
                rotation=(math.radians(90), 0, 0),
                verts=20,
            )
            shade_smooth_sides(wheel)


def build_quantum_van():
    reset_scene()
    minibus("van", P.WHITE, scale=1.0, plate_colour=P.OCHRE)
    return "quantum-van"


def build_terminal_depot():
    reset_scene()
    shell = material("DepotShell", P.HUB, metallic=0.2, roughness=0.5)
    roof_mat = material("DepotRoof", P.DARK_METAL, metallic=0.4, roughness=0.4)
    trim = material("DepotTrim", P.OCHRE, metallic=0.3, roughness=0.4)
    floor = material("DepotFloor", P.CONCRETE, roughness=0.9)

    slab = box("depot_slab", (0, 0, 0.05), (2.6, 1.7, 0.10), floor)
    bevel(slab, width=0.03, segments=1)

    hall = box("depot_hall", (-0.25, 0, 0.55), (1.9, 1.5, 0.90), shell)
    bevel(hall, width=0.05, segments=2)

    # A pitched roof, built from two slanted slabs.
    for side, angle in ((1, -18), (-1, 18)):
        box(
            "depot_roof",
            (-0.25, side * 0.38, 1.12),
            (2.0, 0.82, 0.07),
            roof_mat,
            rotation=(math.radians(angle), 0, 0),
        )
    box("depot_ridge", (-0.25, 0, 1.24), (2.05, 0.10, 0.08), trim)

    # The loading canopy the ranks are actually organised around.
    box("depot_canopy", (1.05, 0, 0.92), (0.95, 1.5, 0.07), roof_mat)
    for fy in (0.62, -0.62):
        cylinder("depot_post", (1.42, fy, 0.48), 0.055, 0.86, trim)

    # Bay openings.
    for fy in (0.45, -0.45):
        box("depot_bay", (0.68, fy, 0.40), (0.08, 0.48, 0.62),
            material("DepotBay", P.DARK_METAL, roughness=0.7))
    return "terminal-depot"


# --------------------------------------------------------------------------- #
# The six tokens                                                               #
# --------------------------------------------------------------------------- #

def token_base(name="token_base", radius=0.52, height=0.09):
    mat = material("Pewter", P.PEWTER, metallic=0.85, roughness=0.35)
    base = cylinder(name, (0, 0, height / 2), radius, height, mat, verts=32)
    bevel(base, width=0.02, segments=2)
    shade_smooth_sides(base)
    return mat


def build_token_quantum():
    reset_scene()
    token_base()
    minibus("token", P.PEWTER, scale=0.62, plate_colour=P.PEWTER)
    for ob in bpy.data.objects:
        if ob.name.startswith("token_") and ob.name != "token_base":
            ob.location.z += 0.09
    return "token-quantum"


def build_token_coin():
    reset_scene()
    pewter = token_base(radius=0.5, height=0.08)
    gold = material("CoinOuter", (0.706, 0.549, 0.286), metallic=0.9, roughness=0.3)
    silver = material("CoinInner", (0.678, 0.686, 0.706), metallic=0.9, roughness=0.25)

    # An R5 stands on edge, leaning back a little on its plinth, bi-metallic as
    # the real one is. The faces stay flat so it reads as a coin, not a ball.
    tilt = (math.radians(90), 0, math.radians(12))
    lean = math.radians(-8)
    outer = cylinder("coin_outer", (0, 0.04, 0.62), 0.48, 0.10, gold,
                     rotation=(tilt[0] + lean, 0, tilt[2]), verts=40)
    shade_smooth_sides(outer)
    inner = cylinder("coin_inner", (0, 0.04, 0.62), 0.31, 0.115, silver,
                     rotation=(tilt[0] + lean, 0, tilt[2]), verts=40)
    shade_smooth_sides(inner)
    box("coin_prop", (0, -0.20, 0.30), (0.34, 0.12, 0.46), pewter,
        rotation=(math.radians(16), 0, 0))
    return "token-coin"


def traffic_light(post_mat, lit=False):
    """A three-lens Joburg signal on a post. `lit` gives the lenses a glow."""
    housing = material("SignalHousing", P.DARK_METAL, metallic=0.6, roughness=0.4)
    glow = 0.8 if lit else 0.0
    lens_red = material("LensRed", (0.769, 0.282, 0.247), roughness=0.25, glow=glow)
    lens_amber = material("LensAmber", (0.878, 0.569, 0.239), roughness=0.25, glow=glow)
    lens_green = material("LensGreen", (0.306, 0.639, 0.357), roughness=0.25, glow=glow)

    cylinder("signal_post", (0, 0, 0.42), 0.075, 0.70, post_mat)
    head = box("signal_head", (0, 0, 1.05), (0.34, 0.26, 0.72), housing)
    bevel(head, width=0.03, segments=2)
    for z, mat in ((1.31, lens_red), (1.05, lens_amber), (0.79, lens_green)):
        lens = cylinder("signal_lens", (0, 0.15, z), 0.10, 0.08, mat,
                        rotation=(math.radians(90), 0, 0), verts=18)
        shade_smooth_sides(lens)
        # A small hood over each lens, the way Joburg signals are built.
        box("signal_hood", (0, 0.20, z + 0.11), (0.26, 0.12, 0.03), housing,
            rotation=(math.radians(-14), 0, 0))


def build_token_robot():
    reset_scene()
    pewter = token_base(radius=0.5, height=0.08)
    traffic_light(pewter)
    return "token-robot"


def build_token_vest():
    reset_scene()
    token_base(radius=0.5, height=0.08)
    cloth = material("VestCloth", P.HI_VIS, roughness=0.75)
    stripe = material("VestStripe", (0.878, 0.886, 0.902), metallic=0.5, roughness=0.3)
    radio = material("VestRadio", P.DARK_METAL, roughness=0.6)

    # Folded into a standing A-frame, the way a vest hangs over a chair.
    for side, angle in ((1, 15), (-1, -15)):
        panel = box("vest_panel", (0, side * 0.17, 0.60), (0.62, 0.06, 0.98), cloth,
                    rotation=(math.radians(angle), 0, 0))
        bevel(panel, width=0.02, segments=1)
        for z in (0.44, 0.72):
            box("vest_stripe", (0, side * 0.20, z), (0.60, 0.03, 0.10), stripe,
                rotation=(math.radians(angle), 0, 0))
    box("vest_shoulder", (0, 0, 1.06), (0.60, 0.34, 0.09), cloth)
    box("vest_radio", (0.24, 0.20, 0.36), (0.14, 0.09, 0.24), radio)
    cylinder("vest_aerial", (0.24, 0.20, 0.58), 0.014, 0.22, radio, verts=8)
    return "token-vest"


def build_token_megaphone():
    reset_scene()
    pewter = token_base(radius=0.5, height=0.08)
    shell = material("MegaphoneShell", (0.788, 0.784, 0.769), metallic=0.7, roughness=0.35)
    grip = material("MegaphoneGrip", P.DARK_METAL, roughness=0.7)

    cylinder("mega_pedestal", (0, 0, 0.30), 0.09, 0.46, pewter)
    horn = cone("mega_horn", (0, 0.14, 0.80), 0.44, 0.15, 0.86, shell,
                rotation=(math.radians(72), 0, 0), verts=28)
    shade_smooth_sides(horn)
    body = cylinder("mega_body", (0, -0.22, 0.60), 0.16, 0.36, shell,
                    rotation=(math.radians(72), 0, 0), verts=22)
    shade_smooth_sides(body)
    # A rim around the mouth, so the horn reads as a cone rather than a spike.
    rim = cylinder("mega_rim", (0, 0.28, 0.94), 0.46, 0.05, shell,
                   rotation=(math.radians(72), 0, 0), verts=28)
    shade_smooth_sides(rim)
    box("mega_grip", (0, -0.30, 0.40), (0.10, 0.12, 0.26), grip,
        rotation=(math.radians(12), 0, 0))
    box("mega_trigger", (0, -0.20, 0.46), (0.06, 0.10, 0.05), grip)
    return "token-megaphone"


def build_token_sneaker():
    reset_scene()
    token_base(radius=0.52, height=0.08)
    canvas = material("SneakerCanvas", (0.741, 0.745, 0.757), roughness=0.8)
    rubber = material("SneakerRubber", (0.918, 0.910, 0.878), roughness=0.65)
    dark = material("SneakerDetail", P.DARK_METAL, roughness=0.7)

    sole = box("shoe_sole", (0, 0, 0.20), (1.42, 0.58, 0.18), rubber)
    bevel(sole, width=0.07, segments=3)
    toe = cylinder("shoe_toe", (0.62, 0, 0.24), 0.28, 0.56, rubber,
                   rotation=(math.radians(90), 0, 0), verts=24)
    shade_smooth_sides(toe)

    upper = box("shoe_upper", (-0.12, 0, 0.44), (1.05, 0.50, 0.34), canvas)
    bevel(upper, width=0.06, segments=2)
    collar = box("shoe_collar", (-0.48, 0, 0.62), (0.34, 0.48, 0.30), canvas)
    bevel(collar, width=0.06, segments=2)
    # Laces, as three small bars over the tongue.
    for i, x in enumerate((0.18, 0.02, -0.14)):
        box(f"shoe_lace_{i}", (x, 0, 0.60), (0.05, 0.34, 0.03), dark)
    box("shoe_stripe", (0, 0, 0.30), (1.36, 0.52, 0.04), dark)
    return "token-sneaker"


# --------------------------------------------------------------------------- #
# Tile props: the pictures on the special spaces                              #
# --------------------------------------------------------------------------- #

def build_prop_robot():
    """The impound lot's signal, in real colours with lit lenses."""
    reset_scene()
    post = material("SignalPost", P.CONCRETE, roughness=0.7)
    traffic_light(post, lit=True)
    return "prop-robot"


def build_prop_bulb():
    """City Power: a bare bulb, the way a spaza lights up at dusk."""
    reset_scene()
    glass = material("BulbGlass", (0.98, 0.86, 0.45), roughness=0.2, glow=0.9)
    brass = material("BulbBrass", (0.72, 0.58, 0.30), metallic=0.85, roughness=0.35)
    tip = material("BulbTip", P.DARK_METAL, metallic=0.5, roughness=0.5)

    globe = sphere("bulb_globe", (0, 0, 0.78), 0.34, glass, segments=20, rings=12)
    shade_smooth(globe)
    neck = cone("bulb_neck", (0, 0, 0.44), 0.19, 0.13, 0.22, glass, verts=20)
    shade_smooth_sides(neck)
    screw = cylinder("bulb_screw", (0, 0, 0.24), 0.14, 0.22, brass, verts=20)
    shade_smooth_sides(screw)
    for z in (0.18, 0.26, 0.34):
        ring = cylinder("bulb_thread", (0, 0, z), 0.155, 0.03, brass, verts=20)
        shade_smooth_sides(ring)
    contact = cylinder("bulb_contact", (0, 0, 0.09), 0.07, 0.08, tip, verts=12)
    shade_smooth_sides(contact)
    return "prop-bulb"


def build_prop_tap():
    """Joburg Water: a standpipe tap with a drop hanging off it."""
    reset_scene()
    chrome = material("TapChrome", (0.80, 0.82, 0.85), metallic=0.95, roughness=0.22)
    handle = material("TapHandle", (0.16, 0.42, 0.62), roughness=0.5)
    water = material("TapWater", (0.45, 0.72, 0.90), roughness=0.1, glow=0.3)

    pipe = cylinder("tap_pipe", (0, 0, 0.36), 0.075, 0.72, chrome, verts=16)
    shade_smooth_sides(pipe)
    body = cylinder("tap_body", (0, 0, 0.78), 0.13, 0.22, chrome, verts=18)
    shade_smooth_sides(body)
    spout = cylinder("tap_spout", (0, 0.26, 0.78), 0.06, 0.42, chrome,
                     rotation=(math.radians(90), 0, 0), verts=14)
    shade_smooth_sides(spout)
    mouth = cylinder("tap_mouth", (0, 0.45, 0.70), 0.06, 0.18, chrome, verts=14)
    shade_smooth_sides(mouth)
    stem = cylinder("tap_stem", (0, 0, 0.95), 0.045, 0.14, chrome, verts=12)
    shade_smooth_sides(stem)
    for angle in (0, 90):
        box("tap_handle", (0, 0, 1.03), (0.34, 0.06, 0.05), handle,
            rotation=(0, 0, math.radians(angle)))
    drop = sphere("tap_drop", (0, 0.45, 0.52), 0.055, water, segments=10, rings=6)
    shade_smooth(drop)
    return "prop-tap"


def card_stack(face_colour, emblem_colour):
    """A tidy stack of cards, top card face up in the deck's colour."""
    paper = material("CardPaper", (0.93, 0.91, 0.86), roughness=0.85)
    face = material("CardFace", face_colour, roughness=0.6, glow=0.15)
    emblem = material("CardEmblem", emblem_colour, roughness=0.6)
    thickness = 0.022
    for i in range(6):
        z = thickness / 2 + i * thickness
        twist = math.radians((-1) ** i * 2.5)
        box(f"card_{i}", (0.012 * (i % 2), 0.008 * (i % 3), z), (0.92, 0.62, thickness), paper,
            rotation=(0, 0, twist))
    top_z = 6 * thickness
    box("card_face", (0, 0, top_z + 0.003), (0.82, 0.52, 0.006), face)
    box("card_emblem", (0, 0, top_z + 0.008), (0.18, 0.26, 0.006), emblem)
    box("card_emblem_bar", (0, -0.2, top_z + 0.008), (0.5, 0.05, 0.006), emblem)


def build_prop_cards_kombi():
    reset_scene()
    card_stack(P.OCHRE, (0.10, 0.09, 0.07))
    return "prop-cards-kombi"


def build_prop_cards_citywatch():
    reset_scene()
    card_stack(P.HUB, (0.10, 0.09, 0.07))
    return "prop-cards-citywatch"


def build_prop_coins():
    """The Taxi Rank Queue's pot: a stack of R5s with a couple loose."""
    reset_scene()
    gold = material("CoinOuter", (0.706, 0.549, 0.286), metallic=0.9, roughness=0.3)
    silver = material("CoinInner", (0.678, 0.686, 0.706), metallic=0.9, roughness=0.25)
    thickness = 0.07
    for i in range(6):
        z = thickness / 2 + i * thickness
        x, y = 0.03 * math.cos(i * 1.7), 0.03 * math.sin(i * 1.7)
        outer = cylinder(f"coin_{i}", (x, y, z), 0.27, thickness, gold, verts=28,
                         rotation=(0, 0, i * 0.4))
        shade_smooth_sides(outer)
        inner = cylinder(f"coin_core_{i}", (x, y, z), 0.17, thickness + 0.004, silver, verts=28)
        shade_smooth_sides(inner)
    for j, (x, y) in enumerate(((0.46, 0.18), (-0.38, -0.30))):
        loose = cylinder(f"coin_loose_{j}", (x, y, thickness / 2), 0.27, thickness, gold,
                         verts=28, rotation=(0, 0, 0.9 * j))
        shade_smooth_sides(loose)
        core = cylinder(f"coin_loose_core_{j}", (x, y, thickness / 2), 0.17, thickness + 0.004,
                        silver, verts=28)
        shade_smooth_sides(core)
    return "prop-coins"


def build_prop_gantry():
    """An e-toll gantry: two posts, a beam, and the cameras that read your plate."""
    reset_scene()
    steel = material("GantrySteel", (0.62, 0.64, 0.66), metallic=0.8, roughness=0.4)
    sign = material("GantrySign", (0.16, 0.36, 0.62), roughness=0.5, glow=0.25)
    cam = material("GantryCamera", P.DARK_METAL, metallic=0.5, roughness=0.5)

    for x in (-0.58, 0.58):
        post = cylinder("gantry_post", (x, 0, 0.55), 0.05, 1.10, steel, verts=12)
        shade_smooth_sides(post)
        box("gantry_foot", (x, 0, 0.03), (0.2, 0.2, 0.06), steel)
    box("gantry_beam", (0, 0, 1.12), (1.32, 0.14, 0.14), steel)
    box("gantry_beam_low", (0, 0, 0.96), (1.32, 0.10, 0.06), steel)
    for x in (-0.36, 0, 0.36):
        box("gantry_camera", (x, 0.08, 0.88), (0.12, 0.10, 0.14), cam)
    box("gantry_sign", (0, 0.10, 1.12), (0.56, 0.03, 0.22), sign)
    return "prop-gantry"


# --------------------------------------------------------------------------- #
# The die                                                                      #
# --------------------------------------------------------------------------- #

# Pip layouts on a face, as offsets across its two tangent axes.
_O = 0.27
PIPS = {
    1: [(0, 0)],
    2: [(-_O, -_O), (_O, _O)],
    3: [(-_O, -_O), (0, 0), (_O, _O)],
    4: [(-_O, -_O), (-_O, _O), (_O, -_O), (_O, _O)],
    5: [(-_O, -_O), (-_O, _O), (0, 0), (_O, -_O), (_O, _O)],
    6: [(-_O, -_O), (-_O, 0), (-_O, _O), (_O, -_O), (_O, 0), (_O, _O)],
}

# Which face carries which value. Opposite faces add to seven, as on a real
# die. In glTF terms (Y up) this puts 1 on top, 6 underneath, 3 on +X, 4 on
# -X, 2 on -Z and 5 on +Z, which is what the client's face rotations assume.
DIE_FACES = {
    (0, 0, 1): 1, (0, 0, -1): 6,
    (1, 0, 0): 3, (-1, 0, 0): 4,
    (0, 1, 0): 2, (0, -1, 0): 5,
}


def build_die():
    """A single die, bevelled, with inset pips. The client shows two."""
    reset_scene()
    body_mat = material("DieBody", (0.96, 0.95, 0.91), roughness=0.35)
    pip_mat = material("DiePip", (0.08, 0.07, 0.06), roughness=0.6)

    body = box("die_body", (0, 0, 0.5), (1, 1, 1), body_mat)
    bevel(body, width=0.09, segments=3)

    for normal, value in DIE_FACES.items():
        nx, ny, nz = normal
        # Two tangent axes for the face.
        if nz != 0:
            u, v = (1, 0, 0), (0, 1, 0)
            rot = (0, 0, 0)
        elif nx != 0:
            u, v = (0, 1, 0), (0, 0, 1)
            rot = (0, math.radians(90), 0)
        else:
            u, v = (1, 0, 0), (0, 0, 1)
            rot = (math.radians(90), 0, 0)
        for a, b in PIPS[value]:
            cx = nx * 0.5 + u[0] * a + v[0] * b
            cy = ny * 0.5 + u[1] * a + v[1] * b
            cz = 0.5 + nz * 0.5 + u[2] * a + v[2] * b
            pip = cylinder(f"pip_{value}", (cx, cy, cz), 0.085, 0.04, pip_mat,
                           rotation=rot, verts=16)
            shade_smooth_sides(pip)
    return "die"


# --------------------------------------------------------------------------- #
# The city around the board                                                   #
# --------------------------------------------------------------------------- #

class _Helpers:
    """What diorama.py needs from this module, handed over as one object."""
    bpy = bpy
    material = staticmethod(material)
    box = staticmethod(box)
    cylinder = staticmethod(cylinder)
    cone = staticmethod(cone)
    sphere = staticmethod(sphere)
    shade_smooth = staticmethod(shade_smooth)
    shade_smooth_sides = staticmethod(shade_smooth_sides)
    minibus = staticmethod(minibus)


def build_diorama():
    reset_scene()
    D.build(_Helpers)
    return "diorama"


# --------------------------------------------------------------------------- #
# Entry point                                                                  #
# --------------------------------------------------------------------------- #

BUILDERS = [
    build_board,
    build_quantum_van,
    build_terminal_depot,
    build_token_quantum,
    build_token_coin,
    build_token_robot,
    build_token_vest,
    build_token_megaphone,
    build_token_sneaker,
    build_prop_robot,
    build_prop_bulb,
    build_prop_tap,
    build_prop_cards_kombi,
    build_prop_cards_citywatch,
    build_prop_coins,
    build_prop_gantry,
    build_die,
    build_diorama,
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build the Afromoly 3D assets.")
    parser.add_argument("--glb", default="../../apps/web/public/models")
    parser.add_argument("--blend", default=".")
    parser.add_argument("--only", default=None, help="Build one asset by name.")
    args = parser.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    glb_dir = args.glb if os.path.isabs(args.glb) else os.path.join(here, args.glb)
    blend_dir = args.blend if os.path.isabs(args.blend) else os.path.join(here, args.blend)

    print(f"Building Afromoly assets with Blender {bpy.app.version_string}")
    for builder in BUILDERS:
        name = builder.__name__.replace("build_", "").replace("_", "-")
        if args.only and args.only not in name:
            continue
        print(f"- {name}")
        export(builder(), glb_dir, blend_dir)
    print("Done.")


if __name__ == "__main__":
    main()
