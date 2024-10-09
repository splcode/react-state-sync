import React from 'react';

import './App.css';
import { useConnectedState } from './hooks/useConnectedState';
import { useIsConnected } from './hooks/useIsConnected';

function App() {
  const [jimValue, jimLocked, setJimValue] = useConnectedState('jim/thingy');
  const [garyValue, garyLocked, setGaryValue] = useConnectedState('gary/thingy');
  const isConnected = useIsConnected();

  return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column' }}>
      Jim: {jimValue}
      <input type='range'
             value={jimValue}
             disabled={jimLocked}
             onChange={(e) => setJimValue(parseInt(e.target.value))}
      />

      <hr/>
      <hr/>
      <hr/>
      Is Connected: {isConnected.toString()}
      <hr/>
      <hr/>
      <hr/>

      Gary: {garyValue}
      <input type='range'
             value={garyValue}
             disabled={garyLocked}
             onChange={(e) => setGaryValue(parseInt(e.target.value))}
      />
    </div>
  );
}

export default App;
