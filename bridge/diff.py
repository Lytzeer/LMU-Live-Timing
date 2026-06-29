import json
from dataclasses import asdict
from models.session import SessionState


class DiffChecker:

    def __init__(self):
        self._last_snapshot: str | None = None

    def has_changed(self, session: SessionState) -> bool:
        current = json.dumps(asdict(session), sort_keys=True)
        if current == self._last_snapshot:
            return False
        self._last_snapshot = current
        return True