'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Text, useGLTF } from '@react-three/drei';
import {
  Color,
  Euler,
  MeshBasicMaterial,
  NoToneMapping,
  Quaternion,
  Vector3,
  type Group,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import { BOARD, type GameEvent, type ObservableState, type Tile, type TokenId } from '@afromoly/engine';
import {
  DICE_LEAD,
  HOP_HEIGHT,
  HOP_SECONDS,
  IMPOUND_HEIGHT,
  IMPOUND_SECONDS,
  MODEL_PATHS,
  TILE_TOP,
  buildingSpots,
  movePath,
  onTile,
  tileCentre,
  tileFootprint,
  tokenSpot,
} from '@/lib/board3d';
import { rand, tileLabel } from '@/lib/display';

const SEAT_HEX = ['#e0913d', '#5fa8bd', '#7fbe92', '#c9639b', '#d9b23c', '#b48ae0'];
/** The same seats, deep enough to read as text on a cream pad. */
const SEAT_INK = ['#a8540a', '#1f6f88', '#256b3f', '#a02f72', '#8a6a08', '#6a3fb5'];
const LABEL_FONT = '/fonts/BarlowSemiCondensed-Bold.ttf';
const INK = '#151310';
const PAD = '#f4f1ea';
const CORNER_PAD = '#ebe6da';
const WELL = '#e3dccb';

/** Positions of the pieces as drawn this frame, which lag the state while they move. */
type LivePositions = Map<string, Vector3>;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------------ camera */

export type Focus = 'board' | 'piece';

/**
 * Point the camera at the whole board, or follow one piece, easing between
 * the two rather than snapping.
 *
 * A phone held upright is the case that matters for the overview: the width
 * is the limit, not the height, so the camera pulls back a long way further
 * than on a laptop and takes a steeper pitch. Following a piece is how a phone
 * gets detail, and it is the default there. While following, the camera
 * tracks the piece as it is drawn, so it walks with it rather than jumping to
 * where it will end up.
 */
/** Which way is "outside the board" for a piece on this tile, as a unit vector. */
function outwardOf(tileIndex: number): Vector3 {
  const t = tileFootprint(tileIndex);
  const corner = tileIndex === 0 || tileIndex === 10 || tileIndex === 20 || tileIndex === 30;
  const facing = corner ? (t.z > 0 ? Math.PI : 0) : t.facing;
  const theta = facing - Math.PI;
  // Rotate +z, the bottom row's outward, into this side's frame.
  return new Vector3(Math.sin(theta), 0, Math.cos(theta));
}

function FitCamera({
  focus,
  fallback,
  live,
  playerId,
  tileIndex,
  userOrbited,
}: {
  focus: Focus;
  /** Where the followed piece stands according to the state. */
  fallback: [number, number, number];
  live: React.RefObject<LivePositions>;
  playerId: string | null;
  /** The tile the followed piece stands on, so the camera approaches from its side. */
  tileIndex: number | null;
  /** Set by the orbit controls when the user drags, so their angle is kept. */
  userOrbited: React.RefObject<boolean>;
}) {
  const { camera, size, controls } = useThree();
  const lastClass = useRef<'portrait' | 'landscape' | null>(null);
  const lastFocus = useRef<Focus | null>(null);
  const lastSide = useRef<string | null>(null);
  const goal = useRef<{ position: Vector3; target: Vector3; settled: boolean } | null>(null);
  const resetDirection = useRef(false);
  // The direction the follow camera is heading for. Held here rather than
  // read back from the camera each frame, because mid-journey the camera is
  // still wherever it came from, and a re-aim would last exactly one frame.
  const aim = useRef(new Vector3(0, 0.72, 1).normalize());

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const klass = aspect < 1 ? 'portrait' : 'landscape';
    const refit = lastClass.current !== klass || lastFocus.current !== focus;
    lastClass.current = klass;
    lastFocus.current = focus;

    if (focus === 'piece') {
      goal.current = null;
      resetDirection.current = refit;
      return;
    }
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // A laptop has room to show a ring of city around the board; a phone
    // spends every pixel on the board itself.
    const air = klass === 'portrait' ? 1 : 1.22;
    const distance = Math.max((10.4 * air) / Math.tan(vfov / 2), (10.8 * air) / Math.tan(hfov / 2));
    let direction = cam.position.clone();
    if (refit || direction.lengthSq() < 1e-6) direction.set(0, 1, klass === 'portrait' ? 0.45 : 0.95);
    direction = direction.normalize().multiplyScalar(distance);
    goal.current = { position: direction, target: new Vector3(0, 0, 0), settled: false };
  }, [camera, size.width, size.height, focus]);

  useFrame((_, delta) => {
    const orbit = controls as { target: Vector3; update?: () => void } | null;
    const k = 1 - Math.exp(-delta * 6);

    if (focus === 'piece') {
      const here = (playerId && live.current.get(playerId)) || new Vector3(...fallback);
      // Lean in from outside the piece's own side of the board, so the names
      // on that side read upright. Re-aim when the piece changes side.
      const outward = tileIndex === null ? new Vector3(0, 0, 1) : outwardOf(tileIndex);
      const side = `${Math.round(outward.x)},${Math.round(outward.z)}`;
      if (lastSide.current !== side) {
        lastSide.current = side;
        resetDirection.current = true;
      }
      if (resetDirection.current || !orbit) {
        aim.current = outward.clone().setY(0.72).normalize();
        resetDirection.current = false;
      } else if (userOrbited.current) {
        // The user dragged: keep the angle they chose, but never from below.
        const chosen = camera.position.clone().sub(orbit.target);
        if (chosen.lengthSq() > 1e-6) aim.current = chosen.normalize().setY(Math.max(0.25, chosen.y)).normalize();
        userOrbited.current = false;
      }
      const wanted = here.clone().add(aim.current.clone().multiplyScalar(8.2));
      camera.position.lerp(wanted, k);
      if (orbit) orbit.target.lerp(here, k);
      else camera.lookAt(here);
      orbit?.update?.();
      return;
    }

    const g = goal.current;
    if (!g || g.settled) return;
    camera.position.lerp(g.position, k);
    if (orbit) orbit.target.lerp(g.target, k);
    else camera.lookAt(g.target);
    orbit?.update?.();
    if (camera.position.distanceTo(g.position) < 0.02) {
      camera.position.copy(g.position);
      orbit?.target.copy(g.target);
      orbit?.update?.();
      g.settled = true;
    }
  });

  return null;
}

