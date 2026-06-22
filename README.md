# LMU Live Timing

Retransmission en temps réel des sessions Le Mans Ultimate — classement, écarts, meilleurs tours et statut pit, accessible via un lien public partageable.

---

## Vue d'ensemble

```
PC Windows (LMU)          Relay (Fly.io)         Amis (navigateur)
┌─────────────────┐       ┌────────────┐         ┌──────────────┐
│  Le Mans        │       │            │         │              │
│  Ultimate       │──────▶│  FastAPI   │────────▶│  Web app     │
│                 │  WS   │  broadcast │   WS    │  React       │
│  bridge/        │       │            │         │              │
│  (Python)       │       └────────────┘         └──────────────┘
└─────────────────┘
     shared memory
```

Le **bridge** tourne en local sur ton PC Windows pendant que tu joues. Il lit le shared memory de LMU, sérialise les données en JSON et les envoie au relay via WebSocket. Le **relay** redistribue le flux à tous les clients connectés. La **web app** déployée sur Vercel affiche le tout en temps réel.

---

## Structure du repo

```
lmu-live-timing/
├── bridge/              # Lecteur shared memory (Python, Windows)
├── web/                 # Web app live timing (React + Vite + Tailwind)
├── .github/
│   └── workflows/       # CI + déploiement Vercel
└── README.md
```

Chaque sous-dossier a son propre `README.md` avec les instructions spécifiques.

---

## Prérequis

### Bridge (PC Windows)

- Windows 10/11
- Python 3.11+
- Le Mans Ultimate avec **Settings → Gameplay → Enable Plugins** activé
- Git (pour cloner le submodule `pyLMUSharedMemory`)

### Web app

- Node.js 20+
- Un compte Vercel (déploiement gratuit)

### Relay

- Un compte Fly.io ou Railway (tier gratuit suffisant)

---

## Installation rapide

### 1. Cloner le repo

```bash
git clone --recursive https://github.com/ton-user/lmu-live-timing.git
cd lmu-live-timing
```

Le flag `--recursive` clone également le submodule `pyLMUSharedMemory` dans `bridge/`.

### 2. Configurer le bridge

```bash
cd bridge
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
cp .env.example .env
# Édite .env avec l'URL du relay
```

Voir [`bridge/README.md`](./bridge/README.md) pour les détails.

### 3. Déployer le relay

Voir [`relay/README.md`](./relay/README.md) pour les instructions Fly.io / Railway.

### 4. Déployer la web app

```bash
cd web
npm install
cp .env.example .env
# Édite .env avec l'URL WebSocket du relay
npm run dev     # développement local
```

Voir [`web/README.md`](./web/README.md) pour le déploiement Vercel.

---

## Utilisation

1. Lance Le Mans Ultimate et rejoins une session
2. Double-clique sur `bridge/start.bat`
3. Attends le message `✓ Connected to relay` dans la console
4. Partage l'URL Vercel à tes amis
5. Joue — le classement se met à jour en temps réel

Pour arrêter le bridge : `Ctrl+C` dans la console.

---

## Données exposées

| Donnée                              | Source         | Fréquence     |
| ----------------------------------- | -------------- | ------------- |
| Classement (position, écart, tours) | Scoring buffer | ~5 Hz         |
| Meilleur tour + secteurs S1/S2/S3   | Scoring buffer | ~5 Hz         |
| Statut pit (en piste / aux stands)  | Scoring buffer | ~5 Hz         |
| Temps de session restant            | Scoring buffer | ~5 Hz         |
| Type de session, circuit            | Scoring buffer | au changement |
| Météo, grip                         | Scoring buffer | ~5 Hz         |

---

## Stack technique

| Composant       | Stack                                                  |
| --------------- | ------------------------------------------------------ |
| Bridge          | Python 3.11 · pyLMUSharedMemory · websockets · asyncio |
| Relay           | FastAPI · WebSocket broadcast · Fly.io                 |
| Web app         | React 18 · Vite · TypeScript · Tailwind CSS            |
| Déploiement web | Vercel                                                 |

---

## Développement

### Tester le bridge sans LMU

Un script `bridge/tools/mock_server.py` génère des données fictives pour développer le front sans avoir LMU lancé.

```bash
cd bridge
python tools/mock_server.py
```

### Format du message WebSocket

```json
{
  "session": {
    "type": "RACE",
    "track": "Circuit de la Sarthe",
    "time_remaining": 21347.5,
    "flags": "GREEN"
  },
  "drivers": [
    {
      "position": 1,
      "name": "Slipstream #77",
      "car_class": "GTE",
      "gap": null,
      "last_lap": 92.843,
      "best_lap": 91.204,
      "in_pit": false
    }
  ]
}
```

---

## Licence

MIT — voir [LICENSE](./LICENSE).
