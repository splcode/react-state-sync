import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import throttle from 'throttleit';
import debounce from 'debounce';
import chalk from 'chalk';
import { ClientEvents, DeviceEvents } from './enums.mjs';
import { error } from './errors.mjs';

const config = JSON.parse(
  await fs.readFile(path.join(import.meta.dirname, '..', 'config.json'))
);

/**
 * @typedef {Object} DriverConfig - Defaults in config.json, keep synced
 * @property {number} syncIntervalMs - The amount of time between getting the latest data from the device and syncing
 * it to each client
 * @property {number} setThrottleMs - The minimum amount of time between setting data from the clients to the device
 * @property {number} unlockMeterDebounceMs - The time to wait after a client has changed a value before letting other
 * clients try to change that same meter.
 */

/**
 * @typedef {Object} MeterRecord
 * @property {any} value
 * @property {string | undefined} locker
 */

export class AbstractDriver extends EventEmitter {
  /** @type {DriverConfig} - The driver config */
  #driverConfig;
  /** @type {Object} The device config */
  config;
  /** @type {any} - The setInterval ID for our sync fn */
  #syncInterval;
  /** @type {Record<string, MeterRecord>} - Locally keeps track of the latest value and the socketId of the locker */
  #meters = {};
  /** @type {Function} */
  #debounceUnlock

  /**
   * @param {string} name
   * @param {DriverConfig} driverConfig
   * @param {Object} deviceConfig
   */
  constructor(name, driverConfig, deviceConfig) {
    super();

    this.name = name;

    this.#driverConfig = {
      ...config.defaultDriverConfig,
      ...driverConfig
    };
    this.config = deviceConfig;

    // Convenience overrides so we can auto-log the name of the Device with the args
    this.log = {
      info: (...args) => console.log(chalk.whiteBright(this.name), ...args),
      warn: (...args) => console.warn(chalk.yellowBright(this.name), ...args),
      error: (...args) => console.error(chalk.redBright(this.name), ...args)
    };

    // Throttle sets to the device, so we don't spam it
    this._set = throttle(this._set, this.#driverConfig.setThrottleMs);
    // Debounce unlock so we keep it locked while meter is being actively moved
    this.#debounceUnlock = debounce((meter) => delete meter.locker, this.#driverConfig.unlockMeterDebounceMs)
  }

  /** Called by the server on client connect to sync initial state for all device meters */
  initSync() {
    const meters = {};
    for (const [meterName, rec] of Object.entries(this.#meters)) {
      meters[meterName] = rec.value;
    }
    return {
      config: {
        unlockMeterDebounceMs: this.#driverConfig.unlockMeterDebounceMs
      },
      meters
    };
  }

  /** Called by the server to _connect to the device and start the sync interval */
  async init() {
    if (this.#syncInterval) {
      return this.log.warn('ALREADY INITIALIZED');
    }

    this.log.info('Connecting');
    await this._connect();
    this.log.info('Connected');

    this.#syncInterval = setInterval(this.#sync.bind(this), this.#driverConfig.syncIntervalMs);
  }

  /** Called by the server on SIGINT to gracefully disconnect from the device*/
  async shutdown() {
    this.log.info('Shutting down');
    clearInterval(this.#syncInterval);
    try {
      await this._disconnect();
      this.log.info('Disconnected');
    } catch (err) {
      this.log.warn(`Problem disconnecting"`)
    }
  }

  /** Called by the AbstractDriver class every `syncIntervalMs` to fetch the latest data for each meter via `_get`. */
  async #sync() {
    const meters = Object.keys(this.#meters);
    const results = await Promise.allSettled(
      meters.map((meter) => this._get(meter))
    );
    const meterData = {};
    for (const [i, res] of results.entries()) {
      const meterName = meters[i];
      if (res.status === 'fulfilled') {
        meterData[meterName] = res.value;
        this.#meters[meterName].value = res.value;
      } else {
        this.log.warn(`Failed to retrieve ${meterName} data: ${res.reason}`)
      }
    }
    this.emit(ClientEvents.SYNC, meterData);
  }

  /**
   * Used by the server when connected clients attempt to change the value of a meter
   * @param {string} socketId
   * @param {string} meterName
   * @param {any} value
   */
  clientMeterUpdate(socketId, meterName, value) {
    const meter = this.#meters[meterName];
    if (!meter) {
      throw error('UnknownMeter', `${this.name}/${meterName}`);
    }
    if (!meter.locker) {
      // Take control
      meter.locker = socketId;
    } else if (meter.locker !== socketId) {
      throw error('LockedByAnotherClient');
    }

    this.#meters[meterName].value = value;
    this._set(meterName, value);
    this.#debounceUnlock(meter);

    return { success: true };
  }

  /**
   * Used on client disconnect to ensure we remove all locks by this user immediately
   * @param {string} socketId
   */
  unlockAllMeters(socketId) {
    for (const meter of Object.values(this.#meters)) {
      if (meter.locker === socketId) {
        delete meter.locker;
      }
    }
  }

  /**
   * Should be called when _connect is executing to register all meters that the device has
   * @param {string} meterName
   * @param {any} [defaultValue]
   * @return {void}
   */
  _registerMeter(meterName, defaultValue = 0) {
    this.#meters[meterName] = {
      value: defaultValue,
    };
  }

  /**
   * Called to manually update connected clients when new data is received by the device.
   * For use when you have a live socket connection and receive immediate updates from the device
   */
  _meterEcho(meterName, value) {
    this.emit(DeviceEvents.SYNC, {
      [meterName]: value
    });
  }

  /**
   * Handles connection to the device. Note: If exception is thrown during _connect, server will NOT start.
   * The error will be logged to the console
   * @abstract
   * @returns {Promise<void>}
   */
  async _connect() {
    throw error('UnimplementedMethod', '_connect');
  }

  /**
   * Handles "safe" disconnection from the device
   * @abstract
   * @returns {Promise<void>}
   */
  async _disconnect() {
    throw error('UnimplementedMethod', '_disconnect');
  }

  /**
   * Get latest data from device meter, used by syncIntervalMs
   * @abstract
   * @param {string} meterName
   * @returns {Promise<any>}
   */
  async _get(meterName) {
    throw error('UnimplementedMethod', '_get');
  }

  /**
   * Set latest data that clients have changed a specific meter to
   * @abstract
   * @param {string} meterName
   * @param {any} value
   * @returns {Promise<void>}
   */
  async _set(meterName, value) {
    throw error('UnimplementedMethod', '_set');
  }
}
