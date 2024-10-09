import { error } from './errors.mjs';

// TODO should probably have a DeviceManager that this is a method on
/**
 * @param {Record<string, AbstractDriver>} devices
 * @param {string} meter
 * @return {{ device: AbstractDriver, meterName: string }}
 */
export function findDevice(devices, meter) {
  const [deviceName, meterName] = meter.split('/');
  const device = devices[deviceName];
  if (!device) {
    throw error('UnknownDevice', deviceName);
  }

  return {
    device,
    meterName
  };
}