/* ------------------------------------------------------------------ pieces */

function Model({
  url,
  position,
  rotationY = 0,
  scale = 1,
  tint,
}: {
  url: string;
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
  tint?: string;
}) {
  const { scene } = useGLTF(url);
  // Each placement needs its own copy, since one loaded scene is shared.
  const copy = useMemo(() => {
    const clone = scene.clone(true);
    if (tint) {
      clone.traverse((child: Object3D) => {
        const mesh = child as Object3D & {
          material?: { clone?: () => { color?: { set: (c: string) => void } } };
        };
        if (mesh.material && typeof mesh.material.clone === 'function') {
          const material = mesh.material.clone();
          material.color?.set(tint);
          (mesh as unknown as { material: unknown }).material = material;
        }
      });
    }
    return clone;
  }, [scene, tint]);

  return <primitive object={copy} position={position} rotation={[0, rotationY, 0]} scale={scale} />;
}

function TurnMarker({ position }: { position: [number, number, number] }) {
  const ring = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.y = clock.elapsedTime * 0.9;
  });
  return (
    <group ref={ring} position={[position[0], position[1] + 0.02, position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.74, 0.88, 28]} />
        <meshBasicMaterial color="#e0913d" transparent opacity={0.85} fog={false} />
      </mesh>
    </group>
  );
}

type Seated = ObservableState['players'];

function groupByTile(state: ObservableState): Map<number, Seated> {
  const perTile = new Map<number, Seated>();
  for (const player of state.players) {
    if (player.bankrupt) continue;
    const list = perTile.get(player.position) ?? [];
    list.push(player);
    perTile.set(player.position, list);
  }
  return perTile;
}

/** Where a given player's piece stands, or null if they are out. */
function spotOf(state: ObservableState, playerId: string | null): [number, number, number] | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.bankrupt) return null;
  const here = groupByTile(state).get(player.position) ?? [];
  return tokenSpot(player.position, here.indexOf(player), here.length);
}

