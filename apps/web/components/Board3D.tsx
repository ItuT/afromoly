'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Text, useGLTF } from '@react-three/drei';
import type { Group, Object3D, PerspectiveCamera } from 'three';
import { BOARD, type ObservableState, type Tile, type TokenId } from '@afromoly/engine';
import { MODEL_PATHS, TILE_TOP, buildingSpots, tileFootprint, tokenSpot } from '@/lib/board3d';
import { rand, tileLabel } from '@/lib/display';

const SEAT_HEX = ['#e0913d', '#5fa8bd', '#7fbe92', '#c9639b', '#d9b23c', '#b48ae0'];
const LABEL_FONT = '/fonts/BarlowSemiCondensed-SemiBold.ttf';

/* ------------------------------------------------------------------ camera */

/**
 * Keep the whole board in view whatever shape the canvas is.
 *
 * A phone held upright is the case that matters: the width is the limit, not
 * the height, so the camera has to pull back a long way further than it does
 * on a laptop. The pitch also steepens on a portrait canvas, because a more
 * top-down view wastes less of the narrow width on perspective.
 */
function FitCamera() {
  const { camera, size, controls } = useThree();
  const lastClass = useRef<'portrait' | 'landscape' | null>(null);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);

    // Half extents the board needs, with a little air around the rim.
    const needVertical = 11 / Math.tan(vfov / 2);
    const needHorizontal = 11.5 / Math.tan(hfov / 2);
    const distance = Math.max(needVertical, needHorizontal);

    const klass = aspect < 1 ? 'portrait' : 'landscape';
    let direction = cam.position.clone();
    if (lastClass.current !== klass || direction.lengthSq() === 0) {
      direction.set(0, 1, klass === 'portrait' ? 0.7 : 1);
      lastClass.current = klass;
    }
    direction = direction.normalize().multiplyScalar(distance);
    cam.position.copy(direction);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    (controls as { update?: () => void } | null)?.update?.();
  }, [camera, controls, size.width, size.height]);

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
        <ringGeometry args={[0.62, 0.74, 24]} />
        <meshBasicMaterial color="#e0913d" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function Pieces({ state }: { state: ObservableState }) {
  const active = state.players.filter((p) => !p.bankrupt);
  const perTile = new Map<number, typeof active>();
  for (const player of active) {
    const list = perTile.get(player.position) ?? [];
    list.push(player);
    perTile.set(player.position, list);
  }

  const current = state.players[state.currentPlayerIndex];
  const currentSpot =
    current && !current.bankrupt
      ? tokenSpot(
          current.position,
          (perTile.get(current.position) ?? []).indexOf(current),
          (perTile.get(current.position) ?? []).length,
        )
      : null;

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
              scale={0.62}
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
            <Model key={`depot-${tile.index}`} url={MODEL_PATHS.depot} position={spot} rotationY={facing} scale={0.36} />
          ) : null;
        }
        if (ts.vans === 0) return null;
        return buildingSpots(tile.index, ts.vans).map((spot, i) => (
          <Model key={`van-${tile.index}-${i}`} url={MODEL_PATHS.van} position={spot} rotationY={facing} scale={0.3} />
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
        fontSize={corner ? 0.3 : 0.2}
        maxWidth={corner ? 2.2 : 1.42}
        lineHeight={1.02}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={ownerColour ?? '#ece5d6'}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, corner ? 0 : 0.42]}
      >
        {corner ? shortName(tile).toUpperCase() : shortName(tile)}
      </Text>
      {!corner && price && (
        <Text
          font={LABEL_FONT}
          fontSize={0.15}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color="#9a917f"
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 1.0]}
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

function Scene({ state }: { state: ObservableState }) {
  const { scene } = useGLTF(MODEL_PATHS.board);
  return (
    <>
      <primitive object={scene} />
      <Labels state={state} />
      <Pieces state={state} />
    </>
  );
}

export function Board3D({ state }: { state: ObservableState }) {
  return (
    <div className="board3d">
      <Canvas shadows={false} dpr={[1, 2]} camera={{ position: [0, 25, 25], fov: 34 }} gl={{ antialias: true }}>
        <color attach="background" args={['#12110d']} />
        <hemisphereLight intensity={0.45} color="#f0e6d2" groundColor="#1a1710" />
        <directionalLight position={[14, 24, 10]} intensity={1.15} />
        <directionalLight position={[-16, 12, -8]} intensity={0.35} color="#9ec9d8" />
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
          <Environment resolution={64} environmentIntensity={0.28}>
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
        <FitCamera />
      </Canvas>
      <div className="board3d-hint faint">Drag to orbit, pinch or scroll to zoom.</div>
    </div>
  );
}

// Warm the cache so switching to the 3D view does not stall on first paint.
Object.values(MODEL_PATHS).forEach((path) => useGLTF.preload(path));
