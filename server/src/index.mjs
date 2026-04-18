// index.mjs (Library entry point)
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { AbstractDriver } from './AbstractDriver.mjs';
import { startServer } from './server.mjs';
import { error } from './errors.mjs';
import { createLogger } from './logger.mjs';

export { AbstractDriver };
export { createLogger } from './logger.mjs';

const log = createLogger({ component: 'state-server' });

/**
 * @param {string} driversPath - The path to the drivers folder.
 * @param {string} pluginsPath - The path to the plugins folder.
 * @returns {Promise<Record<string, Class<AbstractDriver>>>}
 */
async function loadDrivers({ driversPath, pluginsPath }) {
  log.info('Validating drivers');

  // Validate both in-tree and plugin drivers
  const inTreeDrivers = await validateDrivers(driversPath);
  const pluginDrivers = await validateDrivers(pluginsPath);

  const drivers = { ...inTreeDrivers, ...pluginDrivers };

  log.info('Drivers validated');
  return drivers;
}

/**
 * @param {string} driverPath - The path to the drivers or plugins folder.
 * @returns {Promise<Record<string, Class<AbstractDriver>>>}
 */
async function validateDrivers(driverPath) {
  const drivers = {};

  const dir = await fs.opendir(driverPath).catch(e => {
    log.warn('Failed to load drivers', e);
    return [];
  });

  for await (const entry of dir) {
    if (entry.name.startsWith('.')) continue;
    log.debug('Loading driver', { name: entry.name });

    const module = await import(
      url.pathToFileURL(
        path.join(
          entry.parentPath,
          entry.name,
          entry.isDirectory() ? 'index.js' : ''
        )
      )
    );

    if (!module.default) {
      throw error('MissingDefaultExport', filename);
    }
    if (module.default.name in drivers) {
      throw error('DuplicateDriverName', module.default.name);
    }

    drivers[module.default.name] = module.default;
  }

  return drivers;
}

/**
 * @param {Record<string, Class<AbstractDriver>>} drivers
 * @param {Record<string, any>} devicesConfig
 * @return {Promise<Record<string, AbstractDriver>>}
 */
async function initDevices(drivers, devicesConfig) {
  const devices = {};
  for (const [name, device] of Object.entries(devicesConfig)) {
    const { driver, driverConfig, config: deviceConfig } = device;
    const Driver = drivers[driver];
    if (!Driver) {
      throw error('MissingDriver', JSON.stringify(device));
    }
    devices[name] = new Driver(name, driverConfig, deviceConfig);
  }

  log.info('Initializing devices');
  await Promise.all(Object.values(devices).map((device) => device.init()));
  log.info('Devices initialized');

  return devices;
}

/**
 * Main entry point to start the library.
 * @param {Object} devicesConfig - Configuration for all devices
 * @param {string} devicesConfig.driversPath - Filesystem path to in-tree drivers
 * @param {string} devicesConfig.pluginsPath - Filesystem path to plugin drivers
 * @param {Record<string, {driver: string, driverConfig: Object, config: Object}>} devicesConfig.devices - Device definitions keyed by name
 * @param {Object} [serverConfig] - Optional server configuration (see startServer)
 */
export async function initializeAndStartServer(devicesConfig, serverConfig) {
  const drivers = await loadDrivers(devicesConfig);
  const devices = await initDevices(drivers, devicesConfig.devices);

  process.on('SIGINT', async () => {
    log.info('Shutting down');
    for (const device of Object.values(devices)) {
      await device.shutdown();
    }
    log.info('Shutdown complete');
    process.exit(0);
  });

  log.info('Setup complete');

  await startServer(devices, serverConfig);
}
