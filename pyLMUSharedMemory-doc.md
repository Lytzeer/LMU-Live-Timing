# pyLMUSharedMemory — Documentation

Python library for reading Le Mans Ultimate's built-in shared memory interface.

Source: `bridge/pyLMUSharedMemory/`

Based on:
- LMU `SharedMemoryInterface` header by S397 (game folder `Support\SharedMemoryInterface`)
- [pyRfactor2SharedMemory](https://github.com/TonyWhitley/pyRfactor2SharedMemory) by Tony Whitley

---

## How it works

Le Mans Ultimate writes live simulation data to a **shared memory file** named `LMU_Data`. Any external process on the same machine can read it via memory-mapped file (mmap) — no network, no API, zero-copy, zero latency.

### Platform differences

| Platform | Mechanism | Location |
|----------|-----------|----------|
| Windows  | Named shared memory — `mmap.mmap(-1, size, name)` | OS-managed |
| Linux    | File-backed mmap — `open("/dev/shm/LMU_Data", "a+b")` | `/dev/shm/` |

`platform_mmap()` in `lmu_mmap.py` handles this transparently.

### Memory layout

The shared memory block (~324 KB) maps directly to one C struct `LMUObjectOut`. Python reads it with `ctypes` — no serialization, no parsing.

```
LMUObjectOut
├── generic         (LMUGeneric)       — version, events, FFB, app window
│   ├── events      (LMUEvent)         — update flags (scoring/telemetry active?)
│   ├── gameVersion (int)
│   ├── FFBTorque   (float)
│   └── appInfo     (LMUApplicationState)
├── paths           (LMUPathData)      — filesystem paths (user data, plugins…)
├── scoring         (LMUScoringData)   — session + all vehicles' scoring data
│   ├── scoringInfo (LMUScoringInfo)   — track, session type, weather, flags…
│   └── vehScoringInfo[104]            — per-vehicle scoring (position, lap times…)
└── telemetry       (LMUTelemetryData) — physics data for all vehicles
    └── telemInfo[104]                 — per-vehicle telemetry (RPM, speed, wheels…)
```

Maximum 104 vehicles (`MAX_MAPPED_VEHICLES`).

---

## Modules

### `lmu_data.py` — data structures

All `ctypes.Structure` classes mirror the game's C++ structs. `_pack_ = 4` alignment must match the game binary exactly.

| Class | Maps to | Purpose |
|-------|---------|---------|
| `LMUObjectOut` | `SharedMemoryObjectOut` | Root struct — entire shared memory block |
| `LMUGeneric` | `SharedMemoryGeneric` | Game version, events, FFB |
| `LMUEvent` | `SharedMemoryEvent` (enum→struct) | Update event flags |
| `LMUScoringData` | `SharedMemoryScoringData` | Session scoring container |
| `LMUScoringInfo` | `ScoringInfoV01` | Track/session/weather info |
| `LMUVehicleScoring` | `VehicleScoringInfoV01` | Per-vehicle race data |
| `LMUTelemetryData` | `SharedMemoryTelemetryData` | Telemetry container |
| `LMUVehicleTelemetry` | `TelemInfoV01` | Per-vehicle physics |
| `LMUWheel` | `TelemWheelV01` | Per-wheel data (×4 per vehicle) |
| `LMUVect3` | `TelemVect3` | 3D vector (x, y, z) |
| `LMUPathData` | `SharedMemoryPathData` | Game filesystem paths |
| `LMUApplicationState` | `ApplicationStateV01` | Window/screen info |
| `SimInfo` | — | Legacy simple wrapper (Windows-only direct access) |

`SimInfo` opens the mmap and exposes `LMUData` directly into live memory with no copy safety. Prefer `MMapControl` for new code.

---

### `lmu_mmap.py` — memory map control

`MMapControl` is the main interface.

```python
from pyLMUSharedMemory import lmu_data
from pyLMUSharedMemory.lmu_mmap import MMapControl, LMUConstants

info = MMapControl(LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
info.create(access_mode=0)  # 0 = copy mode, 1 = direct mode
```

#### Access modes

| Mode | Value | Description |
|------|-------|-------------|
| Copy | `0` | Reads mmap into a local `bytearray`. `data` points to the copy. Safer — avoids mid-update reads. |
| Direct | `1` | `data` points live into the mmap buffer. Lower overhead, risk of data tearing. |

#### Update mechanism (copy mode)

Call `info.update()` each frame. In copy mode it checks two conditions before copying:

1. `SME_UPDATE_SCORING` or `SME_UPDATE_TELEMETRY` event flag is set (game actively writing)
2. `scoringInfo.mNumVehicles == telemetry.activeVehicles` (data is consistent)

If both pass, the full mmap block is atomically copied to the local buffer. This prevents reading half-written data.

In direct mode `update()` is a no-op.

#### Lifecycle

```python
info.create(0)      # open mmap, allocate buffer
info.update()       # refresh buffer (call each frame)
_ = info.data.scoring.scoringInfo.mTrackName  # read
info.close()        # snapshot final state, close mmap handle
```

After `close()`, `info.data` still holds the last snapshot. `info.update` becomes `None`.

---

### `lmu_enum.py` — enumerations

Typed enums for integer fields in the shared memory.

| Enum | Field | Values |
|------|-------|--------|
| `LMUSession` | `mSession` | `TestDay`, `Practice1`…`Race4` |
| `LMUGamePhase` | `mGamePhase` | `GreenFlag`, `FullCourseYellow`, `SessionOver`… |
| `LMUYellowFlagState` | `mYellowFlagState` | `PitOpen`, `LastLap`, `Resume`… |
| `LMUVehicleClass` | `mVehicleClass` | `Hypercar`, `LMP2`, `GT3`… |
| `LMUVehicleChampionship` | `mVehicleChampionship` | `WEC_2024`, `ELMS_2025`… |
| `LMUCompoundType` | `mCompoundType` | `Soft`, `Medium`, `Hard`, `Wet` |
| `LMUWheelIndex` | array index | `FrontLeft=0`, `FrontRight=1`, `RearLeft=2`, `RearRight=3` |
| `LMUSurfaceType` | `mSurfaceType` | `Dry`, `Wet`, `Grass`, `Gravel`… |
| `LMUPitState` | `mPitState` | `Request`, `Entering`, `Stopped`, `Exiting` |
| `LMUFinishStatus` | `mFinishStatus` | `Finished`, `Dnf`, `Dq` |
| `LMUControl` | `mControl` | `Player`, `AI`, `Remote` |
| `LMUTrackGripLevel` | `mTrackGripLevel` | `Green`, `Low`, `Medium`, `High`, `Saturated` |
| `LMUCloudCoverage` | `mCloudCoverage` | `Clear` → `OvercastAndStorm` |
| `LMURearFlapLegalStatus` | `mRearFlapLegalStatus` | DRS allowed/disallowed |
| `LMUWiperStatus` | `mWiperState` | `Off`, `Auto`, `Slow`, `Fast` |

`enum_map()` builds a fast `dict`-backed lookup function to avoid per-call enum iteration:

```python
COMPOUND = lmu_enum.enum_map(lmu_enum.LMUCompoundType)
print(COMPOUND(0))  # "Soft"
```

---

### `lmu_type.py` — type hints

Abstract stub classes mirroring `lmu_data.py` with Python type annotations. Not instantiable — only for IDE autocomplete and static type checking.

---

## Usage examples

### Basic read loop

```python
from pyLMUSharedMemory import lmu_data
from pyLMUSharedMemory.lmu_mmap import MMapControl, LMUConstants

info = MMapControl(LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
info.create(access_mode=0)  # copy mode

while True:
    info.update()

    if not info.data.generic.gameVersion:
        print("Game not running")
        continue

    scoring = info.data.scoring.scoringInfo
    print(f"Track: {scoring.mTrackName.decode()}")
    print(f"Vehicles: {scoring.mNumVehicles}")

    idx = info.data.telemetry.playerVehicleIdx
    telem = info.data.telemetry.telemInfo[idx]
    print(f"RPM: {telem.mEngineRPM:.0f}  Gear: {telem.mGear}")
```

### Per-vehicle scoring loop

```python
total = info.data.scoring.scoringInfo.mNumVehicles
for i in range(total):
    v = info.data.scoring.vehScoringInfo[i]
    print(f"P{v.mPlace} {v.mDriverName.decode()} — best: {v.mBestLapTime:.3f}s")
```

### Wheel data

```python
from pyLMUSharedMemory import lmu_enum

idx = info.data.telemetry.playerVehicleIdx
wheels = info.data.telemetry.telemInfo[idx].mWheels

for wi in lmu_enum.LMUWheelIndex:
    w = wheels[wi.value]
    compound = lmu_enum.LMUCompoundType(w.mCompoundType).name
    print(f"{wi.name}: compound={compound}  wear={w.mWear:.2f}  temp={w.mTemperature[1] - 273.15:.1f}°C")
```

### Decode bytes fields

String fields are `bytes` — always `.decode()` before use:

```python
track = info.data.scoring.scoringInfo.mTrackName.decode()
driver = info.data.scoring.vehScoringInfo[0].mDriverName.decode()
```

---

## Key constants

| Constant | Value | Description |
|----------|-------|-------------|
| `LMUConstants.LMU_SHARED_MEMORY_FILE` | `"LMU_Data"` | Shared memory file name |
| `LMUConstants.LMU_PROCESS_NAME` | `"Le Mans Ultimate"` | Game process name |
| `LMUConstants.MAX_MAPPED_VEHICLES` | `104` | Max vehicles in arrays |
| `LMUConstants.MAX_PATH_LENGTH` | `260` | Max path length (Windows ANSI limit) |

---

## Sector index quirk

`mSector` values are not sequential — this is intentional in the game's API:

| Value | Actual sector |
|-------|--------------|
| `0` | Sector 3 |
| `1` | Sector 1 |
| `2` | Sector 2 |

Use `lmu_enum.LMUSector` to map these correctly.

---

## Struct size reference

Expected sizes verified against the game binary in `tests/read_lmu_api.py`:

| Struct | Size (bytes) |
|--------|-------------|
| `LMUVect3` | 24 |
| `LMUWheel` | 260 |
| `LMUVehicleTelemetry` | 1 888 |
| `LMUVehicleScoring` | 584 |
| `LMUScoringInfo` | 548 |
| `LMUApplicationState` | 260 |
| `LMUScoringData` | 126 832 |
| `LMUTelemetryData` | 196 356 |
| `LMUPathData` | 1 300 |
| `LMUEvent` | 64 |
| `LMUGeneric` | 332 |
| `LMUObjectOut` | 324 820 |

---

## Field Reference

Complete listing of every readable field, organized by struct. Access fields via the `.data` attribute of `MMapControl`:

```python
d = ctrl.data
# e.g. d.scoring.scoringInfo.mTrackName
```

---

### `LMUObjectOut` — Root object

| Field | Type | Description |
|-------|------|-------------|
| `generic` | `LMUGeneric` | Events, game version, FFB torque, app window state |
| `paths` | `LMUPathData` | Filesystem paths used by the game |
| `scoring` | `LMUScoringData` | Session scoring info + per-vehicle scoring |
| `telemetry` | `LMUTelemetryData` | Per-vehicle physics / telemetry data |

---

### `LMUGeneric`

| Field | Type | Description |
|-------|------|-------------|
| `events` | `LMUEvent` | Monotonically-incrementing counters, one per event type |
| `gameVersion` | `int` | Game version integer |
| `FFBTorque` | `float` | Force-feedback torque value |
| `appInfo` | `LMUApplicationState` | Application window state |

---

### `LMUEvent` — Event counters

Each field is a `uint` that increments each time the event fires. Compare delta between reads to detect events.

| Field | Description |
|-------|-------------|
| `SME_ENTER` | Plugin entered |
| `SME_EXIT` | Plugin exited |
| `SME_STARTUP` | Game startup |
| `SME_SHUTDOWN` | Game shutdown |
| `SME_LOAD` | Track / session loaded |
| `SME_UNLOAD` | Track / session unloaded |
| `SME_START_SESSION` | Session started |
| `SME_END_SESSION` | Session ended |
| `SME_ENTER_REALTIME` | Entered realtime (player on track) |
| `SME_EXIT_REALTIME` | Exited realtime (returned to monitor) |
| `SME_UPDATE_SCORING` | Scoring data updated — triggers copy-mode buffer swap |
| `SME_UPDATE_TELEMETRY` | Telemetry data updated — triggers copy-mode buffer swap |
| `SME_INIT_APPLICATION` | Application initialized |
| `SME_UNINIT_APPLICATION` | Application uninitialized |
| `SME_SET_ENVIRONMENT` | Environment set |
| `SME_FFB` | Force-feedback event |

---

### `LMUApplicationState`

| Field | Type | Description |
|-------|------|-------------|
| `mAppWindow` | `uint64` | HWND application window handle (Windows only) |
| `mWidth` | `uint` | Screen width in pixels |
| `mHeight` | `uint` | Screen height in pixels |
| `mRefreshRate` | `uint` | Monitor refresh rate (Hz) |
| `mWindowed` | `uint` | `1` = windowed mode, `0` = fullscreen |
| `mOptionsLocation` | `uint8` | Current UI location: `0`=main UI, `1`=track loading, `2`=monitor, `3`=on track |
| `mOptionsPage` | `bytes[31]` | Name of the active options page |

---

### `LMUPathData` — Filesystem paths

All fields are `bytes[260]`. Decode with `.decode('utf-8')`.

| Field | Description |
|-------|-------------|
| `userData` | Path to the user data directory |
| `customVariables` | Path to the custom variables file |
| `stewardResults` | Path to steward results output |
| `playerProfile` | Path to the player profile file |
| `pluginsFolder` | Path to the plugins folder |

---

### `LMUScoringData`

| Field | Type | Description |
|-------|------|-------------|
| `scoringInfo` | `LMUScoringInfo` | Session-level info (track, weather, phase…) |
| `scoringStreamSize` | `bytes[12]` | Internal — size metadata for `scoringStream` |
| `vehScoringInfo` | `LMUVehicleScoring[104]` | Per-vehicle scoring; valid entries = `scoringInfo.mNumVehicles` |
| `scoringStream` | `bytes[65536]` | Newline-delimited, null-terminated results text stream |

---

### `LMUScoringInfo` — Session-level info

| Field | Type | Unit / Range | Description |
|-------|------|--------------|-------------|
| `mTrackName` | `bytes[64]` | — | Current track name |
| `mSession` | `int` | `LMUSession` | Session type (0=test day … 13=race 4) |
| `mCurrentET` | `double` | seconds | Current elapsed time |
| `mEndET` | `double` | seconds | Session end time (`-1` = no time limit) |
| `mMaxLaps` | `int` | laps | Maximum laps (`-1` = no lap limit) |
| `mLapDist` | `double` | meters | Total track length |
| `mNumVehicles` | `int` | — | Number of vehicles currently in session |
| `mGamePhase` | `uint8` | `LMUGamePhase` | Current game phase (0–9) |
| `mYellowFlagState` | `int8` | `LMUYellowFlagState` | Full-course yellow state (−1 to 7) |
| `mSectorFlag` | `uint8[3]` | — | Local yellow per sector (`0`=none, `1`=yellow) |
| `mStartLight` | `uint8` | — | Current start light frame index |
| `mNumRedLights` | `uint8` | — | Number of red lights in the start sequence |
| `mInRealtime` | `bool` | — | `True` if player is on track (not in monitor) |
| `mPlayerName` | `bytes[32]` | — | Local player display name |
| `mPlrFileName` | `bytes[64]` | — | Player profile filename |
| `mDarkCloud` | `double` | 0.0–1.0 | Cloud darkness fraction |
| `mRaining` | `double` | 0.0–1.0 | Rain severity |
| `mAmbientTemp` | `double` | °C | Ambient air temperature |
| `mTrackTemp` | `double` | °C | Track surface temperature |
| `mWind` | `LMUVect3` | m/s | Wind velocity vector |
| `mMinPathWetness` | `double` | 0.0–1.0 | Minimum wetness on racing line |
| `mMaxPathWetness` | `double` | 0.0–1.0 | Maximum wetness on racing line |
| `mAvgPathWetness` | `double` | 0.0–1.0 | Average wetness on racing line |
| `mGameMode` | `uint8` | `LMUGameMode` | `1`=server, `2`=client, `3`=both |
| `mIsPasswordProtected` | `bool` | — | Server requires a password |
| `mServerPort` | `uint16` | — | Server port number |
| `mServerPublicIP` | `uint32` | — | Server public IP (packed uint32) |
| `mMaxPlayers` | `int` | — | Maximum players allowed |
| `mServerName` | `bytes[32]` | — | Server name |
| `mStartET` | `float` | seconds since midnight | Event start time (wall clock) |
| `mSessionTimeRemaining` | `float` | seconds | Time remaining in session |
| `mTimeOfDay` | `float` | seconds since midnight | Current in-game time of day |
| `mIsFixedSetup` | `bool` | — | Setups are locked |
| `mTrackGripLevel` | `uint8` | `LMUTrackGripLevel` | Track rubber level (0=green … 4=saturated) |
| `mCloudCoverage` | `uint8` | `LMUCloudCoverage` | Sky condition (0=clear … 10=storm) |
| `mTrackLimitsStepsPerPenalty` | `uint8` | — | Track limits steps before a penalty is issued |
| `mTrackLimitsStepsPerPoint` | `uint8` | — | Track limits steps awarded per exceedance point |

---

### `LMUVehicleScoring` — Per-vehicle scoring

Iterate `vehScoringInfo[:scoringInfo.mNumVehicles]`.

| Field | Type | Unit / Range | Description |
|-------|------|--------------|-------------|
| `mID` | `int` | — | Slot ID (can be reused after a disconnect) |
| `mDriverName` | `bytes[32]` | — | Driver display name |
| `mVehicleName` | `bytes[64]` | — | Vehicle name |
| `mTotalLaps` | `int16` | laps | Completed laps |
| `mSector` | `int8` | `LMUSector` | Current sector — **0=S3, 1=S1, 2=S2** (see quirk note) |
| `mFinishStatus` | `int8` | `LMUFinishStatus` | `0`=none, `1`=finished, `2`=DNF, `3`=DQ |
| `mLapDist` | `double` | meters | Distance traveled around current lap |
| `mPathLateral` | `double` | meters | Lateral offset from approximate track centerline |
| `mTrackEdge` | `double` | meters | Distance to track edge on the vehicle's side |
| `mBestSector1` | `double` | seconds | All-time best sector 1 time |
| `mBestSector2` | `double` | seconds | All-time best cumulative S1+S2 time |
| `mBestLapTime` | `double` | seconds | All-time best lap time |
| `mLastSector1` | `double` | seconds | Last lap sector 1 time |
| `mLastSector2` | `double` | seconds | Last lap cumulative S1+S2 time |
| `mLastLapTime` | `double` | seconds | Last completed lap time |
| `mCurSector1` | `double` | seconds | Current lap S1 (0 if not yet completed) |
| `mCurSector2` | `double` | seconds | Current lap cumulative S1+S2 (0 if not yet completed) |
| `mNumPitstops` | `int16` | — | Total pitstops made this session |
| `mNumPenalties` | `int16` | — | Outstanding (unserved) penalties |
| `mIsPlayer` | `bool` | — | `True` if this is the local player |
| `mControl` | `int8` | `LMUControl` | `−1`=nobody, `0`=local player, `1`=AI, `2`=remote, `3`=replay |
| `mInPits` | `bool` | — | Between pit entrance and exit (may lag for remote cars) |
| `mPlace` | `uint8` | 1-based | Current race position |
| `mVehicleClass` | `bytes[32]` | — | Vehicle class string |
| `mTimeBehindNext` | `double` | seconds | Gap to the car ahead |
| `mLapsBehindNext` | `int` | laps | Laps behind the car ahead |
| `mTimeBehindLeader` | `double` | seconds | Gap to the race leader |
| `mLapsBehindLeader` | `int` | laps | Laps behind the leader |
| `mLapStartET` | `double` | seconds | Elapsed time when current lap began |
| `mPos` | `LMUVect3` | meters | World position |
| `mLocalVel` | `LMUVect3` | m/s | Velocity in local vehicle frame |
| `mLocalAccel` | `LMUVect3` | m/s² | Acceleration in local vehicle frame |
| `mOri` | `LMUVect3[3]` | — | Orientation matrix rows (vehicle → world) |
| `mLocalRot` | `LMUVect3` | rad/s | Angular velocity in local frame |
| `mLocalRotAccel` | `LMUVect3` | rad/s² | Angular acceleration in local frame |
| `mHeadlights` | `uint8` | — | Headlight status |
| `mPitState` | `uint8` | `LMUPitState` | `0`=none, `1`=requested, `2`=entering, `3`=stopped, `4`=exiting |
| `mServerScored` | `uint8` | — | Server is scoring this vehicle (may be off in quali heats) |
| `mIndividualPhase` | `uint8` | — | Per-vehicle phase (extends `mGamePhase` with `9`=after formation, `10`=under yellow, `11`=under blue) |
| `mQualification` | `int` | 1-based | Qualifying grid position (`−1` = invalid) |
| `mTimeIntoLap` | `double` | seconds | Estimated time spent in current lap |
| `mEstimatedLapTime` | `double` | seconds | Estimated lap time used for gap/time-into-lap |
| `mPitGroup` | `bytes[24]` | — | Pit group / team name (differs when pit is shared) |
| `mFlag` | `uint8` | `LMUPrimaryFlag` | Flag shown to vehicle: `0`=green, `6`=blue |
| `mUnderYellow` | `bool` | — | Car crossed S/F line under full-course yellow |
| `mCountLapFlag` | `uint8` | `LMUCountLapFlag` | `0`=ignore lap+time, `1`=count lap only, `2`=count lap+time |
| `mInGarageStall` | `bool` | — | Vehicle appears to be in its correct garage stall |
| `mUpgradePack` | `bytes[16]` | — | Coded upgrade pack flags |
| `mPitLapDist` | `float` | meters | Lap distance of this vehicle's pit box |
| `mBestLapSector1` | `float` | seconds | S1 split from the best lap (not the best S1 overall) |
| `mBestLapSector2` | `float` | seconds | S2 split from the best lap (not the best S2 overall) |
| `mSteamID` | `uint64` | — | Driver's Steam ID (`0` if none) |
| `mVehFilename` | `bytes[32]` | — | `.veh` filename for vehicle identification |
| `mAttackMode` | `int16` | — | Attack mode activation state |
| `mFuelFraction` | `uint8` | 0x00–0xFF | Fuel / battery level (`0x00`=0 %, `0xFF`=100 %) |
| `mDRSState` | `bool` | — | DRS (rear flap) currently open |

---

### `LMUTelemetryData`

| Field | Type | Description |
|-------|------|-------------|
| `activeVehicles` | `uint8` | Number of vehicles with active telemetry |
| `playerVehicleIdx` | `uint8` | Index into `telemInfo` for the local player |
| `playerHasVehicle` | `bool` | Player currently has a vehicle on track |
| `telemInfo` | `LMUVehicleTelemetry[104]` | Per-vehicle telemetry; valid entries = `activeVehicles` |

---

### `LMUVehicleTelemetry` — Per-vehicle physics

Access via `telemInfo[i]`. Wheel order: `0`=FL, `1`=FR, `2`=RL, `3`=RR.

| Field | Type | Unit / Range | Description |
|-------|------|--------------|-------------|
| `mID` | `int` | — | Slot ID (matches `LMUVehicleScoring.mID`) |
| `mDeltaTime` | `double` | seconds | Time since last telemetry update |
| `mElapsedTime` | `double` | seconds | Session elapsed time |
| `mLapNumber` | `int` | — | Current lap number |
| `mLapStartET` | `double` | seconds | Elapsed time when current lap began |
| `mVehicleName` | `bytes[64]` | — | Vehicle name |
| `mTrackName` | `bytes[64]` | — | Track name |
| `mPos` | `LMUVect3` | meters | World position |
| `mLocalVel` | `LMUVect3` | m/s | Velocity in local vehicle frame |
| `mLocalAccel` | `LMUVect3` | m/s² | Acceleration in local vehicle frame |
| `mOri` | `LMUVect3[3]` | — | Orientation matrix rows (vehicle → world) |
| `mLocalRot` | `LMUVect3` | rad/s | Angular velocity in local frame |
| `mLocalRotAccel` | `LMUVect3` | rad/s² | Angular acceleration in local frame |
| `mGear` | `int` | — | Gear: `−1`=reverse, `0`=neutral, `1+`=forward |
| `mEngineRPM` | `double` | RPM | Engine speed |
| `mEngineWaterTemp` | `double` | °C | Engine coolant temperature |
| `mEngineOilTemp` | `double` | °C | Engine oil temperature |
| `mClutchRPM` | `double` | RPM | Clutch RPM |
| `mUnfilteredThrottle` | `double` | 0.0–1.0 | Raw throttle input (before driver aids) |
| `mUnfilteredBrake` | `double` | 0.0–1.0 | Raw brake input (before ABS) |
| `mUnfilteredSteering` | `double` | −1.0–1.0 | Raw steering input (left=−1, right=+1) |
| `mUnfilteredClutch` | `double` | 0.0–1.0 | Raw clutch input |
| `mFilteredThrottle` | `double` | 0.0–1.0 | Throttle after TC / maps |
| `mFilteredBrake` | `double` | 0.0–1.0 | Brake after ABS |
| `mFilteredSteering` | `double` | −1.0–1.0 | Steering after aids |
| `mFilteredClutch` | `double` | 0.0–1.0 | Clutch after aids |
| `mSteeringShaftTorque` | `double` | N·m | Steering shaft torque (used for FFB) |
| `mFront3rdDeflection` | `double` | meters | Front third-spring deflection |
| `mRear3rdDeflection` | `double` | meters | Rear third-spring deflection |
| `mFrontWingHeight` | `double` | meters | Front wing height above ground |
| `mFrontRideHeight` | `double` | meters | Front chassis ride height |
| `mRearRideHeight` | `double` | meters | Rear chassis ride height |
| `mDrag` | `double` | N | Aerodynamic drag force |
| `mFrontDownforce` | `double` | N | Front aerodynamic downforce |
| `mRearDownforce` | `double` | N | Rear aerodynamic downforce |
| `mFuel` | `double` | liters | Current fuel quantity |
| `mEngineMaxRPM` | `double` | RPM | Rev limiter |
| `mScheduledStops` | `uint8` | — | Mandatory pitstops remaining |
| `mOverheating` | `bool` | — | Overheating warning active |
| `mDetached` | `bool` | — | Non-wheel parts detached |
| `mHeadlights` | `bool` | — | Headlights on |
| `mDentSeverity` | `uint8[8]` | 0–2 | Body damage at 8 locations (`0`=none, `1`=some, `2`=heavy) |
| `mLastImpactET` | `double` | seconds | Session time of last collision |
| `mLastImpactMagnitude` | `double` | — | Severity of last collision |
| `mLastImpactPos` | `LMUVect3` | meters | World position of last collision |
| `mEngineTorque` | `double` | N·m | Engine output torque (includes additive torque) |
| `mCurrentSector` | `int` | — | Current sector (0-based); bit 31 set = in pitlane |
| `mSpeedLimiter` | `uint8` | — | Pit speed limiter engaged |
| `mMaxGears` | `uint8` | — | Total forward gears |
| `mFrontTireCompoundIndex` | `uint8` | — | Front tyre compound index within brand |
| `mRearTireCompoundIndex` | `uint8` | — | Rear tyre compound index within brand |
| `mFuelCapacity` | `double` | liters | Maximum fuel tank capacity |
| `mFrontFlapActivated` | `uint8` | — | Front flap deployed |
| `mRearFlapActivated` | `uint8` | — | Rear flap (DRS) deployed |
| `mRearFlapLegalStatus` | `uint8` | `LMURearFlapLegalStatus` | `0`=disallowed, `1`=pending, `2`=legal |
| `mIgnitionStarter` | `uint8` | `LMUIgnitionStarterStatus` | `0`=off, `1`=ignition, `2`=ignition+starter |
| `mFrontTireCompoundName` | `bytes[18]` | — | Front tyre compound name |
| `mRearTireCompoundName` | `bytes[18]` | — | Rear tyre compound name |
| `mSpeedLimiterAvailable` | `uint8` | — | Speed limiter available on this car |
| `mAntiStallActivated` | `uint8` | — | Hard anti-stall engaged |
| `mVisualSteeringWheelRange` | `float` | degrees | Visual steering wheel lock-to-lock range |
| `mRearBrakeBias` | `double` | 0.0–1.0 | Fraction of brake force on rear axle |
| `mTurboBoostPressure` | `double` | — | Current turbo boost pressure (if equipped) |
| `mPhysicsToGraphicsOffset` | `float[3]` | meters | Offset from physics CG to graphical center |
| `mPhysicalSteeringWheelRange` | `float` | degrees | Physical steering wheel lock-to-lock range |
| `mDeltaBest` | `double` | seconds | Delta to personal best lap (negative = ahead of best) |
| `mBatteryChargeFraction` | `double` | 0.0–1.0 | EV / hybrid battery charge level |
| `mElectricBoostMotorTorque` | `double` | N·m | Boost motor torque (negative = regenerating) |
| `mElectricBoostMotorRPM` | `double` | RPM | Boost motor speed |
| `mElectricBoostMotorTemperature` | `double` | °C | Boost motor temperature |
| `mElectricBoostWaterTemperature` | `double` | °C | Boost motor coolant temperature (`0` if no cooler) |
| `mElectricBoostMotorState` | `uint8` | — | `0`=unavailable, `1`=inactive, `2`=propulsion, `3`=regenerating |
| `mLapInvalidated` | `bool` | — | Current lap has been invalidated |
| `mABSActive` | `bool` | — | ABS currently intervening |
| `mTCActive` | `bool` | — | TC currently intervening |
| `mSpeedLimiterActive` | `bool` | — | Speed limiter currently active |
| `mWiperState` | `uint8` | `LMUWiperStatus` | `0`=off, `1`=auto, `2`=slow, `3`=fast |
| `mTC` | `uint8` | — | Current TC setting |
| `mTCMax` | `uint8` | — | Maximum TC steps |
| `mTCSlip` | `uint8` | — | Current TC slip threshold |
| `mTCSlipMax` | `uint8` | — | Maximum TC slip steps |
| `mTCCut` | `uint8` | — | Current TC cut setting |
| `mTCCutMax` | `uint8` | — | Maximum TC cut steps |
| `mABS` | `uint8` | — | Current ABS setting |
| `mABSMax` | `uint8` | — | Maximum ABS steps |
| `mMotorMap` | `uint8` | — | Current engine / motor map |
| `mMotorMapMax` | `uint8` | — | Maximum motor map steps |
| `mMigration` | `uint8` | — | Current ERS deployment (migration) setting |
| `mMigrationMax` | `uint8` | — | Maximum migration steps |
| `mFrontAntiSway` | `uint8` | — | Front anti-roll bar setting |
| `mFrontAntiSwayMax` | `uint8` | — | Maximum front ARB steps |
| `mRearAntiSway` | `uint8` | — | Rear anti-roll bar setting |
| `mRearAntiSwayMax` | `uint8` | — | Maximum rear ARB steps |
| `mLiftAndCoastProgress` | `uint8` | — | Lift-and-coast manoeuvre progress |
| `mTrackLimitsSteps` | `uint8` | — | Accumulated track-limits points (steps × per-point rate) |
| `mRegen` | `float` | kW | Current regeneration power |
| `mStateOfCharge` | `float` | % | Battery state of charge |
| `mVirtualEnergy` | `float` | 0.0–1.0 | Virtual energy fraction |
| `mTimeGapCarAhead` | `float` | seconds | Gap to the car physically ahead on track |
| `mTimeGapCarBehind` | `float` | seconds | Gap to the car physically behind on track |
| `mTimeGapPlaceAhead` | `float` | seconds | Gap to the car one place higher in standings |
| `mTimeGapPlaceBehind` | `float` | seconds | Gap to the car one place lower in standings |
| `mVehicleModel` | `bytes[30]` | — | Brand and model name |
| `mVehicleClass` | `uint8` | `LMUVehicleClass` | Vehicle class enum |
| `mVehicleChampionship` | `uint8` | `LMUVehicleChampionship` | Championship and year enum |
| `mWheels` | `LMUWheel[4]` | — | Wheel data (`0`=FL, `1`=FR, `2`=RL, `3`=RR) |

---

### `LMUWheel` — Per-wheel data

Access via `telemInfo[i].mWheels[j]`.

| Field | Type | Unit / Range | Description |
|-------|------|--------------|-------------|
| `mSuspensionDeflection` | `double` | meters | Suspension travel from rest position |
| `mRideHeight` | `double` | meters | Ride height at this corner |
| `mSuspForce` | `double` | N | Pushrod load |
| `mBrakeTemp` | `double` | °C | Brake disc temperature |
| `mBrakePressure` | `double` | 0.0–1.0 | Brake pressure fraction (will become kPa in future game version) |
| `mRotation` | `double` | rad/s | Wheel rotational speed |
| `mLateralPatchVel` | `double` | m/s | Lateral velocity at contact patch |
| `mLongitudinalPatchVel` | `double` | m/s | Longitudinal velocity at contact patch |
| `mLateralGroundVel` | `double` | m/s | Lateral ground velocity at contact patch |
| `mLongitudinalGroundVel` | `double` | m/s | Longitudinal ground velocity at contact patch |
| `mCamber` | `double` | radians | Camber angle (positive = outward lean on that side) |
| `mLateralForce` | `double` | N | Lateral (cornering) force |
| `mLongitudinalForce` | `double` | N | Longitudinal (drive / brake) force |
| `mTireLoad` | `double` | N | Vertical load on tyre |
| `mGripFract` | `double` | 0.0–1.0 | Estimated sliding fraction of contact patch |
| `mPressure` | `double` | kPa | Tyre inflation pressure |
| `mTemperature` | `double[3]` | K | Tyre surface temperature — left / center / right zones (subtract 273.15 for °C) |
| `mWear` | `double` | 0.0–1.0 | Tyre wear fraction (not linearly proportional to grip loss) |
| `mTerrainName` | `bytes[16]` | — | TDF material prefix of current surface |
| `mSurfaceType` | `uint8` | `LMUSurfaceType` | `0`=dry, `1`=wet, `2`=grass, `3`=dirt, `4`=gravel, `5`=rumble strip, `6`=special |
| `mFlat` | `bool` | — | Tyre is flat / punctured |
| `mDetached` | `bool` | — | Wheel is detached from car |
| `mStaticUndeflectedRadius` | `uint8` | cm | Nominal tyre radius |
| `mVerticalTireDeflection` | `double` | meters | Deflection from speed-adjusted nominal radius |
| `mWheelYLocation` | `double` | meters | Wheel Y position relative to vehicle Y |
| `mToe` | `double` | radians | Current toe angle relative to vehicle axis |
| `mTireCarcassTemperature` | `double` | K | Average carcass temperature (subtract 273.15 for °C) |
| `mTireInnerLayerTemperature` | `double[3]` | K | Innermost rubber layer temps — left / center / right (subtract 273.15 for °C) |
| `mOptimalTemp` | `float` | °C | Manufacturer optimal operating temperature |
| `mCompoundIndex` | `uint8` | — | Compound index in the car+track compound list |
| `mCompoundType` | `uint8` | `LMUCompoundType` | `0`=soft, `1`=medium, `2`=hard, `3`=wet |

---

### `LMUVect3` — 3D vector

Used for positions, velocities, accelerations, and orientation matrix rows.

| Field | Type | Description |
|-------|------|-------------|
| `x` | `double` | X component |
| `y` | `double` | Y component (vertical in world space) |
| `z` | `double` | Z component |

---

## Enum Reference

All enums live in `lmu_enum.py`. Use `enum_map(EnumClass)` for a fast integer → name dict.

### `LMUSession`

| Value | Name |
|-------|------|
| 0 | `TestDay` |
| 1–4 | `Practice1` – `Practice4` |
| 5–8 | `Qualifying1` – `Qualifying4` |
| 9 | `Warmup` |
| 10–13 | `Race1` – `Race4` |

### `LMUGamePhase`

| Value | Name | Notes |
|-------|------|-------|
| 0 | `Garage` | Before session begins |
| 1 | `WarmUp` | Reconnaissance laps (race only) |
| 2 | `GridWalk` | Grid walk-through (race only) |
| 3 | `Formation` | Formation lap (race only) |
| 4 | `Countdown` | Start lights lighting up |
| 5 | `GreenFlag` | Session live |
| 6 | `FullCourseYellow` | Safety car / FCY |
| 7 | `SessionStopped` | Red flag |
| 8 | `SessionOver` | Chequered flag |
| 9 | `PausedOrHeartbeat` | Game paused |

### `LMUVehicleClass`

| Value | Name |
|-------|------|
| 0x00 | `Hypercar` |
| 0x02 | `LMP2_ELMS` |
| 0x03 | `LMP2` |
| 0x04 | `LMP3` |
| 0x05 | `GTE` |
| 0x06 | `GT3` |
| 0x08 | `PaceCar` |
| 0xFF | `Unknown` |

### `LMUVehicleChampionship`

| Value | Name |
|-------|------|
| 0x00 | `WEC_2023` |
| 0x01 | `WEC_2024` |
| 0x02 | `WEC_2025` |
| 0x03 | `WEC_2026` |
| 0x10 | `ELMS_2025` |
| 0x11 | `ELMS_2026` |
| 0xFF | `Unknown` |

### `LMUSector` ⚠️ quirk

| Raw value | Actual sector |
|-----------|--------------|
| 0 | Sector 3 |
| 1 | Sector 1 |
| 2 | Sector 2 |

### Other enums

| Enum | Field | Values |
|------|-------|--------|
| `LMUFinishStatus` | `mFinishStatus` | `0`=none, `1`=finished, `2`=DNF, `3`=DQ |
| `LMUControl` | `mControl` | `−1`=nobody, `0`=local player, `1`=AI, `2`=remote, `3`=replay |
| `LMUPitState` | `mPitState` | `0`=none, `1`=request, `2`=entering, `3`=stopped, `4`=exiting |
| `LMUPrimaryFlag` | `mFlag` | `0`=green, `6`=blue |
| `LMUCountLapFlag` | `mCountLapFlag` | `0`=ignore, `1`=lap only, `2`=lap+time |
| `LMURearFlapLegalStatus` | `mRearFlapLegalStatus` | `0`=disallowed, `1`=pending, `2`=allowed |
| `LMUIgnitionStarterStatus` | `mIgnitionStarter` | `0`=off, `1`=ignition, `2`=ignition+starter |
| `LMUWiperStatus` | `mWiperState` | `0`=off, `1`=auto, `2`=slow, `3`=fast |
| `LMUCompoundType` | `mCompoundType` | `0`=soft, `1`=medium, `2`=hard, `3`=wet |
| `LMUSurfaceType` | `mSurfaceType` | `0`=dry, `1`=wet, `2`=grass, `3`=dirt, `4`=gravel, `5`=rumble strip, `6`=special |
| `LMUTrackGripLevel` | `mTrackGripLevel` | `0`=green, `1`=low, `2`=medium, `3`=high, `4`=saturated |
| `LMUCloudCoverage` | `mCloudCoverage` | `0`=clear, `1`=light clouds, `2`=partly cloudy, `3`=mostly cloudy, `4`=overcast, `5`=drizzle, `6`=light rain, `7`=overcast+light rain, `8`=overcast+rain, `9`=heavy rain, `10`=storm |
| `LMUGameMode` | `mGameMode` | `1`=server, `2`=client, `3`=both |
| `LMUYellowFlagState` | `mYellowFlagState` | `−1`=invalid, `0`=none, `1`=pending, `2`=pits closed, `3`=pit lead lap, `4`=pits open, `5`=last lap, `6`=resume, `7`=halt |
| `LMUWheelIndex` | `mWheels[j]` | `0`=FL, `1`=FR, `2`=RL, `3`=RR |
