import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

clients: set[WebSocket] = set()
last_payload: dict | None = None


@app.websocket("/bridge")
async def bridge_endpoint(ws: WebSocket):
    """Connexion du bridge (ton PC Windows)"""
    await ws.accept()
    print("✓ Bridge connecté")
    try:
        while True:
            data = await ws.receive_text()
            global last_payload
            last_payload = json.loads(data)
            # Redistribue à tous les clients connectés
            disconnected = set()
            for client in clients:
                try:
                    await client.send_text(data)
                except Exception:
                    disconnected.add(client)
            clients.difference_update(disconnected)
    except WebSocketDisconnect:
        print("✗ Bridge déconnecté")


@app.websocket("/ws")
async def client_endpoint(ws: WebSocket):
    """Connexion des clients (tes amis)"""
    await ws.accept()
    clients.add(ws)
    print(f"✓ Client connecté ({len(clients)} total)")
    # Envoie le dernier payload connu immédiatement
    if last_payload:
        await ws.send_text(json.dumps(last_payload))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)
        print(f"✗ Client déconnecté ({len(clients)} total)")