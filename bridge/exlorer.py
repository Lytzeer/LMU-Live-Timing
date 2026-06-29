import sys
import time
sys.path.insert(0, "pyLMUSharedMemory")

from pyLMUSharedMemory.lmu_mmap import MMapControl
from pyLMUSharedMemory.lmu_data import LMUObjectOut, LMUConstants

info = MMapControl(LMUConstants.LMU_SHARED_MEMORY_FILE, LMUObjectOut)
info.create(0)

while True:
    info.update()
    s = info.data.scoring

    track = s.scoringInfo.mTrackName.decode(errors="ignore")
    total = s.scoringInfo.mNumVehicles
    time_remaining = s.scoringInfo.mCurrentET

    print(f"\n--- {track} | {total} voitures | ET: {time_remaining:.1f}s ---")

    for i in range(total):
        v = s.vehScoringInfo[i]
        name = v.mDriverName.decode(errors="ignore")
        pos  = v.mPlace
        gap  = v.mTimeBehindLeader
        lap  = v.mBestLapTime
        pit  = v.mInPits
        print(f"  P{pos:2} | {name:<20} | gap: {gap:7.3f}s | best: {lap:7.3f}s | pit: {pit}")

    time.sleep(0.2)