import { useEffect, useRef, useState } from "react";

/** Flashes true for `duration` ms whenever `shouldFlash(prev, curr)` returns true. Skips the initial mount. */
export function useFlash<T>(
  value: T,
  shouldFlash: (prev: T, curr: T) => boolean,
  duration = 1500,
): boolean {
  const prevRef = useRef(value);
  const mountedRef = useRef(false);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;

    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (shouldFlash(prev, value)) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), duration);
      return () => clearTimeout(t);
    }
  }, [value, shouldFlash, duration]);

  return flashing;
}

export type PositionDelta = { flashing: boolean; direction: "up" | "down" | null };

/** Tracks position changes and reports the direction of movement for a short window. */
export function usePositionChange(position: number, duration = 1500): PositionDelta {
  const prevRef = useRef(position);
  const mountedRef = useRef(false);
  const [state, setState] = useState<PositionDelta>({ flashing: false, direction: null });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = position;

    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (prev !== position) {
      const direction = position < prev ? "up" : "down";
      setState({ flashing: true, direction });
      const t = setTimeout(() => setState({ flashing: false, direction: null }), duration);
      return () => clearTimeout(t);
    }
  }, [position, duration]);

  return state;
}

/** Flashes true whenever a numeric value improves (decreases) versus its previous value. */
export function useImproved(value: number | null, duration = 1800): boolean {
  return useFlash(
    value,
    (prev, curr) => curr !== null && (prev === null || curr < prev),
    duration,
  );
}
