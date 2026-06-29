import asyncio
import json
from dataclasses import asdict
from dotenv import load_dotenv
import os
import websockets

load_dotenv()

RELAY_URL = os.getenv("RELAY_URL", "ws://localhost:8765")


class Broadcaster:

    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._connected = False

    def enqueue(self, data: dict):
        try:
            self._queue.put_nowait(data)
        except asyncio.QueueFull:
            pass

    async def run(self):
        while True:
            try:
                print(f"Connexion au relay {RELAY_URL}...")
                async with websockets.connect(RELAY_URL) as ws:
                    self._connected = True
                    print(f"✓ Connecté au relay")
                    while True:
                        data = await self._queue.get()
                        await ws.send(json.dumps(data))
            except Exception as e:
                self._connected = False
                print(f"✗ Relay déconnecté : {e}")
                print("Nouvelle tentative dans 5s...")
                await asyncio.sleep(5)