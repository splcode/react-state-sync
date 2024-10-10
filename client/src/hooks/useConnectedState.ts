import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, InitConfig } from '../socket';
import debounce, { DebouncedFunction } from 'debounce';

export function useConnectedState(meter: string): [any, boolean, (v: any) => void] {
  const [initConfig, setInitConfig] = useState<InitConfig | null>(null);
  const [value, setValue] = useState<any>(0);
  const [locked, setLocked] = useState<boolean>(false);
  const debounceUnlockRef = useRef<DebouncedFunction<any> | null>(null);

  // Debouncing in other ways never seemed to work consistently. This works well
  useEffect(() => {
      debounceUnlockRef.current = debounce(
        () => setLocked(false),
        initConfig?.unlockMeterDebounceMs
      );
      return () => {
        debounceUnlockRef.current?.flush();
      };
    },
    [initConfig]
  );

  // We use function equality to manage removing listeners in socket.off, so this needs to remain independent and stable
  const onMeterChange = useCallback((value: any, skipLock: boolean) => {
    !skipLock && setLocked(true);
    setValue(value);
    !skipLock && debounceUnlockRef.current?.();
  }, []);

  // Runs on hook creation to initialize meter and config subscriptions
  useEffect(() => {
    const socket = getSocket();
    socket.on(meter, onMeterChange, setInitConfig);
    return () => {
      socket.off(meter, onMeterChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter]);

  const clientMeterUpdate = (value: any) => {
    setValue(value);
    getSocket().clientMeterUpdate(meter, value);
  };

  return [value, locked, clientMeterUpdate];
}