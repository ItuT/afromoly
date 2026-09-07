'use client';

export type BoardView = '2d' | '3d';

export function ViewSwitch({
  view,
  onChange,
}: {
  view: BoardView;
  onChange: (view: BoardView) => void;
}) {
  return (
    <div className="view-switch" role="group" aria-label="Board view">
      <button aria-pressed={view === '2d'} onClick={() => onChange('2d')}>Flat</button>
      <button aria-pressed={view === '3d'} onClick={() => onChange('3d')}>3D</button>
    </div>
  );
}
