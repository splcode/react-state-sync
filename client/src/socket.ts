import { io, Socket } from 'socket.io-client';
import { Dispatch } from 'react';

const ENABLE_DEBUG_LOGS = false;

interface CallbackSuccess extends Record<string, any> {
  success: true
}

interface CallbackError {
  success: false,
  err: Error
}

type CallbackResponse = CallbackSuccess | CallbackError;

export interface InitConfig {
  unlockMeterDebounceMs: number
}

type MeterSubscription = (value: any, skipLock: boolean) => void;

interface MeterRecord {
  config?: InitConfig,
  value?: any
  meterListeners: MeterSubscription[],
  configListeners: Dispatch<InitConfig>[]
}

interface Sync {
  device: string,
  meters: Record<string, number>
}

interface InitSync {
  [deviceName: string]: {
    config: InitConfig,
    meters: {
      [meterName: string]: number
    }
  }
}

class ConnectedMeterSocket {
  #debug = ENABLE_DEBUG_LOGS ? console.debug : () => undefined;
  #socket: Socket;
  #connectedListeners: Dispatch<boolean>[] = [];
  #meters: Record<string, MeterRecord> = {};

  constructor(url: string) {
    this.#socket = io(url);

    // Setup subscriptions for socket events
    this.#socket.on('sync', this.#sync.bind(this));
    this.#socket.on('meter-value-echo', this.#meterUpdateAndNotify.bind(this, false));
    this.#socket.on('connect', () => {
      this.#debug('connect');
      this.#notify(this.#connectedListeners, true);
    });
    this.#socket.on('disconnect', () => {
      this.#debug('disconnect');
      this.#notify(this.#connectedListeners, false);
    });
    this.#socket.on('init-sync', this.#initSync.bind(this));
  }

  // Initial sync on socket connection sent from the server to let us know all device/meter states and configs
  #initSync(devices: InitSync) {
    this.#debug('init-sync', devices);
    for (const [device, { meters, config }] of Object.entries(devices)) {
      for (const [meterName, value] of Object.entries(meters)) {
        const meter = `${device}/${meterName}`;
        if (!this.#meters[meter]) {
          this.#meters[meter] = { config, value, meterListeners: [], configListeners: [] };
        } else {
          this.#meters[meter].config = config;
          this.#notify(this.#meters[meter].configListeners, config);
          this.#meterUpdateAndNotify(true, meter, value);
        }
      }
    }
  }

  // Called by the sync event to notify all listeners that we have a sync update from the server
  #sync({ device, meters }: Sync) {
    this.#debug('#sync', device, meters);
    for (const [meterName, value] of Object.entries(meters)) {
      this.#meterUpdateAndNotify(true, `${device}/${meterName}`, value);
    }
  }

  // useIsConnected listener
  onConnectionChange(fn: Dispatch<boolean>) {
    this.#connectedListeners.push(fn);
  }

  // useIsConnected listener destroy
  offConnectionChange(fn: Dispatch<boolean>) {
    const index = this.#connectedListeners.indexOf(fn);
    this.#connectedListeners.splice(index, 1);
  }

  // Subscription for meter and config updates on a specific meter. Ex- `deviceName/meterName`
  async on(meter: string, onMeterChange: MeterSubscription, onInitConfig: Dispatch<InitConfig>): Promise<void> {
    this.#debug('on', meter, this.#meters[meter]);

    if (!this.#meters[meter]) {
      this.#meters[meter] = { meterListeners: [], configListeners: [] };
    }

    this.#meters[meter].configListeners.push(onInitConfig);
    if (this.#meters[meter].config) {
      onInitConfig(this.#meters[meter].config!);
    }

    this.#meters[meter].meterListeners.push(onMeterChange);
    if (this.#meters[meter].value !== undefined) {
      onMeterChange(this.#meters[meter].value!, true);
    }
  }

  // Destroy meter listener
  off(meter: string, callbackFn: MeterSubscription) {
    this.#debug('off', meter, this.#meters[meter]);
    if (this.#meters[meter]) {
      const index = this.#meters[meter].meterListeners.indexOf(callbackFn);
      this.#meters[meter].meterListeners.splice(index, 1);
      this.#meters[meter].configListeners.splice(index, 1);
    }
  }

  // The client is updating a meter, we need to send it to the server.
  // If we have an issue, we will notify the client with an error log and by setting the value back to the cached value
  clientMeterUpdate(meter: string, value: any) {
    this.#debug('clientMeterUpdate', meter, value);
    this.#socket.emit('meter-value', meter, value, (result: CallbackResponse) => {
      if (!result.success) {
        console.error('Problem sending meter update to server', result.err);
        if (this.#meters[meter]?.value !== undefined) {
          this.#meterUpdateAndNotify(false, meter, this.#meters[meter].value!);
        }
      }
    });
  }

  // Helper to change the value of a meter and notify all listeners. Called by various functions including
  // directly by the meter-value-echo event which contains data from other clients.
  #meterUpdateAndNotify(skipLock: boolean, meter: string, value: any) {
    this.#debug('#meterUpdateAndNotify', skipLock, meter, value);
    if (!this.#meters[meter]) {
      return console.warn(`Cannot notify! UnknownMeter! "${meter}"`);
    }
    this.#meters[meter].value = value;
    this.#notify(this.#meters[meter].meterListeners, value, skipLock);
  }

  // Helper to notify all listeners in the array of the provided args
  #notify<T extends any[]>(listeners: ((...args: T) => void)[], ...args: T) {
    for (const listener of listeners) {
      listener(...args);
    }
  }

  // Send a generic client event
  async sendGenericClientEvent(eventData?: unknown) {
    return await new Promise<any>((resolve) => {
      this.#socket.emit('generic-client-event', eventData, (resp : any) => resolve(resp))
    });
  }
}

let connectedMeterSocket: ConnectedMeterSocket | null = null;

export function initializeSocket(url: string) {
  if (!connectedMeterSocket) {
    connectedMeterSocket = new ConnectedMeterSocket(url);
  }
}

export function getSocket() {
  if (!connectedMeterSocket) {
    throw new Error('Socket has not been initialized. Call initializeSocket(url) first.');
  }
  return connectedMeterSocket;
}
