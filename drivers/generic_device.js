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
const Bluelink = require('bluelinky');
const Uvo = require('kuvork');
const GeoPoint = require('geopoint');
const util = require('util');
const ABRP = require('../abrp_telemetry');
const geo = require('../reverseGeo');
const convert = require('./temp_convert');

const setTimeoutPromise = util.promisify(setTimeout);

const isClosedLocked = (status) => {
	const {
		doorLock,
		trunkOpen,
		hoodOpen,
		doorOpen,
	} = status;
	return doorLock && !trunkOpen && !hoodOpen && Object.keys(doorOpen).reduce((closedAccu, door) => closedAccu || !doorOpen[door], true);
};

class CarDevice extends Homey.Device {

	// this method is called when the Device is inited
	async onInitDevice() {
		// this.log('device init: ', this.getName(), 'id:', this.getData().id);
		try {
			// init some stuff
			this.settings = await this.getSettings();
			this.vehicle = null;
			this.busy = false;
			this.watchDogCounter = 6;
			this.lastSleepModeCheck = Date.now();

			// queue properties
			this.queue = [];
			this.head = 0;
			this.tail = 0;
			this.queueRunning = false;

			// setup UVO/Bluelink client
			const options = {
				username: this.settings.username,
				password: this.settings.password,
				region: this.settings.region,
				pin: this.settings.pin,
				deviceUuid: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), // 'homey',
				autoLogin: false,
			};
			if (this.ds.deviceId === 'bluelink') {
				this.client = new Bluelink(options);
			} else this.client = new Uvo(options);

			this.client.on('ready', async (vehicles) => {
				[this.vehicle] = vehicles.filter((veh) => veh.vehicleConfig.vin === this.settings.vin);
				// util.inspect(this.vehicle.vehicleConfig, true, 10, true));
			});
			// wait for client login
			await this.client.login();
			if (this.vehicle) this.log(JSON.stringify(this.vehicle.vehicleConfig));

			// setup ABRP client
			this.abrpEnabled = this.settings && this.settings.abrp_user_token && this.settings.abrp_user_token.length > 5;
			this.log(`ABRP enabled: ${!!this.abrpEnabled}`);
			if (this.abrpEnabled) {
				const abrpOptions = {
					apiKey: Homey.env.ABRP_API_KEY,
					userToken: this.settings.abrp_user_token,
				};
				this.abrp = new ABRP(abrpOptions);
			}

			// init listeners
			if (!this.allListeners) this.registerListeners();

			// start polling
			this.startPolling(this.settings.pollInterval);

		} catch (error) {
			this.error(error);
		}
	}

	// stuff for queue handling here
	async enQueue(item) {
		if (this.tail >= 10) {
			this.error('queue overflow');
			return;
		}
		this.queue[this.tail] = item;
		this.tail += 1;
		if (!this.queueRunning) {
			await this.client.login();
			this.queueRunning = true;
			this.runQueue();
		}
	}

	deQueue() {
		const size = this.tail - this.head;
		if (size <= 0) return undefined;
		const item = this.queue[this.head];
		delete this.queue[this.head];
		this.head += 1;
		// Reset the counter
		if (this.head === this.tail) {
			this.head = 0;
			this.tail = 0;
		}
		return item;
	}

	flushQueue() {
		this.queue = [];
		this.head = 0;
		this.tail = 0;
		this.queueRunning = false;
		this.log('Queue is flushed');
	}

	async runQueue() {
		try {
			this.busy = true;
			this.queueRunning = true;
			const item = this.deQueue();
			if (item) {
				if (!this.vehicle || !this.vehicle.vehicleConfig) {
					throw Error('pausing queue; not logged in');
				}
				const itemWait = {
					doPoll: 1,
					start: 65,
					stop: 5,
					lock: 5,
					unlock: 5,
				};
				// console.log(item.command);
				this.lastCommand = item.command;
				let methodClass = this.vehicle;
				if (item.command === 'doPoll') {
					methodClass = this;
				}
				await methodClass[item.command](item.args)
					.then(() => {
						this.watchDogCounter = 6;
						this.setAvailable();
					})
					.catch(async (error) => {
						this.watchDogCounter -= 1;
						if (this.watchDogCounter <= 0) {
							// restart the app here
							this.log('watchdog triggered, restarting device now');
							this.flushQueue();
							this.restartDevice();
						}
						const msg = error.body || error.message || error;
						this.error(`${item} failed`, msg);
						// retry once on duplicate request
						// if (msg.resMsg && msg.resMsg.includes('Duplicate request')) {
						// 	await setTimeoutPromise(5 * 1000, 'waiting is done');
						// 	await methodClass[item.command](item.args)
						// 		.then(() => {
						// 			this.log('retry succesfull');
						// 			this.watchDogCounter = 6;
						// 			this.setAvailable();
						// 		})
						// 		.catch(() => this.error('retry failed'));
						// }
						this.busy = false;
					});
				await setTimeoutPromise((itemWait[item.command] || 5) * 1000, 'waiting is done');
				this.runQueue();
			} else {
				// console.log('Finshed queue');
				this.queueRunning = false;
				this.busy = false;
				if (this.lastCommand !== 'doPoll') {
					this.carLastActive = Date.now();
					this.enQueue({ command: 'doPoll', args: true });
				}
			}
		} catch (error) {
			this.queueRunning = false;
			this.busy = false;
			this.error(error.message);
		}
	}

	// poll server and/or car for status
	async doPoll(forceOnce) {
		// console.log(forceOnce);
		try {
			let status = this.lastStatus;
			let location = this.lastLocation;
			let odometer = this.lastOdometer;
			let moving = false;

			const forceRefresh = forceOnce || !status || !location || !odometer;
			if (forceRefresh) this.log('forcing refresh with car');

			const batSoc = this.getCapabilityValue('measure_battery.12V');
			const forcePollLocation = this.settings.pollIntervalForced
				&& (this.settings.pollIntervalForced * 60 * 1000) < (Date.now() - this.lastRefresh)
				&& !forceRefresh && !this.liveData && !!this.lastLocation
				&& batSoc > this.settings.batteryAlarmLevel
				&& (Date.now() - this.carLastActive || this.lastRefresh) > 1000 * 60 * 24 * (this.settings.pollIntervalForced / 5) * (batSoc / 100);
				// max. 24hrs forced poll @5 min & 100% charge

			if (forcePollLocation) {
				// get location from car
				location = await this.vehicle.location();
				moving = this.isMoving(location);
				this.log(`forcing location refresh. Moving: ${moving}@${location.speed.value} km/h`);
				this.lastRefresh = Date.now();
			}

			if (!forceRefresh) {
				// get info from server
				status = await this.vehicle.status({
					refresh: false,
					parsed: false,
				});
			}

			// check if live data (full status refresh) is needed

			// check if car is active
			const justUnplugged = status && status.evStatus && !status.evStatus.batteryPlugin && this.getCapabilityValue('charger') !== '0';
			const justUnlocked = status && !isClosedLocked(status) && this.getCapabilityValue('closed_locked');
			const carActive = status ? (moving || status.engine || status.airCtrlOn || status.defrost
				|| justUnplugged || justUnlocked) : null;
			const carJustActive = ((Date.now() - this.carLastActive) < 3 * 60 * 1000); // keep refreshing 3 minutes after car use

			// check if server state changed
			let sleepModeCheck = false;
			const timestampChange = status && (status.time !== this.lastStatus.time);
			if (timestampChange && (Date.now() - this.lastSleepModeCheck) > 3 * 60 * 1000)	{	// ignore recent timestampChange
				sleepModeCheck = true;
				this.lastSleepModeCheck = Date.now();
				this.log('doing sleepModeCheck');
			}
			if (!forceRefresh) this.lastStatus = status;

			// check if live data conditions are met
			const batSoCGood = status ? (status.battery.batSoc > this.settings.batteryAlarmLevel) : true;
			this.liveData = forceRefresh || sleepModeCheck || (batSoCGood && (carActive || carJustActive));

			if (this.liveData) {
				// get status from car
				status = await this.vehicle.status({
					refresh: true,
					parsed: false,
				});
				this.lastStatus = status;
				// get location from car
				location = await this.vehicle.location();
				this.lastLocation = location;
				// get odo meter from car
				odometer = await this.vehicle.odometer();
				this.lastOdometer = odometer;

				// log data on app init
				if (!this.lastRefresh) {
					this.log(JSON.stringify(status)); // util.inspect(status, true, 10, true));
					this.log(JSON.stringify(location)); // util.inspect(location, true, 10, true));
					this.log(JSON.stringify(odometer)); // util.inspect(odometer, true, 10, true));
				}
				this.lastRefresh = Date.now();
				this.carLastActive = carActive ? this.lastRefresh : this.carLastActive;

				// update ABRP telemetry
				if (status.evStatus) this.abrpTelemetry({ status, location });

				// update capabilities and flows
				this.handleInfo({ status, location, odometer });
			}

			if (this.liveData !== this.getCapabilityValue('live_data')) this.log(`Live data: ${this.liveData}`);
			this.setCapability('live_data', this.liveData);
			return Promise.resolve(true);
		} catch (error) {
			return Promise.resolve(false);
		}
	}

	startPolling(interval) {
		this.log(`Start polling ${this.getName()} @ ${interval} minute interval.`);
		if (this.settings.pollIntervalForced) this.log(`Warning: forced polling is enabled @${this.settings.pollIntervalForced} minute interval.`);
		this.stopPolling();
		this.enQueue({ command: 'doPoll', args: true });
		this.intervalIdDevicePoll = setInterval(() => {
			if (this.busy) {
				this.watchDogCounter -= 1;
				if (this.watchDogCounter <= 0) {
					// restart the app here
					this.log('watchdog triggered, restarting device now');
					this.flushQueue();
					this.restartDevice();
					return;
				}
				this.log('skipping a poll');
				return;
			}
			this.enQueue({ command: 'doPoll', args: false });
		}, 1000 * 60 * interval);
	}

	stopPolling() {
		clearInterval(this.intervalIdDevicePoll);
	}

	restartDevice(delay) {
		// this.destroyListeners();
		this.setUnavailable('Device is restarting. Wait a few minutes!');
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
	async onSettings() {	// { newSettings }
		// this.log(newSettings);
		this.log(`${this.getName()} device settings changed by user`);
		this.restartDevice(1000);
		// do callback to confirm settings change
		return Promise.resolve(true); // string can be returned to user
	}

	setCapability(capability, value) {
		if (this.hasCapability(capability)) {
			// only update changed capabilities
			if (value !== this.getCapabilityValue(capability)) {
				this.setCapabilityValue(capability, value)
					.catch((error) => {
						this.log(error, capability, value);
					});
			}
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

	async forceLive(secret) {
		if (!this.settings.remote_force_secret || this.settings.remote_force_secret === '') return;
		if (secret !== this.settings.remote_force_secret) return;
		this.log('forcing Live data via cloud API');
		this.carLastActive = Date.now();
		this.enQueue({ command: 'doPoll', args: true });
	}

	async abrpTelemetry(info) {
		try {
			if (!this.abrpEnabled || !info || !info.location || !info.status || !info.status.evStatus) return;
			const {
				batteryCharge: charging,
				batteryStatus: soc,
			} = info.status.evStatus;
			const dcfc = info.status.evStatus.batteryPlugin === 1;
			const {
				latitude: lat,
				longitude: lon,
			} = info.location;
			const speed = info.location.speed.value;
			await this.abrp.send({
				lat, lon, speed, soc, charging, dcfc,
			});
		} catch (error) {
			this.error(error);
		}
	}

	async handleInfo(info) {
		try {
			const { speed } = info.location;
			const { odometer } = info;
			const {
				engine,
				doorLock: locked,
				airCtrlOn,
				defrost,
				// trunkOpen,
				// hoodOpen,
				// doorOpen,
			} = info.status;
			const targetTemperature = convert.getTempFromCode(info.status.airTemp.value);
			const alarmTirePressure = !!info.status.tirePressureLamp.tirePressureLampAll;

			// set defaults for non-EV vehicles
			const charger = info.status.evStatus ? info.status.evStatus.batteryPlugin : 0; // 0=none 1=fast? 2=slow 3=???
			const charging = info.status.evStatus ? info.status.evStatus.batteryCharge : false;
			const EVBatteryCharge = info.status.evStatus ? info.status.evStatus.batteryStatus : 0;
			const range = info.status.evStatus ? info.status.evStatus.drvDistance[0].rangeByFuel.totalAvailableRange.value : info.status.dte.value;
			const batteryCharge = info.status.battery.batSoc;

			// calculated properties
			const closedLocked = isClosedLocked(info.status);
			const alarmEVBattery = EVBatteryCharge < this.settings.EVbatteryAlarmLevel;
			const alarmBattery = batteryCharge < this.settings.batteryAlarmLevel;
			const distance = this.distance(info.location);
			const locString = await geo.getCarLocString(info.location); // reverse ReverseGeocoding
			const parked = !engine && (Date.now() - this.lastMoved > 30 * 1000); // && locked;
			const moving = this.isMoving(info.location);

			// update capabilities
			this.setCapability('live_data', this.liveData);
			this.setCapability('measure_battery.EV', EVBatteryCharge);
			this.setCapability('measure_battery.12V', batteryCharge);
			this.setCapability('alarm_battery', alarmBattery || alarmEVBattery);
			this.setCapability('alarm_tire_pressure', alarmTirePressure);
			this.setCapability('locked', locked);
			this.setCapability('closed_locked', closedLocked);
			this.setCapability('target_temperature', targetTemperature);
			this.setCapability('defrost', defrost);
			this.setCapability('climate_control', airCtrlOn);
			this.setCapability('engine', engine);
			this.setCapability('charging', charging);
			this.setCapability('charger', charger.toString());
			this.setCapability('odometer', odometer.value);
			this.setCapability('range', range);
			this.setCapability('speed', speed.value);
			this.setCapability('location', locString);
			this.setCapability('distance', distance);
			this.setCapability('latitude', info.location.latitude);
			this.setCapability('longitude', info.location.longitude);

			// update flow triggers
			const tokens = {};
			if (moving) {
				this.homey.flow.getDeviceTriggerCard('has_moved')
					.trigger(this, tokens)
					.catch(this.error);
			}
			this.moving = moving;

			if (parked && !this.parked) {
				this.homey.flow.getDeviceTriggerCard('has_parked')
					.trigger(this, tokens)
					.catch(this.error);
			}
			this.parked = parked;


		} catch (error) {
			this.error(error);
		}
	}

	// helper functions
	isMoving(location) {
		const lastLocation = { latitude: this.getCapabilityValue('latitude'), longitude: this.getCapabilityValue('longitude') };
		const moving = location.speed.value > 0
			|| (Math.abs(location.latitude - lastLocation.latitude) > 0.0001
			|| Math.abs(location.longitude - lastLocation.longitude) > 0.0001);
		// console.log(`Moving: ${moving}@${location.speed.value} km/h`);
		if (moving) this.lastMoved = Date.now();
		return moving;
	}

	acOnOff(acOn, source) {
		if (this.getCapabilityValue('engine')) return Promise.reject(Error('Control not possible; engine is on'));
		let command;
		let args;
		if (acOn) {
			this.log(`A/C on via ${source}`); // app or flow
			command = 'start';
			args = {
				temperature: this.getCapabilityValue('target_temperature') || 22,
			};
		} else {
			this.log(`A/C off via ${source}`); // app or flow
			command = 'stop';
			args = {
				temperature: this.getCapabilityValue('target_temperature') || 22,
			};
		}
		this.enQueue({ command, args });
		return Promise.resolve(true);
	}

	defrostOnOff(defrost, source) {
		if (this.getCapabilityValue('engine')) return Promise.reject(Error('Control not possible; engine is on'));
		let command;
		let args;
		if (defrost) {
			this.log(`defrost on via ${source}`);
			command = 'start';
			args = {
				defrost: true,
				windscreenHeating: true,
				temperature: this.getCapabilityValue('target_temperature') || 22,
			};
		} else {
			this.log(`defrost off via ${source}`);
			command = 'stop';
			args = {
				defrost: false,
				windscreenHeating: false,
				temperature: this.getCapabilityValue('target_temperature') || 22,
			};
		}
		this.enQueue({ command, args });
		return Promise.resolve(true);
	}

	setTargetTemp(temp, source) {
		if (this.getCapabilityValue('engine')) return Promise.reject(Error('Control not possible; engine is on'));
		if (!this.getCapabilityValue('climate_control')) return Promise.reject(Error('Climate control not on'));
		this.log(`Temperature set by ${source} to ${temp}`);
		const args = {
			temperature: temp || 22,
		};
		const command = 'start';
		this.enQueue({ command, args });
		return Promise.resolve(true);
	}

	startLiveData(liveData, source) {
		if (liveData) {
			this.log(`Forcing live data via ${source}`);
			if (source === 'app') this.carLastActive = Date.now();
			this.enQueue({ command: 'doPoll', args: true });
		}
		// ADD STOP LIVE DATA HERE
		return Promise.resolve(true);
	}

	// register capability listeners
	async registerListeners() {
		try {
			this.log('registering listeners');

			if (!this.allListeners) this.allListeners = {};

			// // unregister listeners first
			// const ready = Object.keys(this.allListeners).map((token) => Promise.resolve(Homey.ManagerFlow.unregisterToken(this.tokens[token])));
			// await Promise.all(ready);

			// capabilityListeners will be overwritten, so no need to unregister them

			this.registerCapabilityListener('locked', (locked) => {
				let command;
				if (locked) {
					this.log('locking doors via app');
					command = 'lock';
				} else {
					this.log('unlocking doors via app');
					command = 'unlock';
				}
				this.enQueue({ command });
				return Promise.resolve(true);
			});
			this.registerCapabilityListener('defrost', (defrost) => this.defrostOnOff(defrost, 'app'));
			this.registerCapabilityListener('climate_control', (acOn) => this.acOnOff(acOn, 'app'));
			this.registerCapabilityListener('target_temperature', async (temp) => this.setTargetTemp(temp, 'app'));
			this.registerCapabilityListener('live_data', (liveData) => this.startLiveData(liveData, 'app'));

			return Promise.resolve(this.listeners);
		} catch (error) {
			return Promise.resolve(error);
		}
	}

}

module.exports = CarDevice;

/*
// unparsed (door open, power on, start, after refresh on car):
status : {
	"airCtrlOn": true,
	"engine": true,
	"doorLock": false,
	"doorOpen": {
		"frontLeft": 0,
		"frontRight": 0,
		"backLeft": 0,
		"backRight": 0
	},
	"trunkOpen": false,
	"airTemp": {
		"value": "10H",
		"unit": 0,
		"hvacTempType": 1
	},
	"defrost": false,
	"acc": true,
	"evStatus": {
		"batteryCharge": false,
		"batteryStatus": 72,
		"batteryPlugin": 0,
		"remainTime2": {
			"etc1": {
				"value": 71,
				"unit": 1
			},
			"etc2": {
				"value": 620,
				"unit": 1
			},
			"etc3": {
				"value": 155,
				"unit": 1
			},
			"atc": {
				"value": 37,
				"unit": 1
			}
		},
		"drvDistance": [
			{
				"rangeByFuel": {
					"evModeRange": {
						"value": 334,
						"unit": 1
					},
					"totalAvailableRange": {
						"value": 334,
						"unit": 1
					}
				},
				"type": 2
			}
		],
		"reservChargeInfos": {
			"reservChargeInfo": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"offpeakPowerInfo": {
				"offPeakPowerTime1": {
					"starttime": {
						"time": "1200",
						"timeSection": 0
					},
					"endtime": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"offPeakPowerFlag": 0
			},
			"reserveChargeInfo2": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"reservFlag": 0,
			"ect": {
				"start": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"end": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				}
			},
			"targetSOClist": [
				{
					"targetSOClevel": 100,
					"dte": {
						"rangeByFuel": {
							"evModeRange": {
								"value": 473,
								"unit": 1
							},
							"totalAvailableRange": {
								"value": 473,
								"unit": 1
							}
						},
						"type": 2
					},
					"plugType": 1
				}
			]
		}
	},
	"ign3": true,
	"hoodOpen": false,
	"steerWheelHeat": 0,
	"sideBackWindowHeat": 0,
	"tirePressureLamp": {
		"tirePressureLampAll": 0,
		"tirePressureLampFL": 0,
		"tirePressureLampFR": 0,
		"tirePressureLampRL": 0,
		"tirePressureLampRR": 0
	},
	"battery": {
		"batSoc": 84,
		"batState": 0
	},
	"time": "20200721101303"


// unparsed (power off, exit car, lock door, get server status):
status : {
	"airCtrlOn": false,
	"engine": false,
	"doorLock": true,
	"doorOpen": {
		"frontLeft": 0,
		"frontRight": 0,
		"backLeft": 0,
		"backRight": 0
	},
	"trunkOpen": false,
	"airTemp": {
		"value": "10H",
		"unit": 0,
		"hvacTempType": 1
	},
	"defrost": false,
	"acc": false,
	"evStatus": {
		"batteryCharge": false,
		"batteryStatus": 72,
		"batteryPlugin": 0,
		"remainTime2": {
			"etc1": {
				"value": 72,
				"unit": 1
			},
			"etc2": {
				"value": 620,
				"unit": 1
			},
			"etc3": {
				"value": 155,
				"unit": 1
			},
			"atc": {
				"value": 37,
				"unit": 1
			}
		},
		"drvDistance": [
			{
				"rangeByFuel": {
					"evModeRange": {
						"value": 333,
						"unit": 1
					},
					"totalAvailableRange": {
						"value": 333,
						"unit": 1
					}
				},
				"type": 2
			}
		],
		"reservChargeInfos": {
			"reservChargeInfo": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"offpeakPowerInfo": {
				"offPeakPowerTime1": {
					"starttime": {
						"time": "1200",
						"timeSection": 0
					},
					"endtime": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"offPeakPowerFlag": 0
			},
			"reserveChargeInfo2": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"reservFlag": 0,
			"ect": {
				"start": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"end": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				}
			},
			"targetSOClist": [
				{
					"targetSOClevel": 100,
					"dte": {
						"rangeByFuel": {
							"evModeRange": {
								"value": 473,
								"unit": 1
							},
							"totalAvailableRange": {
								"value": 473,
								"unit": 1
							}
						},
						"type": 2
					},
					"plugType": 1
				}
			]
		}
	},
	"ign3": false,
	"hoodOpen": false,
	"transCond": true,
	"steerWheelHeat": 0,
	"sideBackWindowHeat": 0,
	"tirePressureLamp": {
		"tirePressureLampAll": 0,
		"tirePressureLampFL": 0,
		"tirePressureLampFR": 0,
		"tirePressureLampRL": 0,
		"tirePressureLampRR": 0
	},
	"battery": {
		"batSoc": 85,
		"batState": 0
	},
	"sleepModeCheck": true,
	"time": "20200721101842"
}

// unparsed (door open, power on, start):
status : {
	"airCtrlOn": false,
	"engine": false,
	"doorLock": true,
	"doorOpen": {
		"frontLeft": 0,
		"frontRight": 0,
		"backLeft": 0,
		"backRight": 0
	},
	"trunkOpen": false,
	"airTemp": {
		"value": "10H",
		"unit": 0,
		"hvacTempType": 1
	},
	"defrost": false,
	"acc": false,
	"evStatus": {
		"batteryCharge": false,
		"batteryStatus": 72,
		"batteryPlugin": 0,
		"remainTime2": {
			"etc1": {
				"value": 72,
				"unit": 1
			},
			"etc2": {
				"value": 620,
				"unit": 1
			},
			"etc3": {
				"value": 155,
				"unit": 1
			},
			"atc": {
				"value": 37,
				"unit": 1
			}
		},
		"drvDistance": [
			{
				"rangeByFuel": {
					"evModeRange": {
						"value": 334,
						"unit": 1
					},
					"totalAvailableRange": {
						"value": 334,
						"unit": 1
					}
				},
				"type": 2
			}
		],
		"reservChargeInfos": {
			"reservChargeInfo": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"offpeakPowerInfo": {
				"offPeakPowerTime1": {
					"starttime": {
						"time": "1200",
						"timeSection": 0
					},
					"endtime": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"offPeakPowerFlag": 0
			},
			"reserveChargeInfo2": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"reservFlag": 0,
			"ect": {
				"start": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"end": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				}
			},
			"targetSOClist": [
				{
					"targetSOClevel": 0,
					"dte": {
						"rangeByFuel": {
							"evModeRange": {
								"value": 473,
								"unit": 1
							},
							"totalAvailableRange": {
								"value": 473,
								"unit": 1
							}
						},
						"type": 2
					},
					"plugType": 1
				}
			]
		}
	},
	"ign3": false,
	"hoodOpen": false,
	"transCond": true,
	"steerWheelHeat": 0,
	"sideBackWindowHeat": 0,
	"tirePressureLamp": {
		"tirePressureLampAll": 0,
		"tirePressureLampFL": 0,
		"tirePressureLampFR": 0,
		"tirePressureLampRL": 0,
		"tirePressureLampRR": 0
	},
	"battery": {
		"batSoc": 85,
		"batState": 0
	},
	"sleepModeCheck": true,
	"time": "20200721084418"
}

// unparsed (door open, power on, no start):
status : {
	"airCtrlOn": false,
	"engine": false,
	"doorLock": true,
	"doorOpen": {
		"frontLeft": 0,
		"frontRight": 0,
		"backLeft": 0,
		"backRight": 0
	},
	"trunkOpen": false,
	"airTemp": {
		"value": "10H",
		"unit": 0,
		"hvacTempType": 1
	},
	"defrost": false,
	"acc": false,
	"evStatus": {
		"batteryCharge": false,
		"batteryStatus": 72,
		"batteryPlugin": 0,
		"remainTime2": {
			"etc1": {
				"value": 72,
				"unit": 1
			},
			"etc2": {
				"value": 620,
				"unit": 1
			},
			"etc3": {
				"value": 155,
				"unit": 1
			},
			"atc": {
				"value": 37,
				"unit": 1
			}
		},
		"drvDistance": [
			{
				"rangeByFuel": {
					"evModeRange": {
						"value": 334,
						"unit": 1
					},
					"totalAvailableRange": {
						"value": 334,
						"unit": 1
					}
				},
				"type": 2
			}
		],
		"reservChargeInfos": {
			"reservChargeInfo": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"offpeakPowerInfo": {
				"offPeakPowerTime1": {
					"starttime": {
						"time": "1200",
						"timeSection": 0
					},
					"endtime": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"offPeakPowerFlag": 0
			},
			"reserveChargeInfo2": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"reservFlag": 0,
			"ect": {
				"start": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"end": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				}
			},
			"targetSOClist": [
				{
					"targetSOClevel": 0,
					"dte": {
						"rangeByFuel": {
							"evModeRange": {
								"value": 473,
								"unit": 1
							},
							"totalAvailableRange": {
								"value": 473,
								"unit": 1
							}
						},
						"type": 2
					},
					"plugType": 1
				}
			]
		}
	},
	"ign3": false,
	"hoodOpen": false,
	"transCond": true,
	"steerWheelHeat": 0,
	"sideBackWindowHeat": 0,
	"tirePressureLamp": {
		"tirePressureLampAll": 0,
		"tirePressureLampFL": 0,
		"tirePressureLampFR": 0,
		"tirePressureLampRL": 0,
		"tirePressureLampRR": 0
	},
	"battery": {
		"batSoc": 85,
		"batState": 0
	},
	"sleepModeCheck": true,
	"time": "20200721084418"
}

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

A/C on:
status : {
	"airCtrlOn": true,
	"engine": true,
	"doorLock": false,
	"doorOpen": {
		"frontLeft": 0,
		"frontRight": 0,
		"backLeft": 0,
		"backRight": 0hargeSet": false,
	},atus (on bluelink cache)
	"trunkOpen": false,ch vehicle)
	"airTemp": {irTemp": {
		"value": "10H",
		"unit": 0,"unit": 0
		"hvacTempType": 1
	},        "airCtrl": 0,
	"defrost": false,g1": 0
	"acc": true,
	"evStatus": {
		"batteryCharge": false,
		"batteryStatus": 72,
		"batteryPlugin": 0,
		"remainTime2": {
			"etc1": {: 9,
				"value": 72,
				"unit": 1": "1200",
			},    "timeSection": 0
			"etc2": {
				"value": 620,
				"unit": 1
			},  "day": 9,
			"etc3": {": {
				"value": 155,1200",
				"unit": 1Section": 0
			},  }
			"atc": {
				"value": 37,
				"unit": 1ist": [
			} {
		},    "targetSOClevel": 100,
		"drvDistance": [
			{     "rangeByFuel": {
				"rangeByFuel": {ge": {
					"evModeRange": {73,
						"value": 326,
						"unit": 1
					},  "totalAvailableRange": {
					"totalAvailableRange": {
						"value": 326,
						"unit": 1
					} },
				},  "type": 2
				"type": 2
			}   "plugType": 1
		],  }
		"reservChargeInfos": {
			"reservChargeInfo": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9at": 0,
						],dowHeat": 0,
						"time": { {
							"time": "1200",
							"timeSection": 0
						}sureLampFR": 0,
					},ssureLampRL": 0,
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},00721101303"
						"airCtrl": 0,
						"heating1": 0
					}wanna do? (Use arrow keys)
				}
			},
			"offpeakPowerInfo": {
				"offPeakPowerTime1": {
					"starttime": {che)
						"time": "1200",icle)
						"timeSection": 0
					},
					"endtime": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"offPeakPowerFlag": 0
			},
			"reserveChargeInfo2": {
				"reservChargeInfoDetail": {
					"reservInfo": {
						"day": [
							9
						],
						"time": {
							"time": "1200",
							"timeSection": 0
						}
					},
					"reservChargeSet": false,
					"reservFatcSet": {
						"defrost": false,
						"airTemp": {
							"value": "00H",
							"unit": 0
						},
						"airCtrl": 0,
						"heating1": 0
					}
				}
			},
			"reservFlag": 0,
			"ect": {
				"start": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				},
				"end": {
					"day": 9,
					"time": {
						"time": "1200",
						"timeSection": 0
					}
				}
			},
			"targetSOClist": [
				{
					"targetSOClevel": 100,
					"dte": {
						"rangeByFuel": {
							"evModeRange": {
								"value": 473,
								"unit": 1
							},
							"totalAvailableRange": {
								"value": 473,
								"unit": 1
							}
						},
						"type": 2
					},
					"plugType": 1
				}
			]
		}
	},
	"ign3": true,
	"hoodOpen": false,
	"steerWheelHeat": 0,
	"sideBackWindowHeat": 0,
	"tirePressureLamp": {
		"tirePressureLampAll": 0,
		"tirePressureLampFL": 0,
		"tirePressureLampFR": 0,
		"tirePressureLampRL": 0,
		"tirePressureLampRR": 0
	},
	"battery": {
		"batSoc": 85,
		"batState": 0
	},
	"time": "20200721101516"
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
