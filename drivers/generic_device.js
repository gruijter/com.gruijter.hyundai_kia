/*
Copyright 2020, Robin de Gruijter (gruijter@hotmail.com)

This file is part of com.gruijter.hyundai_kia.

com.gruijter.hyundai_kia is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.hyundai_kia is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with com.gruijter.hyundai_kia. If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');
const BlueLinky = require('bluelink');
const Uvo = require('kuvork');
const GeoPoint = require('geopoint');
const util = require('util');
const geo = require('../reverseGeo');

const setTimeoutPromise = util.promisify(setTimeout);

class CarDevice extends Homey.Device {

	// this method is called when the Device is inited
	async onInitDevice() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this.settings = await this.getSettings();
			this.vehicle = null;
			this.busy = false;
			this.watchDogCounter = 5;

			const options = {
				username: this.settings.username,
				password: this.settings.password,
				region: this.settings.region,
				pin: this.settings.pin,
				vin: this.settings.vin,
				deviceUuid: 'homey',
			};
			if (this.ds.deviceId === 'bluelink') {
				this.client = new BlueLinky(options);
			} else this.client = new Uvo(options);

			this.client.on('ready', async (vehicles) => { [this.vehicle] = vehicles; });

			// init listeners
			if (!this.allListeners) this.registerListeners();

			// wait 10 seconds to login
			await setTimeoutPromise(10 * 1000, 'waiting is done');

			this.log(`starting to poll ${this.getName()}`);
			const Interval = this.getCapabilityValue('ignition') ? this.settings.pollInterval2 : this.settings.pollInterval;
			this.startPolling(Interval);

		} catch (error) {
			this.error(error);
		}
	}

	async doPoll() {
		try {
			if (this.watchDogCounter <= 0) {
				// restart the app here
				this.log('watchdog triggered, restarting app now');
				this.restartDevice();
				return;
			}
			if (!this.vehicle) throw Error('not logged in');
			if (this.busy) {
				console.log('still busy...');
				this.watchDogCounter -= 1;
				return;
			}
			this.busy = true;
			// get info from car
			const status = await this.vehicle.status({
				refresh: true,
				parsed: true,
			});

			console.log(status);
			const location = await this.vehicle.location();
			console.log(location);
			const odometer = await this.vehicle.odometer();
			console.log(odometer);

			this.handleInfo({ status, location, odometer });

			this.watchDogCounter = 5;
			this.busy = false;
		} catch (error) {
			this.watchDogCounter -= 1;
			this.busy = false;
			this.error('Poll error', error.body || error);
		}
	}

	startPolling(interval) {
		console.log(`start polling @ ${interval} minutes`);
		this.stopPolling();
		this.doPoll();
		this.intervalIdDevicePoll = setInterval(() => {
			this.doPoll();
		}, 1000 * 60 * interval);
	}

	stopPolling() {
		clearInterval(this.intervalIdDevicePoll);
	}

	restartDevice(delay) {
		// this.destroyListeners();
		this.stopPolling();
		setTimeout(() => {
			this.onInitDevice();
		}, delay || 1000 * 60 * 5);	// wait 5 minutes to reset possible auth failure
	}

	// this method is called when the Device is added
	async onAdded() {
		this.log(`Car added as device: ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		this.stopPolling();
		// this.destroyListeners();
		this.log(`Car deleted as device: ${this.getName()}`);
	}

	onRenamed(name) {
		this.log(`Meter renamed to: ${name}`);
	}

	// this method is called when the user has changed the device's settings in Homey.
	async onSettings(oldSettingsObj, newSettingsObj) { // , changedKeysArr) {
		this.log('settings change requested by user');
		this.log(newSettingsObj);
		// this.log(newSettingsObj);
		this.log(`${this.getName()} device settings changed`);


		this.restartDevice(1000);
		// do callback to confirm settings change
		return Promise.resolve(true);
	}

	// async destroyListeners() {
	// 	this.log('Destroying listeners');
	// 	if (this.capabilityInstances) {
	// 		Object.entries(this.capabilityInstances).forEach((entry) => {
	// 			// console.log(`destroying listener ${entry[0]}`);
	// 			entry[1].destroy();
	// 		});
	// 	}
	// 	this.capabilityInstances = {};
	// }

	setCapability(capability, value) {
		if (this.hasCapability(capability)) {
			this.setCapabilityValue(capability, value)
				.catch((error) => {
					this.log(error, capability, value);
				});
		}
	}

	distance(location) {
		const lat1 = location.latitude;
		const lon1 = location.longitude;
		const lat2 = this.settings.lat;
		const lon2 = this.settings.lon;
		const from = new GeoPoint(Number(lat1), Number(lon1));
		const to = new GeoPoint(Number(lat2), Number(lon2));
		return Math.round(from.distanceTo(to, true) * 10) / 10;
	}

	async handleInfo(info) {
		try {
			const {
				ignition,
				charging,
				range,
				batteryCharge,
				EVBatteryCharge,
			} = info.status.engine;
			const { locked } = info.status.chassis;
			const { temperatureSetpoint, defrost, active } = info.status.climate;
			const { speed } = info.location;
			const { odometer } = info;

			const alarmEVBattery = EVBatteryCharge <= this.settings.EVbatteryAlarmLevel;
			const alarmBattery = batteryCharge <= this.settings.batteryAlarmLevel;
			const distance = this.distance(info.location);
			const locString = await geo.getCarLocString(info.location); // reverse ReverseGeocoding

			// detect changes
			const ignitionChange = ignition !== this.getCapabilityValue('ignition');
			const chargingChange = charging !== this.getCapabilityValue('charging');
			const climateControlChange = active !== this.getCapabilityValue('climate_control');
			const defrostChange = defrost !== this.getCapabilityValue('defrost');

			// update capabilities
			this.setCapability('measure_battery.EV', EVBatteryCharge);
			this.setCapability('measure_battery.12V', batteryCharge);
			this.setCapability('alarm_battery', alarmBattery || alarmEVBattery);
			this.setCapability('locked', locked);
			this.setCapability('target_temperature', temperatureSetpoint);
			this.setCapability('defrost', defrost);
			this.setCapability('climate_control', active);
			this.setCapability('ignition', ignition);
			this.setCapability('charging', charging);
			this.setCapability('odometer', odometer.value);
			this.setCapability('range', range);
			this.setCapability('speed', speed.value);
			this.setCapability('location', locString);
			this.setCapability('distance', distance);

			// update flow triggers
			const tokens = {};
			if (ignitionChange) {
				if (ignition) {
					this.homey.flow.getDeviceTriggerCard('ignition_true')
						.trigger(this, tokens)
						.catch(this.error);
				} else {
					this.homey.flow.getDeviceTriggerCard('ignition_false')
						.trigger(this, tokens)
						.catch(this.error);
				}
			}
			if (chargingChange) {
				if (charging) {
					this.homey.flow.getDeviceTriggerCard('charging_true')
						.trigger(this, tokens)
						.catch(this.error);
				} else {
					this.homey.flow.getDeviceTriggerCard('charging_false')
						.trigger(this, tokens)
						.catch(this.error);
				}
			}
			if (climateControlChange) {
				if (active) {
					this.homey.flow.getDeviceTriggerCard('climate_control_true')
						.trigger(this, tokens)
						.catch(this.error);
				} else {
					this.homey.flow.getDeviceTriggerCard('climate_control_false')
						.trigger(this, tokens)
						.catch(this.error);
				}
			}
			if (defrostChange) {
				if (defrost) {
					this.homey.flow.getDeviceTriggerCard('defrost_true')
						.trigger(this, tokens)
						.catch(this.error);
				} else {
					this.homey.flow.getDeviceTriggerCard('defrost_false')
						.trigger(this, tokens)
						.catch(this.error);
				}
			}

			// determine new poll interval
			if (ignitionChange) {
				const newInterval = info.status.engine.ignition ? this.settings.pollInterval2 : this.settings.pollInterval;
				this.stopPolling();
				await setTimeoutPromise(newInterval * 60 * 1000, 'waiting is done');
				this.startPolling(newInterval);
			}
		} catch (error) {
			this.error(error);
		}
	}

	// register capability listeners
	async registerListeners() {
		try {
			this.log('registering capability listeners');
			if (!this.allListeners) this.allListeners = {};

			// // unregister listeners first
			// const ready = Object.keys(this.allListeners).map((token) => Promise.resolve(Homey.ManagerFlow.unregisterToken(this.tokens[token])));
			// await Promise.all(ready);

			this.registerCapabilityListener('locked', async (locked) => {
				let success;
				if (locked) {
					this.log('locking doors via app');
					success = await this.vehicle.lock();
				} else {
					this.log('unlocking doors via app');
					success = await this.vehicle.unlock();
				}
				return Promise.resolve(success);
			});

			this.registerCapabilityListener('defrost', async (defrost) => {
				let success;
				if (defrost) {
					this.log('defrost start via app');
					success = await this.vehicle.start({
						defrost: true,
						windscreenHeating: true,
						temperature: this.getCapabilityValue('target_temperature') || 22,
					});
				} else {
					this.log('defrost stop via app');
					success = await this.vehicle.stop({
						defrost: false,
						windscreenHeating: false,
						temperature: this.getCapabilityValue('target_temperature') || 22,
					});
				}
				return Promise.resolve(success);
			});

			this.registerCapabilityListener('climate_control', async (acOn) => {
				let success;
				if (acOn) {
					this.log('A/C on via app');
					success = await this.vehicle.start({
						// defrost: this.getCapabilityValue('defrost'),
						// windscreenHeating: true,
						temperature: this.getCapabilityValue('target_temperature') || 22,
					});
				} else {
					this.log('A/C off via app');
					success = await this.vehicle.stop({
						// defrost: this.getCapabilityValue('defrost'),
						// windscreenHeating: true,
						temperature: this.getCapabilityValue('target_temperature') || 22,
					});
				}
				return Promise.resolve(success);
			});

			this.registerCapabilityListener('target_temperature', async (temp) => {
				this.log(`Changing temperarture by app to ${temp}`);
				let success;
				if (this.getCapabilityValue('climate_control')) {
					success = await this.vehicle.start({
						// defrost: this.getCapabilityValue('defrost'),
						// windscreenHeating: true,
						temperature: temp || 22,
					});
				} else {
					success = await this.vehicle.stop({
						// defrost: this.getCapabilityValue('defrost'),
						// windscreenHeating: true,
						temperature: temp || 22,
					});
				}
				return Promise.resolve(success);
			});

			return Promise.resolve(this.listeners);
		} catch (error) {
			return Promise.resolve(error);
		}
	}

}

module.exports = CarDevice;

/*

vehicle.update():
{
  airCtrlOn: false,
  engine: false,
  doorLock: true,
  doorOpen: { frontLeft: 0, frontRight: 0, backLeft: 0, backRight: 0 },
  trunkOpen: false,
  airTemp: { value: '10H', unit: 0, hvacTempType: 0 },
  defrost: false,
  acc: false,
  evStatus: {
    batteryCharge: false,
    batteryStatus: 79,
    batteryPlugin: 0,
    remainTime2: { etc1: [Object], etc2: [Object], etc3: [Object], atc: [Object] },
    drvDistance: [ [Object] ],
    reservChargeInfos: {
      reservChargeInfo: [Object],
      offpeakPowerInfo: [Object],
      reserveChargeInfo2: [Object],
      reservFlag: 0,
      ect: [Object],
      targetSOClist: [Array]
    }
  },
  ign3: true,
  hoodOpen: false,
  transCond: true,
  steerWheelHeat: 0,
  sideBackWindowHeat: 0,
  tirePressureLamp: {
    tirePressureLampAll: 0,
    tirePressureLampFL: 0,
    tirePressureLampFR: 0,
    tirePressureLampRL: 0,
    tirePressureLampRR: 0
  },
  battery: { batSoc: 90, batState: 0 },
  time: '20200719212255'
}

{
  chassis: {
    hoodOpen: false,
    trunkOpen: false,
    locked: true,
    doors: {
      frontRight: false,
      frontLeft: false,
      backLeft: false,
      backRight: false
    },
    tirePressureWarningLamp: {
      rearLeft: false,
      frontLeft: false,
      frontRight: false,
      rearRight: false,
      all: false
    }
  },
  climate: {
    active: false,
    steeringwheelHeat: false,
    sideMirrorHeat: false,
    rearWindowHeat: false,
    defrost: false,
    temperatureSetpoint: 20,
    temperatureUnit: 0
  },
  engine: {
    ignition: false,
    adaptiveCruiseControl: false,
    range: 400,
    charging: false,
    EVbatteryCharge: 87,
    batteryCharge: 83
  }
}

{
  latitude: 52.068369,
  longitude: 5.104333,
  altitude: 0,
  speed: { unit: 0, value: 0 },
  heading: 234
}

{ value: 171, unit: 1 }

*/
