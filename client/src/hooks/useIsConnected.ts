import { useEffect, useState } from 'react';
import socket from '../socket';

export function useIsConnected() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socket.onConnectionChange(setIsConnected);
    return () => {
      socket.offConnectionChange(setIsConnected);
    };
  }, [setIsConnected]);

  return isConnected;
}