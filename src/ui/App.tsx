import { useEffect } from 'react';
import { useSession } from '../store/sessionStore';
import { ChairConsole } from './ChairConsole';
import { SetupScreen, SessionPicker } from './SetupScreen';

export function App() {
  const ready = useSession((s) => s.ready);
  const committee = useSession((s) => s.committee);
  const state = useSession((s) => s.state);
  const init = useSession((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return (
      <div className="setup">
        <div style={{ color: 'var(--ink-3)' }}>正在载入本机会议数据…</div>
      </div>
    );
  }

  if (!committee) return <SetupScreen />;
  if (!state) return <SessionPicker />;
  return <ChairConsole />;
}
