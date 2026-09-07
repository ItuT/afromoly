'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Text, useGLTF } from '@react-three/drei';
import { Color, MeshBasicMaterial, NoToneMapping, Vector3, type Group, type Object3D, type PerspectiveCamera } from 'three';
import { BOARD, type ObservableState, type Tile, type TokenId } from '@afromoly/engine';
import { MODEL_PATHS, TILE_TOP, buildingSpots, onTile, tileFootprint, tokenSpot } from '@/lib/board3d';
import { rand, tileLabel } from '@/lib/display';

const SEAT_HEX = ['#e0913d', '#5fa8bd', '#7fbe92', '#c9639b', '#d9b23c', '#b48ae0'];
/** The same seats, deep enough to read as text on a cream pad. */
const SEAT_INK = ['#a8540a', '#1f6f88', '#256b3f', '#a02f72', '#8a6a08', '#6a3fb5'];
const LABEL_FONT = '/fonts/BarlowSemiCondensed-Bold.ttf';
const INK = '#151310';
const PAD = '#f4f1ea';
const CORNER_PAD = '#ebe6da';
const WELL = '#e3dccb';

/* ------------------------------------------------------------------ camera */

export type Focus = 'board' | 'piece';

/**
 * Point the camera at the whole board, or follow one piece, easing between
 * the two rather than snapping.
 *
 * A phone held upright is the case that matters for the overview: the width
 * is the limit, not the height, so the camera pulls back a long way further
 * than on a laptop and takes a steeper pitch. Following a piece is how a phone
 * gets detail, and it is the default there.
 */
function FitCamera({ focus, target }: { focus: Focus; target: [number, number, number] }) {
  const { camera, size, controls } = useThree();
  const lastClass = useRef<'portrait' | 'landscape' | null>(null);
  const lastFocus = useRef<Focus | null>(null);
  const goal = useRef<{ position: Vector3; target: Vector3; settled: boolean } | null>(null);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const klass = aspect < 1 ? 'portrait' : 'landscape';
    const refit = lastClass.current !== klass || lastFocus.current !== focus;
    const look = new Vector3(...(focus === 'piece' ? target : [0, 0, 0]));

    let distance: number;
    let direction = cam.position.clone().sub(look);
    if (focus === 'piece') {
      distance = 7.5;
      if (refit) direction.set(0, 1, 0.9);
    } else {
      const vfov = (cam.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      distance = Math.max(10.4 / Math.tan(vfov / 2), 10.8 / Math.tan(hfov / 2));
      if (refit || direction.lengthSq() < 1e-6) direction.set(0, 1, klass === 'portrait' ? 0.45 : 0.95);
    }
    direction = direction.normalize().multiplyScalar(distance);

    goal.current = { position: look.clone().add(direction), target: look, settled: false };
    lastClass.current = klass;
    lastFocus.current = focus;
  }, [camera, size.width, size.height, focus, target[0], target[1], target[2]]);

  useFrame((_, delta) => {
    const g = goal.current;
    if (!g || g.settled) return;
    const orbit = controls as { target: Vector3; update?: () => void } | null;
    const k = 1 - Math.exp(-delta * 6);
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
        <meshBasicMaterial color="#e0913d" transparent opacity={0.85} />
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

function Pieces({ state }: { state: ObservableState }) {
  const perTile = groupByTile(state);
  const current = state.players[state.currentPlayerIndex];
  const currentSpot = current ? spotOf(state, current.id) : null;

  return (
    <>
      {[...perTile.entries()].flatMap(([tileIndex, here]) =>
        here.map((player, slot) => {
          const seat = state.players.findIndex((p) => p.id === player.id);
          const url = MODEL_PATHS[player.token as TokenId] ?? MODEL_PATHS.quantum;
          return (
            <Model
              key={player.id}
              url={url}
              position={tokenSpot(tileIndex, slot, here.length)}
              rotationY={tileFootprint(tileIndex).facing}
              scale={0.8}
              tint={SEAT_HEX[seat % SEAT_HEX.length]}
            />
          );
        }),
      )}

      {currentSpot && <TurnMarker position={currentSpot} />}

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
        <meshBasicMaterial color="#5f4320" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <planeGeometry args={[3.3, 2.1]} />
        <meshBasicMaterial color="#1e1b15" toneMapped={false} />
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
          });
        });
      } else if (name === 'TileFace') {
        material = unlit(name, () => new MeshBasicMaterial({ color: PAD, toneMapped: false }));
      } else if (name === 'CornerFace') {
        material = unlit(name, () => new MeshBasicMaterial({ color: CORNER_PAD, toneMapped: false }));
      } else if (child.name.startsWith('centre_well')) {
        material = unlit('well', () => new MeshBasicMaterial({ color: WELL, toneMapped: false }));
      }
      if (material) (mesh as unknown as { material: MeshBasicMaterial }).material = material;
    });
    return scene;
  }, [scene]);
}

function Scene({ state }: { state: ObservableState }) {
  const board = useVividBoard();
  return (
    <>
      <primitive object={board} />
      <Well state={state} />
      <Props />
      <Labels state={state} />
      <Pieces state={state} />
    </>
  );
}

export function Board3D({
  state,
  focusPlayerId,
}: {
  state: ObservableState;
  /** Whose piece "My token" swoops to. Hot seat passes whoever is on the clock. */
  focusPlayerId: string | null;
}) {
  // A phone cannot make forty tiles legible at once, so it opens on the piece.
  const [focus, setFocus] = useState<Focus>(() =>
    typeof window !== 'undefined' && window.innerWidth < 720 ? 'piece' : 'board',
  );
  const spot = spotOf(state, focusPlayerId) ?? [0, 0, 0];
  const focusName = state.players.find((p) => p.id === focusPlayerId)?.name ?? 'token';

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
        <hemisphereLight intensity={0.55} color="#f4ecdc" groundColor="#1a1710" />
        <directionalLight position={[14, 24, 10]} intensity={1.4} />
        <directionalLight position={[-16, 12, -8]} intensity={0.45} color="#9ec9d8" />
        {/* A table under the board, so it does not float in the void. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]}>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#0e0d0a" roughness={1} />
        </mesh>
        <Suspense fallback={null}>
          <Scene state={state} />
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
          enablePan={false}
          minDistance={12}
          maxDistance={90}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.35}
          target={[0, 0, 0]}
        />
        <FitCamera focus={focus} target={spot} />
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
