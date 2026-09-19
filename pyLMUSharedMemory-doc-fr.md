# pyLMUSharedMemory — Documentation

Bibliothèque Python pour lire l'interface mémoire partagée intégrée de Le Mans Ultimate.

Source : `bridge/pyLMUSharedMemory/`

Basée sur :
- Le header `SharedMemoryInterface` de S397 (dossier du jeu `Support\SharedMemoryInterface`)
- [pyRfactor2SharedMemory](https://github.com/TonyWhitley/pyRfactor2SharedMemory) par Tony Whitley

---

## Fonctionnement général

Le Mans Ultimate écrit en continu des données de simulation dans un **fichier de mémoire partagée** nommé `LMU_Data`. Tout processus externe sur la même machine peut le lire via un fichier mappé en mémoire (mmap) — sans réseau, sans API, zéro copie, zéro latence.

### Différences selon la plateforme

| Plateforme | Mécanisme | Emplacement |
|------------|-----------|-------------|
| Windows | Mémoire partagée nommée — `mmap.mmap(-1, size, name)` | Géré par l'OS |
| Linux | mmap sur fichier — `open("/dev/shm/LMU_Data", "a+b")` | `/dev/shm/` |

La fonction `platform_mmap()` dans `lmu_mmap.py` gère cette différence de manière transparente.

### Structure en mémoire

Le bloc de mémoire partagée (~324 Ko) est mappé directement sur une seule structure C `LMUObjectOut`. Python la lit via `ctypes` — aucune sérialisation, aucun parsing.

```
LMUObjectOut
├── generic         (LMUGeneric)       — version du jeu, événements, FFB, fenêtre
│   ├── events      (LMUEvent)         — flags de mise à jour (scoring/telemetry actifs ?)
│   ├── gameVersion (int)
│   ├── FFBTorque   (float)
│   └── appInfo     (LMUApplicationState)
├── paths           (LMUPathData)      — chemins du système de fichiers (user data, plugins…)
├── scoring         (LMUScoringData)   — session + données scoring de tous les véhicules
│   ├── scoringInfo (LMUScoringInfo)   — circuit, type de session, météo, drapeaux…
│   └── vehScoringInfo[104]            — scoring par véhicule (position, temps au tour…)
└── telemetry       (LMUTelemetryData) — données physiques de tous les véhicules
    └── telemInfo[104]                 — télémétrie par véhicule (RPM, vitesse, roues…)
```

Maximum 104 véhicules (`MAX_MAPPED_VEHICLES`).

---

## Modules

### `lmu_data.py` — structures de données

Toutes les classes `ctypes.Structure` reproduisent les structs C++ du jeu. L'alignement `_pack_ = 4` doit correspondre exactement au binaire du jeu.

| Classe | Correspond à | Rôle |
|--------|-------------|------|
| `LMUObjectOut` | `SharedMemoryObjectOut` | Structure racine — tout le bloc mémoire |
| `LMUGeneric` | `SharedMemoryGeneric` | Version du jeu, événements, FFB |
| `LMUEvent` | `SharedMemoryEvent` (enum→struct) | Flags d'événements de mise à jour |
| `LMUScoringData` | `SharedMemoryScoringData` | Conteneur du scoring de session |
| `LMUScoringInfo` | `ScoringInfoV01` | Infos circuit/session/météo |
| `LMUVehicleScoring` | `VehicleScoringInfoV01` | Données de course par véhicule |
| `LMUTelemetryData` | `SharedMemoryTelemetryData` | Conteneur de télémétrie |
| `LMUVehicleTelemetry` | `TelemInfoV01` | Physique par véhicule |
| `LMUWheel` | `TelemWheelV01` | Données par roue (×4 par véhicule) |
| `LMUVect3` | `TelemVect3` | Vecteur 3D (x, y, z) |
| `LMUPathData` | `SharedMemoryPathData` | Chemins du jeu |
| `LMUApplicationState` | `ApplicationStateV01` | Infos fenêtre/écran |
| `SimInfo` | — | Wrapper simple legacy (Windows uniquement, accès direct) |

`SimInfo` ouvre le mmap et expose `LMUData` directement dans la mémoire live sans protection contre les lectures partielles. Préférer `MMapControl` pour tout nouveau code.

---

### `lmu_mmap.py` — contrôle du memory map

`MMapControl` est l'interface principale.

```python
from pyLMUSharedMemory import lmu_data
from pyLMUSharedMemory.lmu_mmap import MMapControl, LMUConstants

info = MMapControl(LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
info.create(access_mode=0)  # 0 = mode copie, 1 = mode direct
```

#### Modes d'accès

| Mode | Valeur | Description |
|------|--------|-------------|
| Copie | `0` | Lit le mmap dans un `bytearray` local. `data` pointe sur la copie. Plus sûr — évite les lectures en cours d'écriture. |
| Direct | `1` | `data` pointe directement dans le buffer mmap live. Moins de surcharge, risque de données incohérentes. |

#### Mécanisme de mise à jour (mode copie)

Appeler `info.update()` à chaque frame. En mode copie, deux conditions sont vérifiées avant de copier :

1. Le flag `SME_UPDATE_SCORING` ou `SME_UPDATE_TELEMETRY` est actif (le jeu écrit activement)
2. `scoringInfo.mNumVehicles == telemetry.activeVehicles` (données cohérentes)

Si les deux conditions passent, le bloc mmap entier est copié dans le buffer local de façon atomique. Cela évite de lire des données à moitié écrites.

En mode direct, `update()` ne fait rien.

#### Cycle de vie

```python
info.create(0)      # ouvre le mmap, alloue le buffer
info.update()       # rafraîchit le buffer (appeler à chaque frame)
_ = info.data.scoring.scoringInfo.mTrackName  # lecture
info.close()        # snapshot final, ferme le handle mmap
```

Après `close()`, `info.data` contient encore le dernier snapshot. `info.update` devient `None`.

---

### `lmu_enum.py` — énumérations

Enums typés pour les champs entiers renvoyés par la mémoire partagée.

| Enum | Champ | Valeurs |
|------|-------|---------|
| `LMUSession` | `mSession` | `TestDay`, `Practice1`…`Race4` |
| `LMUGamePhase` | `mGamePhase` | `GreenFlag`, `FullCourseYellow`, `SessionOver`… |
| `LMUYellowFlagState` | `mYellowFlagState` | `PitOpen`, `LastLap`, `Resume`… |
| `LMUVehicleClass` | `mVehicleClass` | `Hypercar`, `LMP2`, `GT3`… |
| `LMUVehicleChampionship` | `mVehicleChampionship` | `WEC_2024`, `ELMS_2025`… |
| `LMUCompoundType` | `mCompoundType` | `Soft`, `Medium`, `Hard`, `Wet` |
| `LMUWheelIndex` | index tableau | `FrontLeft=0`, `FrontRight=1`, `RearLeft=2`, `RearRight=3` |
| `LMUSurfaceType` | `mSurfaceType` | `Dry`, `Wet`, `Grass`, `Gravel`… |
| `LMUPitState` | `mPitState` | `Request`, `Entering`, `Stopped`, `Exiting` |
| `LMUFinishStatus` | `mFinishStatus` | `Finished`, `Dnf`, `Dq` |
| `LMUControl` | `mControl` | `Player`, `AI`, `Remote` |
| `LMUTrackGripLevel` | `mTrackGripLevel` | `Green`, `Low`, `Medium`, `High`, `Saturated` |
| `LMUCloudCoverage` | `mCloudCoverage` | `Clear` → `OvercastAndStorm` |
| `LMURearFlapLegalStatus` | `mRearFlapLegalStatus` | DRS autorisé/interdit |
| `LMUWiperStatus` | `mWiperState` | `Off`, `Auto`, `Slow`, `Fast` |

`enum_map()` construit une fonction de lookup rapide via `dict` pour éviter l'itération sur l'enum à chaque appel :

```python
COMPOUND = lmu_enum.enum_map(lmu_enum.LMUCompoundType)
print(COMPOUND(0))  # "Soft"
```

---

### `lmu_type.py` — annotations de types

Classes abstraites miroir de `lmu_data.py` avec annotations de types Python. Non instanciables — uniquement pour l'autocomplétion IDE et la vérification statique.

---

## Exemples d'utilisation

### Boucle de lecture basique

```python
from pyLMUSharedMemory import lmu_data
from pyLMUSharedMemory.lmu_mmap import MMapControl, LMUConstants

info = MMapControl(LMUConstants.LMU_SHARED_MEMORY_FILE, lmu_data.LMUObjectOut)
info.create(access_mode=0)  # mode copie

while True:
    info.update()

    if not info.data.generic.gameVersion:
        print("Jeu non lancé")
        continue

    scoring = info.data.scoring.scoringInfo
    print(f"Circuit : {scoring.mTrackName.decode()}")
    print(f"Véhicules : {scoring.mNumVehicles}")

    idx = info.data.telemetry.playerVehicleIdx
    telem = info.data.telemetry.telemInfo[idx]
    print(f"RPM : {telem.mEngineRPM:.0f}  Rapport : {telem.mGear}")
```

### Boucle sur tous les véhicules (scoring)

```python
total = info.data.scoring.scoringInfo.mNumVehicles
for i in range(total):
    v = info.data.scoring.vehScoringInfo[i]
    print(f"P{v.mPlace} {v.mDriverName.decode()} — meilleur : {v.mBestLapTime:.3f}s")
```

### Données des roues

```python
from pyLMUSharedMemory import lmu_enum

idx = info.data.telemetry.playerVehicleIdx
wheels = info.data.telemetry.telemInfo[idx].mWheels

for wi in lmu_enum.LMUWheelIndex:
    w = wheels[wi.value]
    compound = lmu_enum.LMUCompoundType(w.mCompoundType).name
    print(f"{wi.name} : compound={compound}  usure={w.mWear:.2f}  temp={w.mTemperature[1] - 273.15:.1f}°C")
```

### Décoder les champs bytes

Les champs texte sont de type `bytes` — toujours appeler `.decode()` avant usage :

```python
circuit = info.data.scoring.scoringInfo.mTrackName.decode()
pilote = info.data.scoring.vehScoringInfo[0].mDriverName.decode()
```

---

## Constantes principales

| Constante | Valeur | Description |
|-----------|--------|-------------|
| `LMUConstants.LMU_SHARED_MEMORY_FILE` | `"LMU_Data"` | Nom du fichier mémoire partagée |
| `LMUConstants.LMU_PROCESS_NAME` | `"Le Mans Ultimate"` | Nom du processus du jeu |
| `LMUConstants.MAX_MAPPED_VEHICLES` | `104` | Nombre max de véhicules dans les tableaux |
| `LMUConstants.MAX_PATH_LENGTH` | `260` | Longueur max de chemin (limite ANSI Windows) |

---

## Particularité des secteurs

Les valeurs de `mSector` ne sont pas séquentielles — c'est intentionnel dans l'API du jeu :

| Valeur | Secteur réel |
|--------|-------------|
| `0` | Secteur 3 |
| `1` | Secteur 1 |
| `2` | Secteur 2 |

Utiliser `lmu_enum.LMUSector` pour mapper correctement.

---

## Référence des tailles de structs

Tailles attendues vérifiées dans `tests/read_lmu_api.py` :

| Struct | Taille (octets) |
|--------|----------------|
| `LMUVect3` | 24 |
| `LMUWheel` | 260 |
| `LMUVehicleTelemetry` | 1 888 |
| `LMUVehicleScoring` | 584 |
| `LMUScoringInfo` | 548 |
| `LMUApplicationState` | 260 |
| `LMUScoringData` | 126 832 |
| `LMUTelemetryData` | 196 356 |
| `LMUPathData` | 1 300 |
| `LMUEvent` | 64 |
| `LMUGeneric` | 332 |
| `LMUObjectOut` | 324 820 |

---

## Référence des champs

Liste complète de tous les champs lisibles, organisée par struct. Accès via l'attribut `.data` de `MMapControl` :

```python
d = ctrl.data
# ex : d.scoring.scoringInfo.mTrackName
```

---

### `LMUObjectOut` — Objet racine

| Champ | Type | Description |
|-------|------|-------------|
| `generic` | `LMUGeneric` | Événements, version du jeu, couple FFB, état de la fenêtre |
| `paths` | `LMUPathData` | Chemins du système de fichiers utilisés par le jeu |
| `scoring` | `LMUScoringData` | Informations de session + scoring par véhicule |
| `telemetry` | `LMUTelemetryData` | Données physiques / télémétrie par véhicule |

---

### `LMUGeneric`

| Champ | Type | Description |
|-------|------|-------------|
| `events` | `LMUEvent` | Compteurs d'événements, incrémentés à chaque déclenchement |
| `gameVersion` | `int` | Version du jeu (entier) |
| `FFBTorque` | `float` | Valeur du couple de force feedback |
| `appInfo` | `LMUApplicationState` | État de la fenêtre de l'application |

---

### `LMUEvent` — Compteurs d'événements

Chaque champ est un `uint` incrémenté à chaque déclenchement. Comparer le delta entre deux lectures pour détecter un événement.

| Champ | Description |
|-------|-------------|
| `SME_ENTER` | Plugin activé |
| `SME_EXIT` | Plugin désactivé |
| `SME_STARTUP` | Démarrage du jeu |
| `SME_SHUTDOWN` | Arrêt du jeu |
| `SME_LOAD` | Circuit / session chargé |
| `SME_UNLOAD` | Circuit / session déchargé |
| `SME_START_SESSION` | Session démarrée |
| `SME_END_SESSION` | Session terminée |
| `SME_ENTER_REALTIME` | Entrée en temps réel (joueur sur piste) |
| `SME_EXIT_REALTIME` | Sortie du temps réel (retour au moniteur) |
| `SME_UPDATE_SCORING` | Données scoring mises à jour — déclenche la copie du buffer en mode copie |
| `SME_UPDATE_TELEMETRY` | Données télémétrie mises à jour — déclenche la copie du buffer en mode copie |
| `SME_INIT_APPLICATION` | Application initialisée |
| `SME_UNINIT_APPLICATION` | Application désinitialisée |
| `SME_SET_ENVIRONMENT` | Environnement configuré |
| `SME_FFB` | Événement force feedback |

---

### `LMUApplicationState`

| Champ | Type | Description |
|-------|------|-------------|
| `mAppWindow` | `uint64` | Handle HWND de la fenêtre (Windows uniquement) |
| `mWidth` | `uint` | Largeur de l'écran en pixels |
| `mHeight` | `uint` | Hauteur de l'écran en pixels |
| `mRefreshRate` | `uint` | Taux de rafraîchissement du moniteur (Hz) |
| `mWindowed` | `uint` | `1` = mode fenêtré, `0` = plein écran |
| `mOptionsLocation` | `uint8` | Emplacement UI actuel : `0`=menu principal, `1`=chargement, `2`=moniteur, `3`=en piste |
| `mOptionsPage` | `bytes[31]` | Nom de la page d'options active |

---

### `LMUPathData` — Chemins du système de fichiers

Tous les champs sont des `bytes[260]`. Décoder avec `.decode('utf-8')`.

| Champ | Description |
|-------|-------------|
| `userData` | Répertoire des données utilisateur |
| `customVariables` | Fichier de variables personnalisées |
| `stewardResults` | Sortie des résultats du commissaire |
| `playerProfile` | Fichier de profil du joueur |
| `pluginsFolder` | Répertoire des plugins |

---

### `LMUScoringData`

| Champ | Type | Description |
|-------|------|-------------|
| `scoringInfo` | `LMUScoringInfo` | Informations de session (circuit, météo, phase…) |
| `scoringStreamSize` | `bytes[12]` | Interne — métadonnées de taille pour `scoringStream` |
| `vehScoringInfo` | `LMUVehicleScoring[104]` | Scoring par véhicule ; entrées valides = `scoringInfo.mNumVehicles` |
| `scoringStream` | `bytes[65536]` | Flux texte des résultats, délimité par des sauts de ligne, terminé par null |

---

### `LMUScoringInfo` — Informations de session

| Champ | Type | Unité / Plage | Description |
|-------|------|---------------|-------------|
| `mTrackName` | `bytes[64]` | — | Nom du circuit |
| `mSession` | `int` | `LMUSession` | Type de session (0=essai libre … 13=course 4) |
| `mCurrentET` | `double` | secondes | Temps écoulé depuis le début de la session |
| `mEndET` | `double` | secondes | Temps de fin de session (`-1` = pas de limite) |
| `mMaxLaps` | `int` | tours | Nombre maximum de tours (`-1` = pas de limite) |
| `mLapDist` | `double` | mètres | Longueur totale du circuit |
| `mNumVehicles` | `int` | — | Nombre de véhicules actuellement en session |
| `mGamePhase` | `uint8` | `LMUGamePhase` | Phase de jeu en cours (0–9) |
| `mYellowFlagState` | `int8` | `LMUYellowFlagState` | État du drapeau jaune général (−1 à 7) |
| `mSectorFlag` | `uint8[3]` | — | Drapeau jaune local par secteur (`0`=aucun, `1`=jaune) |
| `mStartLight` | `uint8` | — | Indice du feu de départ actif |
| `mNumRedLights` | `uint8` | — | Nombre de feux rouges dans la séquence de départ |
| `mInRealtime` | `bool` | — | `True` si le joueur est en piste (pas au moniteur) |
| `mPlayerName` | `bytes[32]` | — | Nom d'affichage du joueur local |
| `mPlrFileName` | `bytes[64]` | — | Nom du fichier de profil joueur |
| `mDarkCloud` | `double` | 0.0–1.0 | Opacité des nuages |
| `mRaining` | `double` | 0.0–1.0 | Intensité de la pluie |
| `mAmbientTemp` | `double` | °C | Température de l'air ambiant |
| `mTrackTemp` | `double` | °C | Température de la surface de la piste |
| `mWind` | `LMUVect3` | m/s | Vecteur de vitesse du vent |
| `mMinPathWetness` | `double` | 0.0–1.0 | Mouillure minimale sur la ligne de course |
| `mMaxPathWetness` | `double` | 0.0–1.0 | Mouillure maximale sur la ligne de course |
| `mAvgPathWetness` | `double` | 0.0–1.0 | Mouillure moyenne sur la ligne de course |
| `mGameMode` | `uint8` | `LMUGameMode` | `1`=serveur, `2`=client, `3`=les deux |
| `mIsPasswordProtected` | `bool` | — | Serveur protégé par mot de passe |
| `mServerPort` | `uint16` | — | Port du serveur |
| `mServerPublicIP` | `uint32` | — | IP publique du serveur (uint32 compacté) |
| `mMaxPlayers` | `int` | — | Nombre maximum de joueurs autorisés |
| `mServerName` | `bytes[32]` | — | Nom du serveur |
| `mStartET` | `float` | secondes depuis minuit | Heure de début de l'événement (horloge murale) |
| `mSessionTimeRemaining` | `float` | secondes | Temps restant dans la session |
| `mTimeOfDay` | `float` | secondes depuis minuit | Heure du jeu en cours |
| `mIsFixedSetup` | `bool` | — | Réglages verrouillés |
| `mTrackGripLevel` | `uint8` | `LMUTrackGripLevel` | Niveau de gomme sur la piste (0=vert … 4=saturé) |
| `mCloudCoverage` | `uint8` | `LMUCloudCoverage` | Condition du ciel (0=dégagé … 10=orage) |
| `mTrackLimitsStepsPerPenalty` | `uint8` | — | Étapes de limites de piste avant pénalité |
| `mTrackLimitsStepsPerPoint` | `uint8` | — | Étapes attribuées par point de dépassement |

---

### `LMUVehicleScoring` — Scoring par véhicule

Itérer sur `vehScoringInfo[:scoringInfo.mNumVehicles]`.

| Champ | Type | Unité / Plage | Description |
|-------|------|---------------|-------------|
| `mID` | `int` | — | ID de slot (peut être réutilisé après déconnexion) |
| `mDriverName` | `bytes[32]` | — | Nom d'affichage du pilote |
| `mVehicleName` | `bytes[64]` | — | Nom du véhicule |
| `mTotalLaps` | `int16` | tours | Tours complétés |
| `mSector` | `int8` | `LMUSector` | Secteur actuel — **0=S3, 1=S1, 2=S2** (voir particularité des secteurs) |
| `mFinishStatus` | `int8` | `LMUFinishStatus` | `0`=aucun, `1`=arrivé, `2`=abandon, `3`=disqualifié |
| `mLapDist` | `double` | mètres | Distance parcourue dans le tour en cours |
| `mPathLateral` | `double` | mètres | Décalage latéral par rapport à la ligne centrale approximative |
| `mTrackEdge` | `double` | mètres | Distance au bord de la piste du côté du véhicule |
| `mBestSector1` | `double` | secondes | Meilleur temps en S1 (toute la session) |
| `mBestSector2` | `double` | secondes | Meilleur temps cumulé S1+S2 (toute la session) |
| `mBestLapTime` | `double` | secondes | Meilleur tour (toute la session) |
| `mLastSector1` | `double` | secondes | S1 du dernier tour |
| `mLastSector2` | `double` | secondes | Cumulé S1+S2 du dernier tour |
| `mLastLapTime` | `double` | secondes | Temps du dernier tour complété |
| `mCurSector1` | `double` | secondes | S1 du tour en cours (0 si non encore franchi) |
| `mCurSector2` | `double` | secondes | Cumulé S1+S2 du tour en cours (0 si non encore franchi) |
| `mNumPitstops` | `int16` | — | Arrêts aux stands effectués dans la session |
| `mNumPenalties` | `int16` | — | Pénalités en attente (non encore purgées) |
| `mIsPlayer` | `bool` | — | `True` si c'est le joueur local |
| `mControl` | `int8` | `LMUControl` | `−1`=personne, `0`=joueur local, `1`=IA locale, `2`=distant, `3`=replay |
| `mInPits` | `bool` | — | Entre l'entrée et la sortie des stands (peut être en retard pour les véhicules distants) |
| `mPlace` | `uint8` | base 1 | Position en course |
| `mVehicleClass` | `bytes[32]` | — | Catégorie du véhicule |
| `mTimeBehindNext` | `double` | secondes | Écart avec la voiture devant |
| `mLapsBehindNext` | `int` | tours | Tours de retard sur la voiture devant |
| `mTimeBehindLeader` | `double` | secondes | Écart avec le leader |
| `mLapsBehindLeader` | `int` | tours | Tours de retard sur le leader |
| `mLapStartET` | `double` | secondes | Temps écoulé au début du tour en cours |
| `mPos` | `LMUVect3` | mètres | Position mondiale |
| `mLocalVel` | `LMUVect3` | m/s | Vitesse dans le repère local du véhicule |
| `mLocalAccel` | `LMUVect3` | m/s² | Accélération dans le repère local |
| `mOri` | `LMUVect3[3]` | — | Lignes de la matrice d'orientation (véhicule → monde) |
| `mLocalRot` | `LMUVect3` | rad/s | Vitesse angulaire dans le repère local |
| `mLocalRotAccel` | `LMUVect3` | rad/s² | Accélération angulaire dans le repère local |
| `mHeadlights` | `uint8` | — | État des phares |
| `mPitState` | `uint8` | `LMUPitState` | `0`=aucun, `1`=demandé, `2`=entrée, `3`=arrêté, `4`=sortie |
| `mServerScored` | `uint8` | — | Le serveur marque ce véhicule (peut être désactivé en qualifications) |
| `mIndividualPhase` | `uint8` | — | Phase individuelle (étend `mGamePhase` avec `9`=après formation, `10`=sous jaune, `11`=sous bleu) |
| `mQualification` | `int` | base 1 | Position en grille de qualification (`−1` = invalide) |
| `mTimeIntoLap` | `double` | secondes | Temps estimé dans le tour en cours |
| `mEstimatedLapTime` | `double` | secondes | Temps au tour estimé utilisé pour les écarts |
| `mPitGroup` | `bytes[24]` | — | Groupe de stands / nom d'équipe (peut différer si stand partagé) |
| `mFlag` | `uint8` | `LMUPrimaryFlag` | Drapeau montré au véhicule : `0`=vert, `6`=bleu |
| `mUnderYellow` | `bool` | — | Voiture a passé la ligne start/finish sous jaune général |
| `mCountLapFlag` | `uint8` | `LMUCountLapFlag` | `0`=ignorer tour+temps, `1`=compter tour seulement, `2`=compter tour+temps |
| `mInGarageStall` | `bool` | — | Véhicule apparemment dans son box de garage |
| `mUpgradePack` | `bytes[16]` | — | Drapeaux d'améliorations codées |
| `mPitLapDist` | `float` | mètres | Position du box en distance de tour |
| `mBestLapSector1` | `float` | secondes | S1 du meilleur tour (pas le meilleur S1 absolu) |
| `mBestLapSector2` | `float` | secondes | S2 du meilleur tour (pas le meilleur S2 absolu) |
| `mSteamID` | `uint64` | — | Steam ID du pilote (`0` si absent) |
| `mVehFilename` | `bytes[32]` | — | Nom du fichier `.veh` pour identification |
| `mAttackMode` | `int16` | — | État du mode attaque |
| `mFuelFraction` | `uint8` | 0x00–0xFF | Niveau carburant / batterie (`0x00`=0 %, `0xFF`=100 %) |
| `mDRSState` | `bool` | — | DRS (volet arrière) actuellement ouvert |

---

### `LMUTelemetryData`

| Champ | Type | Description |
|-------|------|-------------|
| `activeVehicles` | `uint8` | Nombre de véhicules avec télémétrie active |
| `playerVehicleIdx` | `uint8` | Index dans `telemInfo` pour le véhicule du joueur local |
| `playerHasVehicle` | `bool` | Le joueur a un véhicule en piste |
| `telemInfo` | `LMUVehicleTelemetry[104]` | Télémétrie par véhicule ; entrées valides = `activeVehicles` |

---

### `LMUVehicleTelemetry` — Physique par véhicule

Accès via `telemInfo[i]`. Ordre des roues : `0`=AVG, `1`=AVD, `2`=ARG, `3`=ARD.

| Champ | Type | Unité / Plage | Description |
|-------|------|---------------|-------------|
| `mID` | `int` | — | ID de slot (correspond à `LMUVehicleScoring.mID`) |
| `mDeltaTime` | `double` | secondes | Temps depuis la dernière mise à jour de télémétrie |
| `mElapsedTime` | `double` | secondes | Temps écoulé de session |
| `mLapNumber` | `int` | — | Numéro du tour en cours |
| `mLapStartET` | `double` | secondes | Temps écoulé au début du tour en cours |
| `mVehicleName` | `bytes[64]` | — | Nom du véhicule |
| `mTrackName` | `bytes[64]` | — | Nom du circuit |
| `mPos` | `LMUVect3` | mètres | Position mondiale |
| `mLocalVel` | `LMUVect3` | m/s | Vitesse dans le repère local |
| `mLocalAccel` | `LMUVect3` | m/s² | Accélération dans le repère local |
| `mOri` | `LMUVect3[3]` | — | Lignes de la matrice d'orientation |
| `mLocalRot` | `LMUVect3` | rad/s | Vitesse angulaire dans le repère local |
| `mLocalRotAccel` | `LMUVect3` | rad/s² | Accélération angulaire dans le repère local |
| `mGear` | `int` | — | Rapport : `−1`=marche arrière, `0`=neutre, `1+`=avant |
| `mEngineRPM` | `double` | tr/min | Régime moteur |
| `mEngineWaterTemp` | `double` | °C | Température du liquide de refroidissement |
| `mEngineOilTemp` | `double` | °C | Température de l'huile moteur |
| `mClutchRPM` | `double` | tr/min | Régime de l'embrayage |
| `mUnfilteredThrottle` | `double` | 0.0–1.0 | Entrée gaz brute (avant aides) |
| `mUnfilteredBrake` | `double` | 0.0–1.0 | Entrée frein brute (avant ABS) |
| `mUnfilteredSteering` | `double` | −1.0–1.0 | Entrée direction brute (gauche=−1, droite=+1) |
| `mUnfilteredClutch` | `double` | 0.0–1.0 | Entrée embrayage brute |
| `mFilteredThrottle` | `double` | 0.0–1.0 | Gaz après antipatinage / cartographies |
| `mFilteredBrake` | `double` | 0.0–1.0 | Frein après ABS |
| `mFilteredSteering` | `double` | −1.0–1.0 | Direction après aides |
| `mFilteredClutch` | `double` | 0.0–1.0 | Embrayage après aides |
| `mSteeringShaftTorque` | `double` | N·m | Couple sur l'axe de direction (utilisé pour le FFB) |
| `mFront3rdDeflection` | `double` | mètres | Déflexion du troisième ressort avant |
| `mRear3rdDeflection` | `double` | mètres | Déflexion du troisième ressort arrière |
| `mFrontWingHeight` | `double` | mètres | Hauteur de l'aileron avant |
| `mFrontRideHeight` | `double` | mètres | Hauteur de caisse avant |
| `mRearRideHeight` | `double` | mètres | Hauteur de caisse arrière |
| `mDrag` | `double` | N | Force de traînée aérodynamique |
| `mFrontDownforce` | `double` | N | Appui aérodynamique avant |
| `mRearDownforce` | `double` | N | Appui aérodynamique arrière |
| `mFuel` | `double` | litres | Quantité de carburant restante |
| `mEngineMaxRPM` | `double` | tr/min | Limiteur de régime |
| `mScheduledStops` | `uint8` | — | Arrêts obligatoires restants |
| `mOverheating` | `bool` | — | Alerte surchauffe active |
| `mDetached` | `bool` | — | Pièces (hors roues) détachées |
| `mHeadlights` | `bool` | — | Phares allumés |
| `mDentSeverity` | `uint8[8]` | 0–2 | Dommages carrosserie en 8 zones (`0`=aucun, `1`=léger, `2`=important) |
| `mLastImpactET` | `double` | secondes | Temps de session du dernier impact |
| `mLastImpactMagnitude` | `double` | — | Intensité du dernier impact |
| `mLastImpactPos` | `LMUVect3` | mètres | Position mondiale du dernier impact |
| `mEngineTorque` | `double` | N·m | Couple moteur actuel (comprend le couple additif) |
| `mCurrentSector` | `int` | — | Secteur actuel (base 0) ; bit 31 à 1 = dans la voie des stands |
| `mSpeedLimiter` | `uint8` | — | Limiteur de vitesse stand engagé |
| `mMaxGears` | `uint8` | — | Nombre total de rapports avant |
| `mFrontTireCompoundIndex` | `uint8` | — | Index du composé de pneu avant dans la marque |
| `mRearTireCompoundIndex` | `uint8` | — | Index du composé de pneu arrière dans la marque |
| `mFuelCapacity` | `double` | litres | Capacité maximale du réservoir |
| `mFrontFlapActivated` | `uint8` | — | Volet avant déployé |
| `mRearFlapActivated` | `uint8` | — | Volet arrière (DRS) déployé |
| `mRearFlapLegalStatus` | `uint8` | `LMURearFlapLegalStatus` | `0`=interdit, `1`=en attente, `2`=autorisé |
| `mIgnitionStarter` | `uint8` | `LMUIgnitionStarterStatus` | `0`=éteint, `1`=allumage, `2`=allumage+démarreur |
| `mFrontTireCompoundName` | `bytes[18]` | — | Nom du composé de pneu avant |
| `mRearTireCompoundName` | `bytes[18]` | — | Nom du composé de pneu arrière |
| `mSpeedLimiterAvailable` | `uint8` | — | Limiteur de vitesse disponible sur cette voiture |
| `mAntiStallActivated` | `uint8` | — | Anti-calage dur engagé |
| `mVisualSteeringWheelRange` | `float` | degrés | Angle de braquage visuel (volant à l'écran) |
| `mRearBrakeBias` | `double` | 0.0–1.0 | Fraction du freinage sur l'essieu arrière |
| `mTurboBoostPressure` | `double` | — | Pression de suralimentation turbo (si disponible) |
| `mPhysicsToGraphicsOffset` | `float[3]` | mètres | Décalage entre le centre de masse physique et le centre graphique |
| `mPhysicalSteeringWheelRange` | `float` | degrés | Angle de braquage physique du volant |
| `mDeltaBest` | `double` | secondes | Delta par rapport au meilleur tour (négatif = en avance) |
| `mBatteryChargeFraction` | `double` | 0.0–1.0 | Niveau de charge de la batterie VE/hybride |
| `mElectricBoostMotorTorque` | `double` | N·m | Couple du moteur électrique (négatif = régénération) |
| `mElectricBoostMotorRPM` | `double` | tr/min | Régime du moteur électrique |
| `mElectricBoostMotorTemperature` | `double` | °C | Température du moteur électrique |
| `mElectricBoostWaterTemperature` | `double` | °C | Température du liquide de refroidissement du moteur électrique (`0` si absent) |
| `mElectricBoostMotorState` | `uint8` | — | `0`=indisponible, `1`=inactif, `2`=propulsion, `3`=régénération |
| `mLapInvalidated` | `bool` | — | Tour en cours invalidé |
| `mABSActive` | `bool` | — | ABS en intervention |
| `mTCActive` | `bool` | — | Antipatinage en intervention |
| `mSpeedLimiterActive` | `bool` | — | Limiteur de vitesse actif |
| `mWiperState` | `uint8` | `LMUWiperStatus` | `0`=éteint, `1`=auto, `2`=lent, `3`=rapide |
| `mTC` | `uint8` | — | Réglage antipatinage actuel |
| `mTCMax` | `uint8` | — | Nombre maximum de crans d'antipatinage |
| `mTCSlip` | `uint8` | — | Seuil de glissement TC actuel |
| `mTCSlipMax` | `uint8` | — | Maximum de crans de glissement TC |
| `mTCCut` | `uint8` | — | Coupure TC actuelle |
| `mTCCutMax` | `uint8` | — | Maximum de crans de coupure TC |
| `mABS` | `uint8` | — | Réglage ABS actuel |
| `mABSMax` | `uint8` | — | Nombre maximum de crans ABS |
| `mMotorMap` | `uint8` | — | Cartographie moteur / électrique actuelle |
| `mMotorMapMax` | `uint8` | — | Nombre maximum de cartographies |
| `mMigration` | `uint8` | — | Réglage de déploiement ERS (migration) actuel |
| `mMigrationMax` | `uint8` | — | Maximum de crans de migration |
| `mFrontAntiSway` | `uint8` | — | Réglage de barre anti-roulis avant |
| `mFrontAntiSwayMax` | `uint8` | — | Maximum de crans de barre anti-roulis avant |
| `mRearAntiSway` | `uint8` | — | Réglage de barre anti-roulis arrière |
| `mRearAntiSwayMax` | `uint8` | — | Maximum de crans de barre anti-roulis arrière |
| `mLiftAndCoastProgress` | `uint8` | — | Progression de la manœuvre lift-and-coast |
| `mTrackLimitsSteps` | `uint8` | — | Points de limites de piste accumulés |
| `mRegen` | `float` | kW | Puissance de régénération actuelle |
| `mStateOfCharge` | `float` | % | État de charge de la batterie |
| `mVirtualEnergy` | `float` | 0.0–1.0 | Fraction d'énergie virtuelle |
| `mTimeGapCarAhead` | `float` | secondes | Écart avec la voiture physiquement devant en piste |
| `mTimeGapCarBehind` | `float` | secondes | Écart avec la voiture physiquement derrière en piste |
| `mTimeGapPlaceAhead` | `float` | secondes | Écart avec la voiture une place au-dessus au classement |
| `mTimeGapPlaceBehind` | `float` | secondes | Écart avec la voiture une place en dessous au classement |
| `mVehicleModel` | `bytes[30]` | — | Nom de la marque et du modèle |
| `mVehicleClass` | `uint8` | `LMUVehicleClass` | Enum de la catégorie du véhicule |
| `mVehicleChampionship` | `uint8` | `LMUVehicleChampionship` | Enum du championnat et de l'année |
| `mWheels` | `LMUWheel[4]` | — | Données des roues (`0`=AVG, `1`=AVD, `2`=ARG, `3`=ARD) |

---

### `LMUWheel` — Données par roue

Accès via `telemInfo[i].mWheels[j]`.

| Champ | Type | Unité / Plage | Description |
|-------|------|---------------|-------------|
| `mSuspensionDeflection` | `double` | mètres | Débattement de suspension depuis la position de repos |
| `mRideHeight` | `double` | mètres | Hauteur de caisse à ce coin |
| `mSuspForce` | `double` | N | Charge sur la bielle de poussée |
| `mBrakeTemp` | `double` | °C | Température du disque de frein |
| `mBrakePressure` | `double` | 0.0–1.0 | Fraction de pression de frein (future version du jeu : kPa) |
| `mRotation` | `double` | rad/s | Vitesse de rotation de la roue |
| `mLateralPatchVel` | `double` | m/s | Vitesse latérale à la surface de contact |
| `mLongitudinalPatchVel` | `double` | m/s | Vitesse longitudinale à la surface de contact |
| `mLateralGroundVel` | `double` | m/s | Vitesse latérale du sol à la surface de contact |
| `mLongitudinalGroundVel` | `double` | m/s | Vitesse longitudinale du sol à la surface de contact |
| `mCamber` | `double` | radians | Angle de carrossage (positif = inclinaison vers l'extérieur) |
| `mLateralForce` | `double` | N | Force latérale (en virage) |
| `mLongitudinalForce` | `double` | N | Force longitudinale (traction / freinage) |
| `mTireLoad` | `double` | N | Charge verticale sur le pneu |
| `mGripFract` | `double` | 0.0–1.0 | Fraction estimée de la surface de contact en glissement |
| `mPressure` | `double` | kPa | Pression de gonflage du pneu |
| `mTemperature` | `double[3]` | K | Température de surface — zones gauche / centre / droite (soustraire 273,15 pour °C) |
| `mWear` | `double` | 0.0–1.0 | Usure du pneu (non linéairement proportionnelle à la perte d'adhérence) |
| `mTerrainName` | `bytes[16]` | — | Préfixe matériau TDF de la surface actuelle |
| `mSurfaceType` | `uint8` | `LMUSurfaceType` | `0`=sec, `1`=mouillé, `2`=herbe, `3`=terre, `4`=graviers, `5`=vibreurs, `6`=spécial |
| `mFlat` | `bool` | — | Pneu crevé |
| `mDetached` | `bool` | — | Roue détachée de la voiture |
| `mStaticUndeflectedRadius` | `uint8` | cm | Rayon nominal du pneu |
| `mVerticalTireDeflection` | `double` | mètres | Déformation par rapport au rayon nominal ajusté à la vitesse |
| `mWheelYLocation` | `double` | mètres | Position Y de la roue relative à celle du véhicule |
| `mToe` | `double` | radians | Angle de pincement actuel par rapport à l'axe du véhicule |
| `mTireCarcassTemperature` | `double` | K | Température moyenne de la carcasse (soustraire 273,15 pour °C) |
| `mTireInnerLayerTemperature` | `double[3]` | K | Température de la couche intérieure de gomme — gauche / centre / droite (soustraire 273,15 pour °C) |
| `mOptimalTemp` | `float` | °C | Température optimale de fonctionnement (constructeur) |
| `mCompoundIndex` | `uint8` | — | Index du composé dans la liste voiture+circuit |
| `mCompoundType` | `uint8` | `LMUCompoundType` | `0`=tendre, `1`=medium, `2`=dur, `3`=pluie |

---

### `LMUVect3` — Vecteur 3D

Utilisé pour les positions, vitesses, accélérations et lignes de la matrice d'orientation.

| Champ | Type | Description |
|-------|------|-------------|
| `x` | `double` | Composante X |
| `y` | `double` | Composante Y (vertical dans l'espace monde) |
| `z` | `double` | Composante Z |

---

## Référence des énumérations

Toutes les enums se trouvent dans `lmu_enum.py`. Utiliser `enum_map(EnumClass)` pour un dictionnaire entier → nom rapide.

### `LMUSession`

| Valeur | Nom |
|--------|-----|
| 0 | `TestDay` |
| 1–4 | `Practice1` – `Practice4` |
| 5–8 | `Qualifying1` – `Qualifying4` |
| 9 | `Warmup` |
| 10–13 | `Race1` – `Race4` |

### `LMUGamePhase`

| Valeur | Nom | Notes |
|--------|-----|-------|
| 0 | `Garage` | Avant le début de la session |
| 1 | `WarmUp` | Tours de reconnaissance (course uniquement) |
| 2 | `GridWalk` | Déambulation en grille (course uniquement) |
| 3 | `Formation` | Tour de formation (course uniquement) |
| 4 | `Countdown` | Allumage des feux de départ |
| 5 | `GreenFlag` | Session en cours |
| 6 | `FullCourseYellow` | Voiture de sécurité / drapeau jaune général |
| 7 | `SessionStopped` | Drapeau rouge |
| 8 | `SessionOver` | Drapeau à damier |
| 9 | `PausedOrHeartbeat` | Jeu en pause |

### `LMUVehicleClass`

| Valeur | Nom |
|--------|-----|
| 0x00 | `Hypercar` |
| 0x02 | `LMP2_ELMS` |
| 0x03 | `LMP2` |
| 0x04 | `LMP3` |
| 0x05 | `GTE` |
| 0x06 | `GT3` |
| 0x08 | `PaceCar` |
| 0xFF | `Unknown` |

### `LMUVehicleChampionship`

| Valeur | Nom |
|--------|-----|
| 0x00 | `WEC_2023` |
| 0x01 | `WEC_2024` |
| 0x02 | `WEC_2025` |
| 0x03 | `WEC_2026` |
| 0x10 | `ELMS_2025` |
| 0x11 | `ELMS_2026` |
| 0xFF | `Unknown` |

### `LMUSector` ⚠️ particularité

| Valeur brute | Secteur réel |
|--------------|-------------|
| 0 | Secteur 3 |
| 1 | Secteur 1 |
| 2 | Secteur 2 |

### Autres énumérations

| Enum | Champ | Valeurs |
|------|-------|---------|
| `LMUFinishStatus` | `mFinishStatus` | `0`=aucun, `1`=arrivé, `2`=abandon, `3`=disqualifié |
| `LMUControl` | `mControl` | `−1`=personne, `0`=joueur local, `1`=IA, `2`=distant, `3`=replay |
| `LMUPitState` | `mPitState` | `0`=aucun, `1`=demandé, `2`=entrée, `3`=arrêté, `4`=sortie |
| `LMUPrimaryFlag` | `mFlag` | `0`=vert, `6`=bleu |
| `LMUCountLapFlag` | `mCountLapFlag` | `0`=ignorer, `1`=tour seulement, `2`=tour+temps |
| `LMURearFlapLegalStatus` | `mRearFlapLegalStatus` | `0`=interdit, `1`=en attente, `2`=autorisé |
| `LMUIgnitionStarterStatus` | `mIgnitionStarter` | `0`=éteint, `1`=allumage, `2`=allumage+démarreur |
| `LMUWiperStatus` | `mWiperState` | `0`=éteint, `1`=auto, `2`=lent, `3`=rapide |
| `LMUCompoundType` | `mCompoundType` | `0`=tendre, `1`=medium, `2`=dur, `3`=pluie |
| `LMUSurfaceType` | `mSurfaceType` | `0`=sec, `1`=mouillé, `2`=herbe, `3`=terre, `4`=graviers, `5`=vibreurs, `6`=spécial |
| `LMUTrackGripLevel` | `mTrackGripLevel` | `0`=vert, `1`=faible, `2`=moyen, `3`=élevé, `4`=saturé |
| `LMUCloudCoverage` | `mCloudCoverage` | `0`=dégagé, `1`=nuages légers, `2`=partiellement nuageux, `3`=très nuageux, `4`=couvert, `5`=bruine, `6`=pluie légère, `7`=couvert+pluie légère, `8`=couvert+pluie, `9`=pluie forte, `10`=orage |
| `LMUGameMode` | `mGameMode` | `1`=serveur, `2`=client, `3`=les deux |
| `LMUYellowFlagState` | `mYellowFlagState` | `−1`=invalide, `0`=aucun, `1`=en attente, `2`=stands fermés, `3`=stands ouverts au leader de tour, `4`=stands ouverts, `5`=dernier tour, `6`=reprise, `7`=arrêt de course |
| `LMUWheelIndex` | `mWheels[j]` | `0`=AVG, `1`=AVD, `2`=ARG, `3`=ARD |
