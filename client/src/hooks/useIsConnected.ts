import { useEffect, useState } from 'react';
import { getSocket } from '../socket';

export function useIsConnected() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socket.onConnectionChange(setIsConnected);
    return () => {
      socket.offConnectionChange(setIsConnected);
    };
  }, [setIsConnected]);

  return isConnected;
}