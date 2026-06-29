from dataclasses import dataclass


@dataclass
class DriverInfo:
    id: int
    name: str
    vehicle: str
    vehicle_class: str
    position: int
    total_laps: int
    gap_to_leader: float | None
    laps_behind_leader: int
    best_lap: float | None
    last_lap: float | None
    best_s1: float | None
    best_s2: float | None
    best_lap_s1: float | None
    best_lap_s2: float | None
    best_s3: float | None
    in_pit: bool
    pit_state: int
    num_pitstops: int
    fuel_fraction: float
    is_player: bool