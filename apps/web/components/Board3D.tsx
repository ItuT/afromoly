'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, useGLTF } from '@react-three/drei';
import type { Group, Object3D } from 'three';
import { BOARD, type ObservableState, type TokenId } from '@afromoly/engine';
import { MODEL_PATHS, buildingSpots, tileFootprint, tokenSpot } from '@/lib/board3d';

const SEAT_HEX = ['#e0913d', '#5fa8bd', '#7fbe92', '#c9639b', '#d9b23c', '#b48ae0'];

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
        const mesh = child as Object3D & { material?: { color?: { set: (c: string) => void }; clone?: () => unknown } };
        if (mesh.material && typeof mesh.material.clone === 'function') {
          const material = mesh.material.clone() as { color?: { set: (c: string) => void } };
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
  const currentSpot = current && !current.bankrupt
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
          const spot = tokenSpot(tileIndex, slot, here.length);
          return (
            <Model
              key={player.id}
              url={url}
              position={spot}
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
        const footprint = tileFootprint(tile.index);
        if (ts.depot) {
          const [spot] = buildingSpots(tile.index, 1);
          return spot ? (
            <Model
              key={`depot-${tile.index}`}
              url={MODEL_PATHS.depot}
              position={spot}
              rotationY={footprint.facing}
              scale={0.36}
            />
          ) : null;
        }
        if (ts.vans === 0) return null;
        return buildingSpots(tile.index, ts.vans).map((spot, i) => (
          <Model
            key={`van-${tile.index}-${i}`}
            url={MODEL_PATHS.van}
            position={spot}
            rotationY={footprint.facing}
            scale={0.30}
          />
        ));
      })}
    </>
  );
}

function Scene({ state }: { state: ObservableState }) {
  const { scene } = useGLTF(MODEL_PATHS.board);
  return (
    <>
      <primitive object={scene} />
      <Pieces state={state} />
    </>
  );
}

export function Board3D({ state }: { state: ObservableState }) {
  return (
    <div className="board3d">
      <Canvas
        shadows={false}
        dpr={[1, 2]}
        camera={{ position: [0, 25, 25], fov: 34 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#12110d']} />
        <hemisphereLight intensity={0.45} color="#f0e6d2" groundColor="#1a1710" />
        <directionalLight position={[14, 24, 10]} intensity={1.15} />
        <directionalLight position={[-16, 12, -8]} intensity={0.35} color="#9ec9d8" />
        <Suspense fallback={null}>
          <Scene state={state} />
          <Environment preset="city" environmentIntensity={0.2} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={16}
          maxDistance={52}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI / 2.35}
          target={[0, 0, 0]}
        />
      </Canvas>
      <div className="board3d-hint faint">Drag to orbit, scroll to zoom.</div>
    </div>
  );
}

// Warm the cache so switching to the 3D view does not stall on first paint.
Object.values(MODEL_PATHS).forEach((path) => useGLTF.preload(path));
