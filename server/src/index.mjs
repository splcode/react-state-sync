// index.mjs (Library entry point)
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { AbstractDriver } from './AbstractDriver.mjs';
import { startServer } from './server.mjs';
import { error } from './errors.mjs';
import chalk from 'chalk';

export { AbstractDriver };

/**
 * @param {string} driversPath - The path to the drivers folder.
 * @returns {Promise<Record<string, Class<AbstractDriver>>>}
 */
async function loadDrivers({ driversPath, pluginsPath }) {
  console.log(chalk.blue('Validating drivers...'));

  // Validate both in-tree and plugin drivers
  const inTreeDrivers = await validateDrivers(driversPath);
  const pluginDrivers = await validateDrivers(pluginsPath);

  const drivers = {...inTreeDrivers, ...pluginDrivers};

  console.log(chalk.green('Drivers validated!\n'));
  return drivers;
}

async function validateDrivers(filePath) {
  const drivers = {};

  for (const filename of await fs.readdir(filePath)) {
    console.debug(filename);
    const module = await import(
      url.pathToFileURL(
        path.join(filePath, filename)
      )
    );

    if (!module.default) {
      throw error('MissingDefaultExport', filename);
    }
    if (!(module.default.prototype instanceof AbstractDriver)) {
      throw error('MissingDeviceExtend', filename);
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

  console.log(chalk.blue('Initializing devices...\n'));
  await Promise.all(Object.values(devices).map((device) => device.init()));
  console.log(chalk.green('\nDevices initialized!'));

  return devices;
}

/**
 * Main entry point to start the library.
 * @param {object} options
 * @param {string} options.driversPath - Path to the drivers directory.
 * @param {object} options.config - The config object for devices.
 */
export async function initializeAndStartServer(config) {
  const drivers = await loadDrivers(config);
  const devices = await initDevices(drivers, config.devices);

  process.on('SIGINT', async () => {
    console.log(chalk.red('\n~~~~~Shutting down!~~~~~'));
    for (const device of Object.values(devices)) {
      await device.shutdown();
    }
    console.log(chalk.red('\n~~~~~SHUTDOWN COMPLETE!~~~~~'));
    process.exit(0);
  });

  console.log(chalk.greenBright('\n~~~~~SETUP COMPLETE~~~~~'));

  // TODO: We want to generate UI state from config.yaml, but lets
  // use this temporarily just to get the connection established
  // to the podcart UI. Thinking it might look something like this once
  // parsed.
  const uiLayout = {
    video: [
      {
        type: 'group'
        , direction: 'horizontal'
        , components:
          [{ type: 'toggle' }
          ]
      }
    ]
  }
  await startServer(devices, uiLayout);
}
