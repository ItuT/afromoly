"""
The city around the board.

A low-poly Johannesburg diorama, built from primitives with a seeded random
so the same city comes out every time. Landmarks that anyone from the city
would know sit at the four sides; filler blocks and jacarandas fill in
between. Everything stays clear of a margin around the board, and low near
it, so neither the overview nor the follow camera is ever blocked.

Imported by build_models.py, which owns the scene and export helpers.
"""

import math
import random

# The board is 20 across, rim to 10.18. Nothing is built inside this radius.
CLEAR = 14.5
OUTER = 34.0

# Colours here are linear, the way Blender stores them. After the scene's
# lighting and sRGB output they come out far brighter than they read as
# numbers, so everything is set darker than instinct suggests. The board's
# own surface is unlit and stays the focus; the city should recede.
ASPHALT = (0.018, 0.018, 0.017)
EARTH = (0.030, 0.027, 0.021)
ROAD = (0.048, 0.046, 0.043)
KERB = (0.11, 0.105, 0.095)
SAND = (0.36, 0.27, 0.12)
CONCRETE = (0.17, 0.165, 0.15)
CONCRETE_DARK = (0.085, 0.082, 0.076)
BRICK = (0.19, 0.085, 0.055)
BRICK_PALE = (0.30, 0.19, 0.13)
CREAM = (0.34, 0.30, 0.23)
GLASS = (0.05, 0.09, 0.12)
STEEL = (0.30, 0.31, 0.33)
JACARANDA = (0.30, 0.17, 0.56)
LEAF = (0.07, 0.17, 0.055)
TRUNK = (0.09, 0.055, 0.03)
MURAL_BLUE = (0.07, 0.24, 0.42)
MURAL_ORANGE = (0.70, 0.25, 0.05)

BLOCK_COLOURS = [CONCRETE, CONCRETE_DARK, BRICK, BRICK_PALE, CREAM, CREAM, GLASS]


