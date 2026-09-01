'use strict';

module.exports = {
  async getChargerState({ homey, query }) {

    const selectedDeviceId = query.deviceId;
    
    // List all driver types
    const driverTypes = query.driverType ? [query.driverType] : ['bluelink', 'uvo'];
    let selectedDevice = null;
    let selectedDriverId = null;

    // Search through all driver types
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          selectedDriverId = driverType;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      const range = selectedDevice.getCapabilityValue('meter_range');
      const battery = selectedDevice.getCapabilityValue('measure_battery.EV');
      const unlocked = selectedDevice.getCapabilityValue('closed_locked');
      const climate = selectedDevice.getCapabilityValue('climate_control');
      const chargingMode = parseInt(selectedDevice.getCapabilityValue('charger')) || 0;

      return {
        status: 'ok',
        driverType: selectedDriverId,
        range: range,
        battery: battery,
        locked: !unlocked,
        climate: climate,
        chargingMode: chargingMode
      };
    } else {
      // console.log('Device not found in any driver');
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  },

  async setClimate({ homey, query, body }) {
    const selectedDeviceId = query.deviceId;
    const climateState = body.turnOn;

    // console.log('setClimate called:', { deviceId: selectedDeviceId, turnOn: climateState });
    
    // List all driver types
    const driverTypes = query.driverType ? [query.driverType] : ['bluelink', 'uvo'];
    let selectedDevice = null;
    let selectedDriverId = null;

    // Search through all driver types
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          selectedDriverId = driverType;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      try {
        await selectedDevice.setCapabilityValue('climate_control', climateState);
        await selectedDevice.triggerCapabilityListener('climate_control', climateState);
        
        return {
          status: 'ok',
          message: 'Climate control updated successfully',
          climateState: climateState
        };
      } catch (error) {
        console.error('Error setting climate control:', error);
        return {
          status: 'error',
          message: 'Failed to set climate control: ' + error.message
        };
      }
    } else {
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  },

  
  async setClosedLocked({ homey, query, body }) {
    const selectedDeviceId = query.deviceId;
    const lockState = body.lock;

    console.log('setClosedLocked called:', { deviceId: selectedDeviceId, locked: lockState });
    
    // List all driver types
    const driverTypes = query.driverType ? [query.driverType] : ['bluelink', 'uvo'];
    let selectedDevice = null;
    let selectedDriverId = null;

    // Search through all driver types
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          selectedDriverId = driverType;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      try {
        await selectedDevice.setCapabilityValue('closed_locked', lockState);
        await selectedDevice.triggerCapabilityListener('locked', lockState);
        
        return {
          status: 'ok',
          message: 'Closed/locked updated successfully',
          unlockState: lockState
        };
      } catch (error) {
        console.error('Error setting closed/locked:', error);
        return {
          status: 'error',
          message: 'Failed to set closed/locked: ' + error.message
        };
      }
    } else {
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  },

  async setChargingMode({ homey, query, body }) {
    const selectedDeviceId = query.deviceId;
    const chargingMode = body.startCharging;

    // console.log('setChargingMode called:', { deviceId: selectedDeviceId, startCharging: chargingMode });

    // List all driver types
    const driverTypes = query.driverType ? [query.driverType] : ['bluelink', 'uvo'];
    let selectedDevice = null;
    let selectedDriverId = null;

    // Search through all driver types
    for (const driverType of driverTypes) {
      try { 
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          selectedDriverId = driverType;
          break;  
        }
      } catch (error) {
        continue;
      }
    }

    if (selectedDevice) {
      try {
        await selectedDevice.setCapabilityValue('charging', chargingMode);
        await selectedDevice.triggerCapabilityListener('charging', chargingMode);
      } catch (error) {
        console.error('Error setting charging mode:', error);
        return {
          status: 'error',
          message: 'Failed to set charging mode: ' + error.message
        };
      }
    } else {  
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  }

}