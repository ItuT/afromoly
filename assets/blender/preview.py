"""
Render a turntable-style still of every built asset, as a contact sheet.

    ./preview.sh                 write previews/ and previews/contact.png

Useful for eyeballing a change to build_models.py without opening Blender, and
for the images in the README.
"""

import math
import os
import sys

import bpy
import mathutils

NAMES = [
    "board", "quantum-van", "terminal-depot", "token-quantum", "token-coin",
    "token-robot", "token-vest", "token-megaphone", "token-sneaker",
    "prop-robot", "prop-bulb", "prop-tap", "prop-cards-kombi",
    "prop-cards-citywatch", "prop-coins", "prop-gantry", "die",
]


def frame_and_render(blend_path, out_path):
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    scene = bpy.context.scene

    xs, ys, zs = [], [], []
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        for corner in ob.bound_box:
            world = ob.matrix_world @ mathutils.Vector(corner)
            xs.append(world.x)
            ys.append(world.y)
            zs.append(world.z)
    if not xs:
        return False

    cx, cy, cz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) or 1.0
    distance = span * 1.9

    bpy.ops.object.camera_add(
        location=(cx + distance * 0.72, cy - distance * 0.82, cz + distance * 0.62)
    )
    camera = bpy.context.active_object
    camera.rotation_euler = (math.radians(62), 0, math.radians(41))
    scene.camera = camera

    bpy.ops.object.light_add(type="SUN", location=(cx + distance, cy - distance, cz + distance * 1.6))
    bpy.context.active_object.data.energy = 4.0
    bpy.ops.object.light_add(type="AREA", location=(cx - distance * 0.8, cy + distance * 0.5, cz + distance))
    bpy.context.active_object.data.energy = 220 * span
    bpy.context.active_object.data.size = span

    world = bpy.data.worlds.new("Preview")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.07, 0.065, 0.05, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 520
    scene.render.resolution_y = 460
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    return True


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    here = os.path.dirname(os.path.abspath(__file__))
    blend_dir = argv[0] if argv else here
    out_dir = argv[1] if len(argv) > 1 else os.path.join(here, "previews")
    os.makedirs(out_dir, exist_ok=True)

    for name in NAMES:
        blend_path = os.path.join(blend_dir, f"{name}.blend")
        if not os.path.exists(blend_path):
            print(f"skipping {name}: no .blend yet")
            continue
        if frame_and_render(blend_path, os.path.join(out_dir, f"{name}.png")):
            print("rendered", name)


if __name__ == "__main__":
    main()
