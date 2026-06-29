from dataclasses import dataclass
from typing import List
from models.driver import DriverInfo


@dataclass
class SessionState:
    track: str
    session_type: int
    time_remaining: float
    game_phase: int
    raining: float
    track_temp: float
    track_grip: int
    drivers: List[DriverInfo]