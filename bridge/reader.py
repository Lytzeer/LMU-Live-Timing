import sys
sys.path.insert(0, "pyLMUSharedMemory")

from lmu_mmap import MMapControl
from lmu_data import LMUObjectOut, LMUConstants


class LMUReader:

    def __init__(self):
        self._info = MMapControl(LMUConstants.LMU_SHARED_MEMORY_FILE, LMUObjectOut)
        self._connected = False

    def connect(self):
        try:
            self._info.create(0)
            self._connected = True
            print("✓ LMU shared memory ouvert")
        except Exception as e:
            self._connected = False
            print(f"✗ Impossible d'ouvrir le shared memory : {e}")

    def disconnect(self):
        if self._connected:
            self._info.close()
            self._connected = False
            print("✓ Shared memory fermé")

    def is_connected(self):
        return self._connected

    def get_snapshot(self):
        if not self._connected:
            return None
        try:
            self._info.update()
            return self._info.data
        except Exception as e:
            print(f"✗ Erreur lecture shared memory : {e}")
            self._connected = False
            return None