def build(h):
    """`h` is the helper namespace from build_models: box, cylinder, cone, sphere, material..."""
    rng = random.Random(2026)
    mat = h.material
    box, cylinder, cone, sphere = h.box, h.cylinder, h.cone, h.sphere

    asphalt = mat("CityAsphalt", ASPHALT, roughness=0.95)
    earth = mat("CityEarth", EARTH, roughness=0.95)
    road = mat("CityRoad", ROAD, roughness=0.9)
    kerb = mat("CityKerb", KERB, roughness=0.8)
    sand = mat("MineSand", SAND, roughness=0.95)
    steel = mat("CitySteel", STEEL, metallic=0.7, roughness=0.4)
    trunk = mat("TreeTrunk", TRUNK, roughness=0.9)
    jac = mat("Jacaranda", JACARANDA, roughness=0.8)
    leaf = mat("TreeLeaf", LEAF, roughness=0.8)
    blocks = [mat(f"Block{i}", c, roughness=0.8) for i, c in enumerate(BLOCK_COLOURS)]

    # ---- ground: the board sits on this, top face at z = -0.5 -------------
    box("city_ground", (0, 0, -0.65), (2 * OUTER + 8, 2 * OUTER + 8, 0.3), earth)
    # A paved apron right around the board.
    box("city_apron", (0, 0, -0.495), (2 * CLEAR - 3, 2 * CLEAR - 3, 0.01), asphalt)

    # ---- roads: a ring around the board and four ways out ------------------
    ring = CLEAR - 1.0
    for sign in (1, -1):
        box("road_ring", (sign * ring, 0, -0.49), (2.6, 2 * ring + 2.6, 0.02), road)
        box("road_ring", (0, sign * ring, -0.49), (2 * ring + 2.6, 2.6, 0.02), road)
        box("road_out", (sign * (ring + OUTER) / 2, 0, -0.49), (OUTER - ring, 2.6, 0.02), road)
        box("road_out", (0, sign * (ring + OUTER) / 2, -0.49), (2.6, OUTER - ring, 0.02), road)
    # Kerbs along the ring road's outer edge.
    for sign in (1, -1):
        box("kerb", (sign * (ring + 1.4), 0, -0.47), (0.2, 2 * ring + 3.0, 0.06), kerb)
        box("kerb", (0, sign * (ring + 1.4), -0.47), (2 * ring + 3.0, 0.2, 0.06), kerb)

    # ---- landmarks --------------------------------------------------------
    # Ponte City: the hollow cylinder on the ridge, east.
    ponte = mat("Ponte", (0.16, 0.15, 0.14), roughness=0.7)
    ponte_band = mat("PonteBand", (0.55, 0.06, 0.04), roughness=0.6)
    tower = cylinder("ponte", (24, 6, 5.0), 2.0, 11.0, ponte, verts=28)
    h.shade_smooth_sides(tower)
    core = cylinder("ponte_core", (24, 6, 5.2), 1.5, 11.2, mat("PonteCore", (0.02, 0.02, 0.02)), verts=24)
    h.shade_smooth_sides(core)
    band = cylinder("ponte_band", (24, 6, 10.2), 2.05, 0.9, ponte_band, verts=28)
    h.shade_smooth_sides(band)

    # Hillbrow Tower: the mast with the pod, a little north of Ponte.
    mast = cylinder("hillbrow_mast", (27, -6, 6.5), 0.55, 13.0, mat("Mast", CONCRETE, roughness=0.7), verts=16)
    h.shade_smooth_sides(mast)
    pod = cylinder("hillbrow_pod", (27, -6, 10.5), 1.5, 1.6, mat("Pod", CONCRETE_DARK, roughness=0.6), verts=20)
    h.shade_smooth_sides(pod)
    pod2 = cylinder("hillbrow_pod2", (27, -6, 12.0), 1.1, 1.0, mat("Pod", CONCRETE_DARK, roughness=0.6), verts=20)
    h.shade_smooth_sides(pod2)
    spire = cone("hillbrow_spire", (27, -6, 15.0), 0.18, 0.02, 4.0, steel, verts=8)

    # Mine dumps, north: the yellow hills the city was dug out of.
    for (x, y, r, z) in ((-9, -26, 6.0, 3.2), (4, -27, 5.0, 2.6), (14, -24, 4.2, 2.2)):
        dump = cone(f"mine_dump", (x, y, z / 2 - 0.5), r, r * 0.35, z, sand, verts=20)
        h.shade_smooth_sides(dump)

    # Nelson Mandela Bridge, west: cable-stayed over the rail yards.
    deck = mat("BridgeDeck", (0.22, 0.225, 0.235), roughness=0.6)
    pylon = mat("BridgePylon", (0.55, 0.57, 0.60), metallic=0.3, roughness=0.5)
    cable = mat("BridgeCable", (0.60, 0.62, 0.65), metallic=0.6, roughness=0.3)
    box("rail_yard", (-24, 0, -0.48), (7.0, 22.0, 0.02), mat("RailYard", (0.024, 0.023, 0.021)))
    for i in range(6):
        box("rail", (-24 - 2.5 + i * 1.0, 0, -0.46), (0.06, 22.0, 0.02), steel)
    box("bridge_deck", (-24, 0, 1.6), (2.2, 18.0, 0.25), deck)
    for py in (-5.0, 5.0):
        for px in (-24 - 0.9, -24 + 0.9):
            leg = cylinder("bridge_leg", (px, py, 3.4), 0.14, 6.8, pylon, verts=10,
                           rotation=(0, math.radians(8 if px < -24 else -8), 0))
            h.shade_smooth_sides(leg)
        top = box("bridge_cross", (-24, py, 6.7), (2.3, 0.3, 0.3), pylon)
        for k in range(1, 5):
            dz = k * 1.6
            for sgn in (1, -1):
                y1 = py + sgn * dz
                if abs(y1) > 8.6:
                    continue
                length = math.hypot(dz, 6.7 - 1.72)
                angle = math.atan2(dz, 6.7 - 1.72)
                cyl = cylinder("bridge_cable", (-24, py + sgn * dz / 2, (6.7 + 1.72) / 2),
                               0.03, length, cable, verts=6,
                               rotation=(sgn * angle, 0, 0))

    # Orlando Towers, south-west: the painted cooling towers.
    for (x, y) in ((-24, 20), (-19, 23)):
        base = cone("orlando_base", (x, y, 1.9), 2.4, 1.55, 4.8, mat("Orlando", CONCRETE, roughness=0.7), verts=22)
        h.shade_smooth_sides(base)
        flare = cone("orlando_flare", (x, y, 5.1), 1.55, 1.75, 1.6, mat("Orlando", CONCRETE, roughness=0.7), verts=22)
        h.shade_smooth_sides(flare)
        for (zc, mmat) in ((2.6, mat("MuralBlue", MURAL_BLUE)), (1.4, mat("MuralOrange", MURAL_ORANGE))):
            r = 2.4 - (zc + 0.5) * (2.4 - 1.55) / 4.8 + 0.02
            ringm = cone("orlando_mural", (x, y, zc), r + 0.02, r - 0.11, 0.7, mmat, verts=22)
            h.shade_smooth_sides(ringm)

    # A taxi rank, south, by the road out: canopy and a row of Quantums.
    canopy = mat("RankCanopy", (0.10, 0.28, 0.36), metallic=0.2, roughness=0.5)
    box("rank_slab", (6, 21, -0.47), (12.0, 5.0, 0.06), kerb)
    box("rank_canopy", (6, 21.8, 2.4), (11.0, 3.6, 0.16), canopy)
    for px in (1.5, 6, 10.5):
        for py in (20.4, 23.2):
            cylinder("rank_post", (px, py, 1.2), 0.08, 2.4, steel, verts=8)
    for i in range(5):
        h.minibus(f"rankvan{i}", (0.70, 0.68, 0.64) if i % 2 else (0.55, 0.55, 0.53), scale=0.85)
        # minibus builds at the origin; move what it just made.
        for ob in list(h.bpy.data.objects):
            if ob.name.startswith(f"rankvan{i}_"):
                ob.location.x += 2.0 + i * 2.0
                ob.location.y += 20.6
                ob.location.z += -0.44
                ob.rotation_euler.z += math.radians(90)

    # ---- filler blocks --------------------------------------------------
    def clear_of_landmarks(x, y):
        keep_out = [((24, 6), 4.5), ((27, -6), 3.5), ((-24, 0), 6.0), ((-24, 20), 4.5), ((-19, 23), 4.5),
                    ((6, 21), 8.0), ((-9, -26), 7.0), ((4, -27), 6.0), ((14, -24), 5.5)]
        return all(math.hypot(x - cx, y - cy) > r for (cx, cy), r in keep_out)

    def on_road(x, y):
        return abs(abs(x) - ring) < 1.8 or abs(abs(y) - ring) < 1.8 or abs(x) < 1.8 or abs(y) < 1.8

    placed = 0
    attempts = 0
    while placed < 110 and attempts < 4000:
        attempts += 1
        x = rng.uniform(-OUTER, OUTER)
        y = rng.uniform(-OUTER, OUTER)
        d = max(abs(x), abs(y))
        if d < CLEAR + 1.2 or d > OUTER - 1.0:
            continue
        if on_road(x, y) or not clear_of_landmarks(x, y):
            continue
        w, l = rng.uniform(1.4, 3.2), rng.uniform(1.4, 3.2)
        # Low near the board, rising toward the edge of the city.
        reach = (d - CLEAR) / (OUTER - CLEAR)
        height = rng.uniform(0.9, 1.8) + reach * rng.uniform(1.5, 5.0)
        b = box(f"block_{placed}", (x, y, height / 2 - 0.5), (w, l, height), rng.choice(blocks),
                rotation=(0, 0, rng.uniform(-0.12, 0.12)))
        if rng.random() < 0.35:
            box(f"block_{placed}_top", (x, y, height - 0.5 + 0.2), (w * 0.6, l * 0.6, 0.4), rng.choice(blocks))
        placed += 1

    # ---- trees: jacarandas along the ring road, greens elsewhere ----------
    trees = 0
    attempts = 0
    while trees < 70 and attempts < 4000:
        attempts += 1
        along_ring = rng.random() < 0.6
        if along_ring:
            side = rng.choice((0, 1, 2, 3))
            t = rng.uniform(-ring - 1, ring + 1)
            off = ring + 2.2
            x, y = ((off, t), (-off, t), (t, off), (t, -off))[side]
        else:
            x, y = rng.uniform(-OUTER, OUTER), rng.uniform(-OUTER, OUTER)
        d = max(abs(x), abs(y))
        if d < CLEAR + 0.6 or d > OUTER - 0.5 or on_road(x, y) or not clear_of_landmarks(x, y):
            continue
        hgt = rng.uniform(0.9, 1.5)
        cylinder(f"tree_trunk_{trees}", (x, y, hgt / 2 - 0.5), 0.09, hgt, trunk, verts=6)
        crown = sphere(f"tree_crown_{trees}", (x, y, hgt - 0.5 + 0.55), rng.uniform(0.55, 0.9),
                       jac if along_ring or rng.random() < 0.4 else leaf, segments=10, rings=7)
        h.shade_smooth(crown)
        trees += 1
