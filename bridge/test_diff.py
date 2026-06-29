import time
from reader import LMUReader
from serializer import serialize_session
from diff import DiffChecker

reader = LMUReader()
reader.connect()
checker = DiffChecker()
sent = 0
skipped = 0

while True:
    snapshot = reader.get_snapshot()
    if snapshot:
        session = serialize_session(snapshot)
        if checker.has_changed(session):
            sent += 1
        else:
            skipped += 1
        print(f"envoyés: {sent} | ignorés: {skipped}")
    time.sleep(0.2)