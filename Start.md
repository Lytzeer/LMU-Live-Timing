# Lancer le projet — guide rapide

Deux modes possibles : le mode **réel** (avec LMU et les deux machines) et le mode **mock** (données fictives, pour dev l'UI sans le jeu).

---

## Mode réel — PC Windows + Mac

Utilise ce mode quand tu es en session LMU et que tu veux voir les vraies données.

### 1. Sur le Mac — lancer le relay

```bash
cd relay
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8765
```

Le relay écoute sur deux endpoints : `/bridge` pour le PC Windows, `/ws` pour le front.

### 2. Trouver l'IP du Mac

```bash
ipconfig getifaddr en0
```

Vérifie que le `.env` dans `bridge/` (PC Windows) pointe bien dessus :

```
RELAY_URL=ws://IP_DU_MAC:8765/bridge
```

### 3. Sur le PC Windows — lancer LMU

Lance Le Mans Ultimate, rejoins une session (practice, quali, race). Vérifie que **Settings → Gameplay → Enable Plugins** est activé.

### 4. Sur le PC Windows — lancer le bridge

```powershell
cd bridge
.venv\Scripts\activate
python main.py
```

Tu dois voir `✓ Connecté au relay` dans la console.

### 5. Sur le Mac — lancer le front

```bash
cd web
npm run dev
```

Ouvre `http://localhost:5173` — le classement doit s'afficher et se mettre à jour en temps réel.

---

## Mode mock — développer l'UI sans LMU

Utilise ce mode pour bosser sur le design ou les animations sans avoir besoin du PC Windows ni du jeu.

### 1. Lancer le mock server (remplace le relay ET le bridge)

```bash
cd bridge
source .venv/bin/activate
python tools/mock_server.py --mode static
```

Ou en mode dynamique (données qui bougent, pour tester les animations) :

```bash
python tools/mock_server.py --mode dynamic
```

| Mode      | Comportement                                                                            |
| --------- | --------------------------------------------------------------------------------------- |
| `static`  | Classement fixe, renvoyé toutes les 1s — pour construire l'UI                           |
| `dynamic` | Écarts, carburant, pit stops qui varient en continu à 5 Hz — pour tester les animations |

### 2. Lancer le front

```bash
cd web
npm run dev
```

Ouvre `http://localhost:5173` — le front se connecte sur `ws://localhost:8765/ws`, exactement comme en mode réel. Aucune configuration à changer côté front.

---

## Résumé — qui remplace quoi

| Composant          | Mode réel             | Mode mock                                  |
| ------------------ | --------------------- | ------------------------------------------ |
| Source des données | LMU (PC Windows)      | `mock_server.py` (Mac)                     |
| Bridge             | `bridge/main.py`      | non utilisé                                |
| Relay              | `relay/main.py`       | non utilisé (le mock fait office de relay) |
| Front              | `web` (`npm run dev`) | identique                                  |

---

## Problèmes fréquents

**Le front reste sur "🔴 Déconnecté"**
Vérifie qu'un serveur (relay ou mock) tourne bien sur le port 8765, et que l'URL dans `useWebSocket.ts` correspond (`ws://localhost:8765/ws`).

**Le bridge n'arrive pas à se connecter au relay**
Vérifie l'IP du Mac dans `.env` — elle change si tu changes de réseau Wi-Fi. Relance `ipconfig getifaddr en0` pour la mettre à jour.

**`ModuleNotFoundError` sur le Mac ou le PC**
Le venv n'est pas activé, ou une dépendance manque. Relance `pip install -r requirements.txt` dans le dossier concerné.
