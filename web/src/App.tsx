import { useWebSocket } from "./hooks/useWebSocket";
import type { SessionState } from "./types/session";
import Leaderboard from "./components/Leaderboard";
import SessionHeader from "./components/SessionHeader";

function App() {
  const { data, connected } = useWebSocket<SessionState>();

  return (
    <div className="p-4">
      <SessionHeader data={data} connected={connected} />
      {data && (
        <div className="mt-4">
          <Leaderboard drivers={data.drivers} />
        </div>
      )}
    </div>
  );
}

export default App;
