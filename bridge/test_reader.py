import time
from reader import LMUReader

reader = LMUReader()
reader.connect()

while True:
    snapshot = reader.get_snapshot()
    if snapshot:
        track = snapshot.scoring.scoringInfo.mTrackName.decode(errors="ignore")
        total = snapshot.scoring.scoringInfo.mNumVehicles
        print(f"{track} | {total} voitures")
    else:
        print("En attente de LMU...")
    time.sleep(1)