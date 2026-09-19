import asyncio
import json
import random
import time
import argparse
import websockets

DRIVERS = [
    ("Lukas Portier", "Porsche 963", "LMH"),
    ("Mike Conway", "Toyota GR010", "LMH"),
    ("Kevin Estre", "Porsche 963", "LMH"),
    ("Julien Andlauer", "Ferrari 499P", "LMH"),
    ("Felipe Nasr", "Porsche 963", "LMH"),
    ("Neel Jani", "Toyota GR010", "LMH"),
    ("Robert Kubica", "Ferrari 499P", "LMH"),
    ("Tom Gamble", "Aston Martin Vantage", "LMGT3"),
    ("Ricky Taylor", "Corvette Z06R", "LMGT3"),
    ("Dries Vanthoor", "Porsche 911 GT3R", "LMGT3"),
    ("Jules Gounon", "Mercedes AMG GT3", "LMGT3"),
    ("Alex Riberas", "Aston Martin Vantage", "LMGT3"),
]

BASE_LAP = 84.0


def make_static_payload() -> dict:
    drivers = []
    for i, (name, vehicle, cls) in enumerate(DRIVERS):
        best_lap = BASE_LAP + i * 0.4 + random.uniform(0.0, 0.2)
        best_s1 = round(best_lap * 0.31, 3)
        best_s2 = round(best_lap * 0.38, 3)
        best_s3 = round(best_lap - best_s1 - best_s2, 3)
        drivers.append({
            "id": i,
            "name": name,
            "vehicle": vehicle,
            "vehicle_class": cls,
            "position": i + 1,
            "total_laps": 10 - i // 4,
            "gap_to_leader": None if i == 0 else round(i * 0.4 + random.uniform(0.0, 0.2), 3),
            "laps_behind_leader": 0,
            "best_lap": round(best_lap, 3),
            "last_lap": round(best_lap + random.uniform(0.0, 0.5), 3),
            "best_s1": best_s1,
            "best_s2": best_s2,
            "best_lap_s1": best_s1,
            "best_lap_s2": round(best_s1 + best_s2, 3),
            "best_s3": best_s3,
            "in_pit": False,
            "pit_state": 0,
            "num_pitstops": i // 5,
            "fuel_fraction": round(80.0 - i * 2.0, 1),
            "is_player": i == 0,
        })
    return {
        "track": "Circuit de la Sarthe",
        "session_type": 10,
        "time_remaining": 21600.0,
        "game_phase": 5,
        "raining": 0.0,
        "track_temp": 28.5,
        "track_grip": 2,
        "sector_flags": [0, 0, 0],
        "drivers": drivers,
    }


def make_dynamic_payload(state: dict) -> dict:
    payload = json.loads(json.dumps(state))

    payload["time_remaining"] = max(0.0, payload["time_remaining"] - 0.2)
    payload["raining"] = round(max(0.0, min(1.0, payload["raining"] + random.uniform(-0.01, 0.01))), 3)
    payload["track_temp"] = round(payload["track_temp"] + random.uniform(-0.1, 0.1), 1)

    for i in range(3):
        if payload["sector_flags"][i] == 0 and random.random() < 0.005:
            payload["sector_flags"][i] = 1
        elif payload["sector_flags"][i] != 0 and random.random() < 0.05:
            payload["sector_flags"][i] = 0

    for d in payload["drivers"]:
        # Simulation pit stop aléatoire
        if not d["in_pit"] and random.random() < 0.002:
            d["in_pit"] = True
            d["pit_state"] = 2
            d["num_pitstops"] += 1
        elif d["in_pit"] and random.random() < 0.05:
            d["in_pit"] = False
            d["pit_state"] = 0

        # Légère variation des écarts
        if d["gap_to_leader"] is not None:
            d["gap_to_leader"] = round(max(0.0, d["gap_to_leader"] + random.uniform(-0.05, 0.05)), 3)

        # Variation du carburant
        d["fuel_fraction"] = round(max(0.0, d["fuel_fraction"] - random.uniform(0.0, 0.05)), 1)

    return payload


async def handler(ws, mode: str):
    print(f"✓ Client connecté ({mode} mode)")
    state = make_static_payload()
    try:
        while True:
            if mode == "static":
                await ws.send(json.dumps(state))
                await asyncio.sleep(1)
            else:
                state = make_dynamic_payload(state)
                await ws.send(json.dumps(state))
                await asyncio.sleep(0.2)
    except websockets.ConnectionClosed:
        print("✗ Client déconnecté")


async def main(mode: str):
    print(f"Mock server démarré en mode '{mode}' sur ws://0.0.0.0:8765/ws")
    async with websockets.serve(
        lambda ws: handler(ws, mode),
        "0.0.0.0",
        8765
    ):
        await asyncio.Future()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["static", "dynamic"], default="static")
    args = parser.parse_args()
    asyncio.run(main(args.mode))