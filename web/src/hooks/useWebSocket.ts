import { useEffect, useState } from "react";

const WS_PROTOCOL = window.location.protocol === "https:" ? "wss" : "ws";
const WS_URL = `${WS_PROTOCOL}://${window.location.host}/ws`;

export function useWebSocket<T>() {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        console.log("✓ Connecté au relay");
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as T;
          setData(parsed);
        } catch (e) {
          console.error("Erreur parsing JSON", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log("✗ Déconnecté, retry dans 3s...");
        retryTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, []);

  return { data, connected };
}
