from models.driver import DriverInfo
from models.session import SessionState


def _sentinel(value: float) -> float | None:
    """Retourne None si la valeur est négative (sentinelle LMU = -1.0)"""
    return value if value >= 0 else None


def _calc_s3(best_lap: float | None, best_lap_s2: float | None) -> float | None:
    """Calcule S3 = best_lap - S1+S2 du meilleur tour"""
    if best_lap is None or best_lap_s2 is None:
        return None
    return best_lap - best_lap_s2


def serialize_driver(v) -> DriverInfo:
    best_lap = _sentinel(v.mBestLapTime)
    best_lap_s2 = _sentinel(v.mBestLapSector2)

    return DriverInfo(
        id=v.mID,
        name=v.mDriverName.decode(errors="ignore").strip(),
        vehicle=v.mVehicleName.decode(errors="ignore").strip(),
        vehicle_class=v.mVehicleClass.decode(errors="ignore").strip(),
        position=v.mPlace,
        total_laps=v.mTotalLaps,
        gap_to_leader = None,
        laps_behind_leader=v.mLapsBehindLeader,
        best_lap=best_lap,
        last_lap=_sentinel(v.mLastLapTime),
        best_s1=_sentinel(v.mBestSector1),
        best_s2=_sentinel(v.mBestSector2),
        best_lap_s1=_sentinel(v.mBestLapSector1),
        best_lap_s2=best_lap_s2,
        best_s3=_calc_s3(best_lap, best_lap_s2),
        in_pit=bool(v.mInPits),
        pit_state=v.mPitState,
        num_pitstops=v.mNumPitstops,
        fuel_fraction=round(v.mFuelFraction / 255 * 100, 1),
        is_player=bool(v.mIsPlayer),
    )


def serialize_session(snapshot) -> SessionState:
    s = snapshot.scoring
    info = s.scoringInfo
    total = info.mNumVehicles

    drivers = [
        serialize_driver(s.vehScoringInfo[i])
        for i in range(total)
    ]

    drivers.sort(key=lambda d: d.position)

    # Calcul des écarts en practice (différence de best lap)
    best_lap_overall = next(
        (d.best_lap for d in drivers if d.best_lap is not None), None
    )
    for d in drivers:
        if d.position == 1:
            d.gap_to_leader = None
        elif best_lap_overall is not None and d.best_lap is not None:
            d.gap_to_leader = round(d.best_lap - best_lap_overall, 3)
        else:
            d.gap_to_leader = None

    return SessionState(
        track=info.mTrackName.decode(errors="ignore").strip(),
        session_type=info.mSession,
        time_remaining=info.mSessionTimeRemaining,
        game_phase=info.mGamePhase,
        raining=round(info.mRaining, 3),
        track_temp=round(info.mTrackTemp, 1),
        track_grip=info.mTrackGripLevel,
        drivers=drivers,
    )