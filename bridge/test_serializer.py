import time
from reader import LMUReader
from serializer import serialize_session

reader = LMUReader()
reader.connect()

while True:
    snapshot = reader.get_snapshot()
    if snapshot:
        session = serialize_session(snapshot)
        print(f"\n{session.track} | phase: {session.game_phase} | {session.time_remaining:.0f}s")
        for d in session.drivers:
            gap = f"+{d.gap_to_leader:.3f}s" if d.gap_to_leader else "LEADER"
            best = f"{d.best_lap:.3f}s" if d.best_lap else "--"
            print(f"  P{d.position} {d.name:<20} {gap:<12} best: {best}")
    time.sleep(0.2)