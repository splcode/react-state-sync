import fs from 'node:fs';
import path from 'node:path';
import { AbstractDriver } from './AbstractDriver.mjs';
import { startServer } from './server.mjs';
import config from '../config.json' assert { type: 'json' };
import { error } from './errors.mjs';
import chalk from 'chalk';

/**
 * @returns {Promise<Record<string, Class<AbstractDriver>>>}
 */
async function validateDrivers() {
  console.log(chalk.blue('Validating drivers...'));
  const deviceFilenames = fs.readdirSync(config.driversPath);
  // Load the JS modules
  const importedModules = await Promise.all(
    deviceFilenames.map(async (filename) => {
      return {
        filename,
        module: await import(path.join('../', config.driversPath, filename).replaceAll('\\', '/'))
      };
    })
  );

  /** @type {Record<string, Class<AbstractDriver>>} */
  const drivers = {};

  // Validate exports and inheritance
  for (const { filename, module } of importedModules) {
    const clazz = module.default;

    if (!clazz) {
      throw error('MissingDefaultExport', filename);
    }
    if (!(clazz.prototype instanceof AbstractDriver)) {
      throw error('MissingDeviceExtend', filename);
    }

    if (clazz.name in drivers) {
      throw error('DuplicateDriverName', clazz.name);
    }

    drivers[clazz.name] = clazz;
  }

  console.log(chalk.green('Drivers validated!\n'));
  return drivers;
}

/**
 * @param {Record<string, Class<AbstractDriver>>} drivers
 * @return {Promise<Record<string, AbstractDriver>>}
 */
async function initDevices(drivers) {
  /** @type {Record<string, AbstractDriver>} */
  const devices = {};
  for (const [name, device] of Object.entries(config.devices)) {
    const { driver, driverConfig, config: deviceConfig } = device;
    const Driver = drivers[driver];
    if (!Driver) {
      throw error('MissingDriver', JSON.stringify(device));
    }
    devices[name] = new Driver(name, driverConfig, deviceConfig);
  }

  console.log(chalk.blue('Initializing devices...\n'));
  await Promise.all(
    Object.values(devices).map((device) => device.init())
  );
  console.log(chalk.green('\nDevices initialized!'));

  return devices;
}

async function startup() {
  const drivers = await validateDrivers();
  const devices = await initDevices(drivers);

  process.on('SIGINT', async () => {
    console.log(chalk.red('\n~~~~~Shutting down!~~~~~'));
    for (const device of Object.values(devices)) {
      await device.shutdown();
    }
    console.log(chalk.red('\n~~~~~SHUTDOWN COMPLETE!~~~~~'));
    process.exit(0);
  });

  console.log(chalk.greenBright('\n~~~~~SETUP COMPLETE~~~~~'));

  await startServer(devices);
}

await startup();
