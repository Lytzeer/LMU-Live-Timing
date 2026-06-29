import asyncio
import json
from dataclasses import asdict

from reader import LMUReader
from serializer import serialize_session
from diff import DiffChecker
from broadcaster import Broadcaster

POLL_INTERVAL = 0.2  # 5 Hz


async def main():
    reader = LMUReader()
    checker = DiffChecker()
    broadcaster = Broadcaster()

    reader.connect()

    asyncio.create_task(broadcaster.run())

    print("Bridge démarré — en attente de données LMU...")

    while True:
        try:
            snapshot = reader.get_snapshot()

            if snapshot:
                session = serialize_session(snapshot)
                if checker.has_changed(session):
                    broadcaster.enqueue(asdict(session))
            else:
                print("En attente de LMU...")

        except Exception as e:
            print(f"Erreur : {e}")

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBridge arrêté")