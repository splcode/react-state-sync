import { Server } from 'socket.io';
import { AbstractDriver } from './AbstractDriver.mjs';
import { ClientEvents, DeviceEvents } from './enums.mjs';
import { findDevice } from './utilities.mjs';
import { createLogger } from './logger.mjs';

const log = createLogger({ component: 'socket-server' });

/**
 * Start the Socket.IO server that exposes devices to connected clients.
 * @param {Record<string, AbstractDriver>} devices - Map of device name to driver instance
 * @param {Object} [serverConfig] - Optional server configuration
 * @param {(socket: import('socket.io').Socket, devices: Record<string, AbstractDriver>) => void} [serverConfig.socketOnConnectHook] - Called for each new client connection
 */
export function startServer(devices, serverConfig) {
  const io = new Server({
    cors: {
      origin: '*'
    }
  });

  // Set up sync listeners for all devices so we forward the sync data to each connected client
  for (const device of Object.values(devices)) {
    device.on(DeviceEvents.SYNC, (meters) => {
      // console.log('#sync', device.name);
      io.emit(ClientEvents.SYNC, {
        device: device.name,
        meters
      });
    });
  }

  // Handle new client connections
  io.on('connection', (socket) => {
    log.info('Connected', { socket_id: socket.id });

    // Sends the initial state to the newly connected client
    const initSync = async () => {
      log.info('init-sync', { socket_id: socket.id });
      const initData = {};
      for (const [deviceName, device] of Object.entries(devices)) {
        initData[deviceName] = device.initSync();
      }
      socket.emit(ClientEvents.INIT_SYNC, initData);
    };
    initSync();

    // Execute socketOnConnectHook whenever a new client connects
    if (serverConfig?.socketOnConnectHook) {
      serverConfig.socketOnConnectHook(socket, devices);
    }

    // Listen for meter value updates from clients. Update the device, and then echo to other connected clients
    socket.on(ClientEvents.METER_VALUE, (meter, value, callback) => {
      try {
        const { device, meterName } = findDevice(devices, meter);
        const result = device.clientMeterUpdate(socket.id, meterName, value);
        socket.broadcast.emit(ClientEvents.METER_VALUE_ECHO, meter, value);
        return callback(result);
      } catch (err) {
        return callback({ success: false, err });
      }
    });

    // On client disconnect, unlock all meters to ensure clean state
    socket.on('disconnect', () => {
      log.info('Disconnected', { socket_id: socket.id });
      for (const device of Object.values(devices)) {
        device.unlockAllMeters(socket.id);
      }
    });
  });

  // Start the server
  io.listen(process.env.NODE_PORT || 4000);
}
