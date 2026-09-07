'use client';

import { useEffect, useState } from 'react';
import { setSoundsOn, soundsOn } from '@/lib/sound';

/**
 * Sound on or off, remembered between visits.
 *
 * The preference lives in localStorage, which the server rendering this page
 * cannot see, so the button draws as on and corrects itself once it mounts.
 */
export function SoundSwitch() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(soundsOn());
  }, []);

  const toggle = () => {
    setSoundsOn(!on);
    setOn(!on);
  };

  return (
    <div className="sound-switch">
      <button aria-pressed={on} title={on ? 'Sound is on' : 'Sound is off'} onClick={toggle}>
        {on ? 'Sound' : 'Muted'}
      </button>
    </div>
  );
}
