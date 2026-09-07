"""The board palette, matching the web client's night rank theme."""

GROUPS = {
    "brown": (0.541, 0.376, 0.224),
    "lightblue": (0.435, 0.714, 0.839),
    "pink": (0.788, 0.388, 0.608),
    "orange": (0.859, 0.541, 0.235),
    "red": (0.769, 0.282, 0.247),
    "yellow": (0.851, 0.698, 0.235),
    "green": (0.306, 0.549, 0.357),
    "darkblue": (0.290, 0.435, 0.722),
}

BOARD_BASE = (0.086, 0.082, 0.063)
TILE_FACE = (0.129, 0.122, 0.098)
CORNER_FACE = (0.161, 0.153, 0.125)
HUB = (0.373, 0.659, 0.741)
UTILITY = (0.541, 0.361, 0.153)
OCHRE = (0.878, 0.569, 0.239)
PEWTER = (0.478, 0.478, 0.494)
DARK_METAL = (0.180, 0.180, 0.196)
GLASS = (0.129, 0.196, 0.235)
WHITE = (0.902, 0.898, 0.878)
RUBBER = (0.078, 0.078, 0.086)
HI_VIS = (0.812, 0.878, 0.180)
CONCRETE = (0.427, 0.416, 0.388)

# Which colour group, hub or utility each board space belongs to.
TILE_GROUPS = {
    1: "brown", 3: "brown",
    6: "lightblue", 8: "lightblue", 9: "lightblue",
    11: "pink", 13: "pink", 14: "pink",
    16: "orange", 18: "orange", 19: "orange",
    21: "red", 23: "red", 24: "red",
    26: "yellow", 27: "yellow", 29: "yellow",
    31: "green", 32: "green", 34: "green",
    37: "darkblue", 39: "darkblue",
}
HUB_TILES = {5, 15, 25, 35}
UTILITY_TILES = {12, 28}
