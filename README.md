# Server
Most of what you need to do on the server side is to create device drivers in the [drivers folder](server/drivers) and create devices in the [config.json devices object](server/config.json) which use those drivers.
## Drivers/Devices
* A Driver (or device driver) is an implementor of the AbstractDriver class.
* A device represents an instantiated specified driver with a unique configuration which will let the server connect to the real world device
### AbstractDriver class
By extending this class, you are able to communicate with a variety of devices and by implementing the abstract methods, the server will be able to interact with all of them in a consistent way.
### Creating Device Drivers
Create new drivers by adding new files to the drivers folder. See the [MockDevice class](server/drivers/MockDevice.mjs) for an example driver implementation
### Adding devices
Add devices via the devices object in config.json

## config.json
* `driversPath` - The path to the drivers folder
* `defaultDriverConfig` - Driver defaults which can be overriden by each device
* `devices` - List of devices to create and manage on the server 

## index.mjs
* Reads and validates all Device classes in the drivers folder (config `driversPath`)
* Initializes/connects to all devices defined in the config

## server.mjs
* Listens for socket.io websocket connections
* When a client connects, it will send the initial state of all devices/configs/meters for `useConnectedState` hooks to locally listen to


# Client
See [App.tsx](./client/src/App.tsx) for example usage of the hooks below

## socket.ts
* Contains the `ConnectedMeterSocket` class which maintains a single socket connection to the server. See function docs for details

## useConnectedState
* Hook which takes in a meter (`deviceName/meterName`) to subscribe to
* Returns `[value: number, isLocked: boolean, setValue: Fn]`

## useIsConnected
* Hook which returns `isConnected: boolean` and will keep in sync with whether the client is connected or not