interface Hop {
  to: Vector3;
  height: number;
  seconds: number;
}

interface Walk {
  hops: Hop[];
  index: number;
  startAt: number;
  from: Vector3 | null;
  hopStart: number;
}

/**
 * The pieces, walking the board.
 *
 * Positions are driven per frame rather than through React state: a piece
 * hops tile by tile along the path an event describes, then settles onto its
 * exact spot from the state. With no walk pending it eases toward the state,
 * which also covers a resync after a dropped socket.
 */
function Pieces({
  state,
  events,
  batch,
  live,
}: {
  state: ObservableState;
  events: GameEvent[];
  batch: number;
  live: React.RefObject<LivePositions>;
}) {
  const groups = useRef(new Map<string, Group>());
  const walks = useRef(new Map<string, Walk>());
  const reduced = useMemo(prefersReducedMotion, []);
  const { clock } = useThree();

  const current = state.players[state.currentPlayerIndex];
  const currentId = current && !current.bankrupt ? current.id : null;

  // Queue the walks a batch of events describes.
  useEffect(() => {
    if (reduced || batch === 0) return;
    const now = clock.elapsedTime;
    const lead = events.some((e) => e.kind === 'diceRolled') ? DICE_LEAD : 0;
    const busyUntil = new Map<string, number>();
    const queue = (playerId: string, hops: Hop[]) => {
      if (hops.length === 0) return;
      const start = Math.max(busyUntil.get(playerId) ?? 0, now + lead);
      const existing = walks.current.get(playerId);
      if (existing) existing.hops.push(...hops);
      else walks.current.set(playerId, { hops, index: 0, startAt: start, from: null, hopStart: 0 });
      busyUntil.set(playerId, start + hops.reduce((t, h) => t + h.seconds, 0));
    };
    for (const event of events) {
      if (event.kind === 'moved') {
        queue(
          event.playerId,
          movePath(event.from, event.to).map((tile) => ({
            to: new Vector3(...tileCentre(tile)),
            height: HOP_HEIGHT,
            seconds: HOP_SECONDS,
          })),
        );
      } else if (event.kind === 'sentToImpound') {
        queue(event.playerId, [{ to: new Vector3(...tileCentre(10)), height: IMPOUND_HEIGHT, seconds: IMPOUND_SECONDS }]);
      }
    }
  }, [batch, events, reduced, clock]);

  useFrame((_, delta) => {
    const now = clock.elapsedTime;
    for (const player of state.players) {
      const group = groups.current.get(player.id);
      if (!group || player.bankrupt) continue;
      const walk = walks.current.get(player.id);
      const spot = spotOf(state, player.id);
      const target = spot ? new Vector3(...spot) : null;

      if (walk && now >= walk.startAt) {
        const hop = walk.hops[walk.index];
        if (!hop) {
          walks.current.delete(player.id);
        } else {
          if (!walk.from) {
            walk.from = group.position.clone();
            walk.hopStart = now;
          }
          const t = Math.min(1, (now - walk.hopStart) / hop.seconds);
          group.position.lerpVectors(walk.from, hop.to, t);
          group.position.y += Math.sin(Math.PI * t) * hop.height;
          if (t >= 1) {
            walk.index += 1;
            walk.from = null;
            if (walk.index >= walk.hops.length) walks.current.delete(player.id);
          }
        }
      } else if (!walk && target) {
        group.position.lerp(target, 1 - Math.exp(-delta * 14));
      }
      live.current.set(player.id, group.position);
    }
  });

  // One stable ref callback per player. A fresh closure each render would make
  // React re-bind it, and the re-bind would put the piece back on its state
  // position in the middle of a walk.
  const binders = useRef(new Map<string, (el: Group | null) => void>());
  const firstSpot = useRef(new Map<string, [number, number, number] | null>());
  for (const player of state.players) {
    if (!firstSpot.current.has(player.id)) firstSpot.current.set(player.id, spotOf(state, player.id));
  }
  const bind = useCallback((playerId: string) => {
    let binder = binders.current.get(playerId);
    if (!binder) {
      binder = (el: Group | null) => {
        if (!el) {
          groups.current.delete(playerId);
          live.current.delete(playerId);
          return;
        }
        if (!groups.current.has(playerId)) {
          const spot = firstSpot.current.get(playerId);
          if (spot) el.position.set(...spot);
        }
        groups.current.set(playerId, el);
      };
      binders.current.set(playerId, binder);
    }
    return binder;
  }, [live]);

  return (
    <>
      {state.players.map((player, seat) => {
        if (player.bankrupt) return null;
        const url = MODEL_PATHS[player.token as TokenId] ?? MODEL_PATHS.quantum;
        return (
          <group key={player.id} ref={bind(player.id)}>
            <Model
              url={url}
              position={[0, 0, 0]}
              rotationY={tileFootprint(player.position).facing}
              scale={0.8}
              tint={SEAT_HEX[seat % SEAT_HEX.length]}
            />
            {player.id === currentId && <TurnMarker position={[0, 0, 0]} />}
          </group>
        );
      })}

      {BOARD.map((tile) => {
        if (tile.kind !== 'street') return null;
        const ts = state.tiles[tile.index];
        if (!ts?.ownerId) return null;
        const facing = tileFootprint(tile.index).facing;
        if (ts.depot) {
          const [spot] = buildingSpots(tile.index, 1);
          return spot ? (
            <Model key={`depot-${tile.index}`} url={MODEL_PATHS.depot} position={spot} rotationY={facing} scale={0.42} />
          ) : null;
        }
        if (ts.vans === 0) return null;
        return buildingSpots(tile.index, ts.vans).map((spot, i) => (
          <Model key={`van-${tile.index}-${i}`} url={MODEL_PATHS.van} position={spot} rotationY={facing} scale={0.34} />
        ));
      })}
    </>
  );
}

