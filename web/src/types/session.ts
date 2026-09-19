export interface DriverInfo {
  id: number;
  name: string;
  vehicle: string;
  vehicle_class: string;
  position: number;
  total_laps: number;
  gap_to_leader: number | null;
  laps_behind_leader: number;
  best_lap: number | null;
  last_lap: number | null;
  best_s1: number | null;
  best_s2: number | null;
  best_lap_s1: number | null;
  best_lap_s2: number | null;
  best_s3: number | null;
  in_pit: boolean;
  pit_state: number;
  num_pitstops: number;
  fuel_fraction: number;
  is_player: boolean;
}

export interface SessionState {
  track: string;
  session_type: number;
  time_remaining: number;
  game_phase: number;
  raining: number;
  track_temp: number;
  track_grip: number;
  sector_flags: number[];
  drivers: DriverInfo[];
}
