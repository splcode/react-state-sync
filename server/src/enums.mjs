export const DeviceEvents = {
  // Used to sync device state to the connected clients.
  // Emitted every `syncIntervalMS` with all device meters or manually
  // for a single meter by calling `device._meterEcho`
  SYNC: 'sync'
};

export const ClientEvents = {
  // On client connection, forces existing state to client
  INIT_SYNC: 'init-sync',
  // New values directly from device
  SYNC: 'sync',
  // Value from client to server
  METER_VALUE: 'meter-value',
  // Value from server to other clients
  METER_VALUE_ECHO: 'meter-value-echo',
  // Generic client event
  GENERIC_CLIENT_EVENT: 'generic-client-event'
};