/* -------------------------------------------------------------------- dice */

/** The rotation that brings a face value to the top, given how the die was modelled. */
const FACE_UP: Record<number, Euler> = {
  1: new Euler(0, 0, 0),
  6: new Euler(Math.PI, 0, 0),
  3: new Euler(0, 0, Math.PI / 2),
  4: new Euler(0, 0, -Math.PI / 2),
  2: new Euler(Math.PI / 2, 0, 0),
  5: new Euler(-Math.PI / 2, 0, 0),
};

const DIE_SCALE = 0.72;
const DIE_REST_Y = TILE_TOP + DIE_SCALE / 2 + 0.02;
const DIE_SPOTS: [number, number][] = [
  [-0.95, 3.2],
  [0.95, 3.2],
];

interface Throw {
  startAt: number;
  finals: Quaternion[];
  spins: Vector3[];
  phases: number[];
}

/**
 * Two dice thrown into the well on every roll. They tumble, drop, settle on
 * the faces the engine rolled, sit for a moment, then shrink away.
 */
function Dice({ events, batch }: { events: GameEvent[]; batch: number }) {
  const { scene } = useGLTF(MODEL_PATHS.die);
  const dice = useMemo(() => [scene.clone(true), scene.clone(true)], [scene]);
  const groups = useRef<(Group | null)[]>([null, null]);
  const throwRef = useRef<Throw | null>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const { clock } = useThree();

  useEffect(() => {
    if (batch === 0) return;
    const rolled = events.find((e) => e.kind === 'diceRolled');
    if (!rolled || rolled.kind !== 'diceRolled') return;
    const finals = rolled.dice.map((face) => {
      const yaw = new Quaternion().setFromEuler(new Euler(0, Math.random() * Math.PI * 2, 0));
      return yaw.multiply(new Quaternion().setFromEuler(FACE_UP[face] ?? FACE_UP[1]!));
    });
    throwRef.current = {
      startAt: reduced ? clock.elapsedTime - 1.3 : clock.elapsedTime,
      finals,
      spins: [0, 1].map(() => new Vector3(6 + Math.random() * 6, 4 + Math.random() * 5, 5 + Math.random() * 6)),
      phases: [Math.random() * Math.PI, Math.random() * Math.PI],
    };
    groups.current.forEach((g, i) => {
      if (!g) return;
      g.visible = true;
      g.scale.setScalar(DIE_SCALE);
      g.position.set(DIE_SPOTS[i]![0], DIE_REST_Y + 1.8, DIE_SPOTS[i]![1]);
      g.quaternion.setFromEuler(new Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
    });
  }, [batch, events, reduced, clock]);

  useFrame((_, delta) => {
    const t = throwRef.current;
    if (!t) return;
    const age = clock.elapsedTime - t.startAt;
    groups.current.forEach((g, i) => {
      if (!g) return;
      const [x, z] = DIE_SPOTS[i]!;
      if (age < 0.9) {
        // Tumbling down, with a couple of decaying bounces.
        const fall = Math.max(0, 1 - age / 0.9);
        const bounce = Math.abs(Math.cos(age * 9 + t.phases[i]!)) * fall * fall * 1.6;
        g.position.set(x, DIE_REST_Y + bounce, z);
        const spin = t.spins[i]!.clone().multiplyScalar(delta * fall);
        g.quaternion.multiply(new Quaternion().setFromEuler(new Euler(spin.x, spin.y, spin.z)));
      } else if (age < 1.3) {
        g.position.set(x, DIE_REST_Y, z);
        g.quaternion.slerp(t.finals[i]!, 1 - Math.exp(-delta * 14));
      } else if (age < 3.6) {
        g.quaternion.copy(t.finals[i]!);
      } else if (age < 4.0) {
        g.scale.setScalar(DIE_SCALE * Math.max(0, 1 - (age - 3.6) / 0.4));
      } else {
        g.visible = false;
      }
    });
    if (age >= 4.0) throwRef.current = null;
  });

  return (
    <>
      {dice.map((die, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
          scale={DIE_SCALE}
        >
          <primitive object={die} position={[-0.5, -0.5, -0.5]} />
        </group>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ labels */

const CORNERS = new Set([0, 10, 20, 30]);

function shortName(tile: Tile): string {
  if (CORNERS.has(tile.index)) return tileLabel(tile);
  return tile.name.replace(/\s*\(.*\)/, '');
}

/**
 * Names and prices printed on the pads, each turned to read from outside the
 * board, the way a printed board is set for the player sitting on that side.
 */
function TileLabel({ tile, ownerColour }: { tile: Tile; ownerColour: string | null }) {
  const f = tileFootprint(tile.index);
  const corner = CORNERS.has(tile.index);
  // Corners read the same way as the row they sit on.
  const facing = corner ? (f.z > 0 ? Math.PI : 0) : f.facing;
  const price = 'price' in tile ? rand(tile.price) : tile.kind === 'tax' ? rand(tile.amount) : '';

  return (
    <group position={[f.x, TILE_TOP + 0.012, f.z]} rotation={[0, facing - Math.PI, 0]}>
      <Text
        font={LABEL_FONT}
        fontSize={corner ? 0.36 : 0.27}
        maxWidth={corner ? 2.3 : 1.5}
        lineHeight={1.0}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={ownerColour ?? INK}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, corner ? (PROP_FOR[tile.index] ? 0.62 : 0) : 0.4]}
      >
        {corner ? shortName(tile).toUpperCase() : shortName(tile)}
      </Text>
      {!corner && price && (
        <Text
          font={LABEL_FONT}
          fontSize={0.19}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color="#5a5344"
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 1.04]}
        >
          {price}
        </Text>
      )}
    </group>
  );
}

function Labels({ state }: { state: ObservableState }) {
  return (
    <>
      {BOARD.map((tile) => {
        const ownerId = state.tiles[tile.index]?.ownerId ?? null;
        const seat = ownerId ? state.players.findIndex((p) => p.id === ownerId) : -1;
        return (
          <TileLabel
            key={tile.index}
            tile={tile}
            ownerColour={seat >= 0 ? SEAT_INK[seat % SEAT_INK.length] ?? null : null}
          />
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------- ownership */

/**
 * A bought property carries its owner's colour along the outer edge of the
 * pad, opposite the corridor band, and a faint wash over the whole pad.
 * Mortgaged deeds go grey, so a glance shows what is earning and what is not.
 */
function Ownership({ state }: { state: ObservableState }) {
  return (
    <>
      {BOARD.map((tile) => {
        const ts = state.tiles[tile.index];
        if (!ts?.ownerId) return null;
        const seat = state.players.findIndex((p) => p.id === ts.ownerId);
        const colour = ts.mortgaged ? '#8b8578' : SEAT_HEX[seat % SEAT_HEX.length] ?? '#e0913d';
        const f = tileFootprint(tile.index);
        const across = Math.min(f.width, f.depth) - 0.1;
        const [x, , z] = onTile(tile.index, 0, f.depth / 2 - 0.1);
        const centre = onTile(tile.index, 0, 0);
        const rotation = (tileFootprint(tile.index).facing - Math.PI) as number;
        return (
          <group key={`own-${tile.index}`}>
            <mesh position={[x, TILE_TOP + 0.009, z]} rotation={[-Math.PI / 2, 0, -rotation]}>
              <planeGeometry args={[across, 0.16]} />
              <meshBasicMaterial color={colour} toneMapped={false} fog={false} />
            </mesh>
            <mesh position={[centre[0], TILE_TOP + 0.006, centre[2]]} rotation={[-Math.PI / 2, 0, -rotation]}>
              <planeGeometry args={[across, Math.max(f.width, f.depth) - 0.1]} />
              <meshBasicMaterial color={colour} transparent opacity={ts.mortgaged ? 0.08 : 0.13} toneMapped={false} fog={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------- props */

interface PropSpec {
  url: string;
  scale: number;
  /** Offset in the tile's frame: along the edge, and outward from the middle. */
  dx: number;
  dz: number;
  /** Extra turn on top of the tile's facing. */
  spin?: number;
}

/**
 * The picture on each special space. Streets carry pieces instead, so they
 * stay clear. Props sit on the inner half of a tile, where the label is not.
 */
const PROP_FOR: Record<number, PropSpec> = {
  5: { url: MODEL_PATHS.van, scale: 0.32, dx: 0, dz: -0.45, spin: Math.PI / 2 },
  15: { url: MODEL_PATHS.van, scale: 0.32, dx: 0, dz: -0.45, spin: Math.PI / 2 },
  25: { url: MODEL_PATHS.van, scale: 0.32, dx: 0, dz: -0.45, spin: Math.PI / 2 },
  35: { url: MODEL_PATHS.van, scale: 0.32, dx: 0, dz: -0.45, spin: Math.PI / 2 },
  12: { url: MODEL_PATHS.propBulb, scale: 0.6, dx: 0, dz: -0.45 },
  28: { url: MODEL_PATHS.propTap, scale: 0.6, dx: 0, dz: -0.45 },
  2: { url: MODEL_PATHS.propCardsKombi, scale: 0.8, dx: 0, dz: -0.42, spin: 0.25 },
  17: { url: MODEL_PATHS.propCardsKombi, scale: 0.8, dx: 0, dz: -0.42, spin: 0.25 },
  33: { url: MODEL_PATHS.propCardsKombi, scale: 0.8, dx: 0, dz: -0.42, spin: 0.25 },
  7: { url: MODEL_PATHS.propCardsCitywatch, scale: 0.8, dx: 0, dz: -0.42, spin: -0.25 },
  22: { url: MODEL_PATHS.propCardsCitywatch, scale: 0.8, dx: 0, dz: -0.42, spin: -0.25 },
  36: { url: MODEL_PATHS.propCardsCitywatch, scale: 0.8, dx: 0, dz: -0.42, spin: -0.25 },
  10: { url: MODEL_PATHS.propRobot, scale: 0.85, dx: -0.6, dz: -0.35, spin: 0.5 },
  20: { url: MODEL_PATHS.propCoins, scale: 0.75, dx: 0.5, dz: -0.45 },
  38: { url: MODEL_PATHS.propGantry, scale: 0.9, dx: 0, dz: -0.42 },
};

function Props() {
  return (
    <>
      {Object.entries(PROP_FOR).map(([key, spec]) => {
        const index = Number(key);
        const t = tileFootprint(index);
        const corner = index === 0 || index === 10 || index === 20 || index === 30;
        const facing = corner ? (t.z > 0 ? Math.PI : 0) : t.facing;
        return (
          <Model
            key={`prop-${index}`}
            url={spec.url}
            position={onTile(index, spec.dx, spec.dz)}
            rotationY={facing + (spec.spin ?? 0)}
            scale={spec.scale}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------- scene */

/** A flat, unlit label in the centre well. */
function WellText({
  children,
  position,
  size,
  color,
  opacity = 1,
  rotationY = 0,
}: {
  children: string;
  position: [number, number, number];
  size: number;
  color: string;
  opacity?: number;
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Text
        font={LABEL_FONT}
        fontSize={size}
        color={color}
        fillOpacity={opacity}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {children}
      </Text>
    </group>
  );
}

/** A marked zone in the well where a deck sits. */
function DeckZone({
  title,
  position,
  rotationY,
}: {
  title: string;
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <planeGeometry args={[3.5, 2.3]} />
        <meshBasicMaterial color="#5f4320" toneMapped={false} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <planeGeometry args={[3.3, 2.1]} />
        <meshBasicMaterial color="#1e1b15" toneMapped={false} fog={false} />
      </mesh>
      <WellText position={[0, 0.06, 0]} size={0.34} color="#e0913d">{title}</WellText>
    </group>
  );
}

/**
 * The centre well: a watermark, the two deck zones, and the rank pot, so the
 * middle of the board is a place rather than a hole.
 */
function Well({ state }: { state: ObservableState }) {
  const pot = state.options.jackpot ? `RANK POT  ${rand(state.pot)}` : 'AFROMOLY';
  return (
    <>
      <WellText position={[0, 0.05, -1.4]} size={1.7} color="#b4661a" opacity={0.28}>AFROMOLY</WellText>
      <WellText position={[0, 0.05, -0.1]} size={0.42} color="#b4661a" opacity={0.45}>JOHANNESBURG EDITION</WellText>
      <WellText position={[0, 0.05, 1.0]} size={0.5} color={INK}>{pot}</WellText>
      <DeckZone title="KOMBI HUSTLE" position={[-3.6, 0, 3.4]} rotationY={0.55} />
      <DeckZone title="CITY WATCH" position={[3.6, 0, -3.7]} rotationY={0.55} />
    </>
  );
}

/**
 * The playing surface is unlit: cream pads, a slightly deeper cream well, and
 * saturated corridor bands, none of which the lighting or the camera angle
 * can dim. Only the base slab and the rim keep lit materials, for depth.
 */
function useVividBoard() {
  const { scene } = useGLTF(MODEL_PATHS.board);
  return useMemo(() => {
    const replaced = new Map<string, MeshBasicMaterial>();
    const unlit = (key: string, make: () => MeshBasicMaterial) => {
      let material = replaced.get(key);
      if (!material) {
        material = make();
        replaced.set(key, material);
      }
      return material;
    };
    scene.traverse((child: Object3D) => {
      const mesh = child as Object3D & { material?: { name?: string; color?: Color } };
      if (!mesh.material?.color) return;
      const name = mesh.material.name ?? '';
      const source = mesh.material.color;
      let material: MeshBasicMaterial | null = null;
      if (name.startsWith('Group_') || name === 'HubBand' || name === 'UtilityBand') {
        material = unlit(name, () => {
          const hsl = { h: 0, s: 0, l: 0 };
          source.getHSL(hsl);
          return new MeshBasicMaterial({
            color: new Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.4), Math.min(0.56, hsl.l * 1.1)),
            toneMapped: false,
            fog: false,
          });
        });
      } else if (name === 'TileFace') {
        material = unlit(name, () => new MeshBasicMaterial({ color: PAD, toneMapped: false, fog: false }));
      } else if (name === 'CornerFace') {
        material = unlit(name, () => new MeshBasicMaterial({ color: CORNER_PAD, toneMapped: false, fog: false }));
      } else if (child.name.startsWith('centre_well')) {
        material = unlit('well', () => new MeshBasicMaterial({ color: WELL, toneMapped: false, fog: false }));
      }
      if (material) (mesh as unknown as { material: MeshBasicMaterial }).material = material;
      const applied = (mesh as unknown as { material: { fog?: boolean; needsUpdate?: boolean } }).material;
      if (applied && applied.fog !== false) {
        applied.fog = false;
        applied.needsUpdate = true;
      }
    });
    return scene;
  }, [scene]);
}

function City() {
  const { scene } = useGLTF(MODEL_PATHS.diorama);
  return <primitive object={scene} />;
}

function Scene({
  state,
  events,
  batch,
  live,
}: {
  state: ObservableState;
  events: GameEvent[];
  batch: number;
  live: React.RefObject<LivePositions>;
}) {
  const board = useVividBoard();
  return (
    <>
      <primitive object={board} />
      <City />
      <Ownership state={state} />
      <Well state={state} />
      <Props />
      <Labels state={state} />
      <Pieces state={state} events={events} batch={batch} live={live} />
      <Dice events={events} batch={batch} />
    </>
  );
}

export function Board3D({
  state,
  events,
  batch,
  focusPlayerId,
}: {
  state: ObservableState;
  /** The last batch of engine events, which the scene acts out. */
  events: GameEvent[];
  batch: number;
  /** Whose piece "My token" swoops to. Hot seat passes whoever is on the clock. */
  focusPlayerId: string | null;
}) {
  const live = useRef<LivePositions>(new Map());
  const userOrbited = useRef(false);
  // A phone cannot make forty tiles legible at once, so it opens on the piece.
  const [focus, setFocus] = useState<Focus>(() =>
    typeof window !== 'undefined' && window.innerWidth < 720 ? 'piece' : 'board',
  );
  const spot = spotOf(state, focusPlayerId) ?? [0, 0, 0];
  const focusPlayer = state.players.find((p) => p.id === focusPlayerId);
  const focusName = focusPlayer?.name ?? 'token';
  const focusTile = focusPlayer && !focusPlayer.bankrupt ? focusPlayer.position : null;

  return (
    <div className="board3d">
      <Canvas
        shadows={false}
        dpr={[1, 2]}
        camera={{ position: [0, 25, 25], fov: 34 }}
        // Filmic tone mapping was flattening the pads and greying the bands.
        gl={{ antialias: true, toneMapping: NoToneMapping }}
      >
        <color attach="background" args={['#12110d']} />
        {/*
          Fog softens the far edge of the city and nothing else. The orbit's
          maximum distance is 90, and the farthest corner of the board from
          there is about 105 away, so fog cannot start before that or zooming
          out would fade the board itself, which is exactly what it did.
        */}
        <fog attach="fog" args={['#12110d', 110, 230]} />
        <hemisphereLight intensity={0.55} color="#f4ecdc" groundColor="#1a1710" />
        <directionalLight position={[14, 24, 10]} intensity={1.4} />
        <directionalLight position={[-16, 12, -8]} intensity={0.45} color="#9ec9d8" />
        {/* The ground beyond the city's edge, so nothing floats in the void. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#0e0d0a" roughness={1} />
        </mesh>
        <Suspense fallback={null}>
          <Scene state={state} events={events} batch={batch} live={live} />
          {/*
            A procedural environment for the metal tokens to reflect. The drei
            presets fetch an HDR from GitHub at runtime, which makes the whole
            board depend on a third party being up. This one is rendered locally.
          */}
          <Environment resolution={64} environmentIntensity={0.35}>
            <Lightformer intensity={2.2} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[14, 14, 1]} color="#f4ead8" />
            <Lightformer intensity={1.2} position={[-7, 3, -6]} scale={[6, 6, 1]} color="#9ec9d8" />
            <Lightformer intensity={1.6} position={[7, 2, 5]} scale={[6, 6, 1]} color="#f0d2a8" />
          </Environment>
        </Suspense>
        <OrbitControls
          makeDefault
          onStart={() => {
            userOrbited.current = true;
          }}
          enablePan={false}
          minDistance={6}
          maxDistance={90}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.35}
          target={[0, 0, 0]}
        />
        <FitCamera
          focus={focus}
          fallback={spot}
          live={live}
          playerId={focusPlayerId}
          tileIndex={focusTile}
          userOrbited={userOrbited}
        />
      </Canvas>
      <div className="board3d-controls" role="group" aria-label="Camera">
        <button aria-pressed={focus === 'board'} onClick={() => setFocus('board')}>Whole board</button>
        <button aria-pressed={focus === 'piece'} onClick={() => setFocus('piece')} disabled={!focusPlayerId}>
          {focusName}&rsquo;s token
        </button>
      </div>
      <div className="board3d-hint">Drag to orbit, pinch or scroll to zoom.</div>
    </div>
  );
}

// Warm the cache so switching to the 3D view does not stall on first paint.
Object.values(MODEL_PATHS).forEach((path) => useGLTF.preload(path));
