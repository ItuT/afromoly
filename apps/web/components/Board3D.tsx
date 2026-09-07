'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Text, useGLTF } from '@react-three/drei';
import { Color, MeshBasicMaterial, NoToneMapping, type Group, type Object3D, type PerspectiveCamera } from 'three';
import { BOARD, type ObservableState, type Tile, type TokenId } from '@afromoly/engine';
import { MODEL_PATHS, TILE_TOP, buildingSpots, tileFootprint, tokenSpot } from '@/lib/board3d';
import { rand, tileLabel } from '@/lib/display';

const SEAT_HEX = ['#e0913d', '#5fa8bd', '#7fbe92', '#c9639b', '#d9b23c', '#b48ae0'];
const LABEL_FONT = '/fonts/BarlowSemiCondensed-Bold.ttf';
const OUTLINE = '#15130d';

/* ------------------------------------------------------------------ camera */

export type Focus = 'board' | 'piece';

/**
 * Point the camera at the whole board, or swoop in on one piece.
 *
 * A phone held upright is the case that matters for the overview: the width
 * is the limit, not the height, so the camera has to pull back a long way
 * further than it does on a laptop, and a steeper pitch wastes less of the
 * narrow width on perspective. Following a piece is how a phone gets detail.
 */
function FitCamera({ focus, target }: { focus: Focus; target: [number, number, number] }) {
  const { camera, size, controls } = useThree();
  const lastClass = useRef<'portrait' | 'landscape' | null>(null);
  const lastFocus = useRef<Focus | null>(null);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const orbit = controls as { target: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null;
    const aspect = size.width / Math.max(size.height, 1);
    const klass = aspect < 1 ? 'portrait' : 'landscape';
    const refit = lastClass.current !== klass || lastFocus.current !== focus;

    let distance: number;
    let direction = cam.position.clone();
    if (focus === 'piece') {
      distance = 7.5;
      if (refit) direction.set(0, 1, 0.9);
      orbit?.target.set(target[0], target[1], target[2]);
      direction = direction.normalize().multiplyScalar(distance);
      cam.position.set(target[0] + direction.x, target[1] + direction.y, target[2] + direction.z);
      cam.lookAt(target[0], target[1], target[2]);
    } else {
      const vfov = (cam.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      // Half extents the board needs, with a little air around the rim.
      distance = Math.max(10.4 / Math.tan(vfov / 2), 10.8 / Math.tan(hfov / 2));
      if (refit || direction.lengthSq() === 0) direction.set(0, 1, klass === 'portrait' ? 0.45 : 0.95);
      orbit?.target.set(0, 0, 0);
      direction = direction.normalize().multiplyScalar(distance);
      cam.position.copy(direction);
      cam.lookAt(0, 0, 0);
    }
    lastClass.current = klass;
    lastFocus.current = focus;
    cam.updateProjectionMatrix();
    orbit?.update?.();
  }, [camera, controls, size.width, size.height, focus, target[0], target[1], target[2]]);

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
        color={ownerColour ?? '#ffffff'}
        outlineWidth={0.022}
        outlineColor={OUTLINE}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, corner ? 0 : 0.4]}
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
          color="#f1e9d8"
          outlineWidth={0.016}
          outlineColor={OUTLINE}
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
            ownerColour={seat >= 0 ? SEAT_HEX[seat % SEAT_HEX.length] ?? null : null}
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
      <WellText position={[0, 0.05, -1.4]} size={1.7} color="#e0913d" opacity={0.12}>AFROMOLY</WellText>
      <WellText position={[0, 0.05, -0.1]} size={0.42} color="#e0913d" opacity={0.18}>JOHANNESBURG EDITION</WellText>
      <WellText position={[0, 0.05, 1.0]} size={0.5} color="#f4ead8">{pot}</WellText>
      <DeckZone title="KOMBI HUSTLE" position={[-3.6, 0, 3.4]} rotationY={0.55} />
      <DeckZone title="CITY WATCH" position={[3.6, 0, -3.7]} rotationY={0.55} />
    </>
  );
}

/**
 * The corridor bands come out of the lit pipeline looking pastel, so their
 * materials are replaced with unlit, more saturated versions at load time.
 */
function useVividBoard() {
  const { scene } = useGLTF(MODEL_PATHS.board);
  return useMemo(() => {
    const replaced = new Map<string, MeshBasicMaterial>();
    scene.traverse((child: Object3D) => {
      const mesh = child as Object3D & { material?: { name?: string; color?: Color } };
      const name = mesh.material?.name ?? '';
      const isBand = name.startsWith('Group_') || name === 'HubBand' || name === 'UtilityBand';
      if (!isBand || !mesh.material?.color) return;
      let material = replaced.get(name);
      if (!material) {
        const hsl = { h: 0, s: 0, l: 0 };
        mesh.material.color.getHSL(hsl);
        const color = new Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.35), Math.min(0.62, hsl.l * 1.15));
        material = new MeshBasicMaterial({ color, toneMapped: false });
        replaced.set(name, material);
      }
      (mesh as unknown as { material: MeshBasicMaterial }).material = material;
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
  const [focus, setFocus] = useState<Focus>('board');
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
