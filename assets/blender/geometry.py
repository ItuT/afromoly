"""
Shared geometry for the Afromoly board.

The same tile layout is implemented in the web client (apps/web/lib/board3d.ts).
If you change a dimension here, change it there too, or tokens will stand next
to their tiles rather than on them.
"""

# Half the width of the square board, in Blender units (so the board is 20 across).
HALF = 10.0
# Corner tiles are square and larger, exactly as they are on a printed board.
CORNER = 2.6
# The nine tiles along each edge share what is left.
EDGE_WIDTH = (2 * HALF - 2 * CORNER) / 9.0
# How far a tile reaches in from the edge.
DEPTH = CORNER

BOARD_THICKNESS = 0.5
TILE_RISE = 0.06

CORNERS = {0, 10, 20, 30}


def tile_transform(index: int):
    """Centre (x, y) and footprint (size_x, size_y) of one tile."""
    if index == 0:
        return (HALF - CORNER / 2, -HALF + CORNER / 2, CORNER, CORNER)
    if index == 10:
        return (-HALF + CORNER / 2, -HALF + CORNER / 2, CORNER, CORNER)
    if index == 20:
        return (-HALF + CORNER / 2, HALF - CORNER / 2, CORNER, CORNER)
    if index == 30:
        return (HALF - CORNER / 2, HALF - CORNER / 2, CORNER, CORNER)

    if 1 <= index <= 9:  # bottom edge, running right to left
        x = HALF - CORNER - (index - 0.5) * EDGE_WIDTH
        return (x, -HALF + DEPTH / 2, EDGE_WIDTH, DEPTH)
    if 11 <= index <= 19:  # left edge, running bottom to top
        j = index - 10
        y = -HALF + CORNER + (j - 0.5) * EDGE_WIDTH
        return (-HALF + DEPTH / 2, y, DEPTH, EDGE_WIDTH)
    if 21 <= index <= 29:  # top edge, running left to right
        j = index - 20
        x = -HALF + CORNER + (j - 0.5) * EDGE_WIDTH
        return (x, HALF - DEPTH / 2, EDGE_WIDTH, DEPTH)
    if 31 <= index <= 39:  # right edge, running top to bottom
        j = index - 30
        y = HALF - CORNER - (j - 0.5) * EDGE_WIDTH
        return (HALF - DEPTH / 2, y, DEPTH, EDGE_WIDTH)

    raise ValueError(f"No tile at index {index}")


def band_transform(index: int):
    """
    The colour band on a street tile: a strip along the inner edge, facing the
    middle of the board. Returns centre and footprint, or None for a tile that
    carries no band.
    """
    if index in CORNERS:
        return None
    x, y, sx, sy = tile_transform(index)
    thickness = 0.42
    if 1 <= index <= 9:
        return (x, y + DEPTH / 2 - thickness / 2, sx, thickness)
    if 11 <= index <= 19:
        return (x + DEPTH / 2 - thickness / 2, y, thickness, sy)
    if 21 <= index <= 29:
        return (x, y - DEPTH / 2 + thickness / 2, sx, thickness)
    return (x - DEPTH / 2 + thickness / 2, y, thickness, sy)
