/*
Copyright 2020 - 2021, Robin de Gruijter (gruijter@hotmail.com)

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
const Client = require('bluelinky');
const GeoPoint = require('geopoint');
const util = require('util');
const ABRP = require('../abrp_telemetry');
const Bitly = require('../bitly');
const Maps = require('../google_maps.js');
const geo = require('../nomatim');
const convert = require('./temp_convert');

const setTimeoutPromise = util.promisify(setTimeout);

const isClosedLocked = (status) => {
	const {
		doorLock, trunkOpen, hoodOpen, doorOpen,
	} = status;
	return doorLock && !trunkOpen && !hoodOpen && Object.keys(doorOpen).reduce((closedAccu, door) => closedAccu || !doorOpen[door], true);
};

// const stringToDate = (str) => {
// 	// var str = "20140711090807";
// 	const year = str.substring(0, 4);
// 	const month = str.substring(4, 6);
// 	const day = str.substring(6, 8);
// 	const hour = str.substring(8, 10);
// 	const minute = str.substring(10, 12);
// 	const second = str.substring(12, 14);
// 	return new Date(year, month - 1, day, hour, minute, second);
// };

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
			this.restarting = false;
			this.pollMode = 0; // 0: normal, 1: engineOn with refresh
			this.isEV = this.hasCapability('charger');
			this.lastChargeTargets = {
				slow: this.getCapabilityValue('charge_target_slow') || '80',
				fast: this.getCapabilityValue('charge_target_fast') || '80',
			};
			this.lastMoved = 0;
			this.lastOdometer = this.getCapabilityValue('odometer');
			this.lastLocation = { latitude: this.getCapabilityValue('latitude'), longitude: this.getCapabilityValue('longitude') };
			this.parkLocation = this.getStoreValue('parkLocation');
			if (!this.parkLocation) this.parkLocation = this.lastLocation;
			// this.setAvailable();
			// this.unsetWarning();

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
				// vin: this.settings.vin,
				brand: this.ds.deviceId === 'bluelink' ? 'hyundai' : 'kia',
				deviceUuid: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), // 'homey',
				autoLogin: true,
			};

			this.client = new Client(options);

			this.client.on('error', async (error) => {
				// retCode: 'F', resCode: '5091', resMsg: 'Exceeds number of requests
				if (error.message && error.message.includes('"resCode":"5091"')) {
					this.log('Daily quotum reached! Pausing app for 60 minutes.');
					this.setUnavailable('Daily quotum reached!. Waiting 60 minutes.');
					await setTimeoutPromise(60 * 60 * 1000, 'waiting is done');
					this.setAvailable();
					this.watchDogCounter -= 1;
					return;
				}
				if (error.message && error.message.includes('"resCode":"4004"')) {
					this.log('Command failed (duplicate request)');
					this.watchDogCounter -= 1;
					return;
				}
				this.error(error);
				await setTimeoutPromise(15 * 1000, 'waiting is done');
				this.watchDogCounter -= 1;
				if (!this.vehicle) this.restartDevice();
			});

			this.client.on('ready', (vehicles) => {
				// console.log(util.inspect(vehicles, true, 10, true));
				const [vehicle] = vehicles.filter((veh) => veh.vehicleConfig.vin === this.settings.vin);
				if (this.vehicle === null) this.log(JSON.stringify(vehicle.vehicleConfig));
				this.vehicle = vehicle;
			});

			// await this.client.login();

			// migrate capabilities from old v2.2.0
			if (this.settings.level !== '2.3.0') await this.migrate();

			// setup ABRP client
			this.abrpEnabled = Homey.env && Homey.env.ABRP_API_KEY
				&& this.settings && this.settings.abrp_user_token && this.settings.abrp_user_token.length > 5;
			this.log(`ABRP enabled: ${!!this.abrpEnabled}`);
			if (this.abrpEnabled) {
				const abrpOptions = {
					apiKey: Homey.env.ABRP_API_KEY,
					userToken: this.settings.abrp_user_token,
				};
				this.abrp = new ABRP(abrpOptions);
			}

			// setup Google Maps client
			this.gmapsEnabled = this.settings && this.settings.gmaps_api_key && this.settings.gmaps_api_key.length > 5;
			this.log(`Google Directions enabled: ${!!this.gmapsEnabled}`);
			if (this.gmapsEnabled) {
				const gmapsOptions = {
					apiKey: this.settings.gmaps_api_key,
				};
				this.maps = new Maps(gmapsOptions);
			}

			// create Force status refresh URL
			const secret = this.settings.remote_force_secret ? this.settings.remote_force_secret.replace(/[^a-zA-Z0-9-_*!~]/g, '') : '';
			await this.setSettings({ remote_force_secret: secret });
			if (Homey.env && Homey.env.BITLY_API_KEY && secret !== '') {
				// setup Bitly client
				const bitly = new Bitly({ apiKey: Homey.env.BITLY_API_KEY });
				const cloudID = await this.homey.cloud.getHomeyId();
				let url = `https://${cloudID}.connect.athom.com/api/app/com.gruijter.hyundai_kia/live?secret=${secret}`;
				if (this.settings.shorten_url) url = await bitly.shorten(url);
				this.setSettings({ remote_force_url: url });
				this.log('Remote status refresh URL:', url);
			} else this.setSettings({ remote_force_url: '' });

			// init listeners
			if (!this.allListeners) this.registerListeners();

			// testing stuff
			// if (this.abrpEnabled) {
			// 	const plan = await this.abrp.getLatestPlan()
			// 		.catch(this.error);
			// 	console.log(plan);
			// }
			// const tripInfo = await this.vehicle.tripInfo({ year: 2021, month: 1, day: 23 });
			// console.log(util.inspect(tripInfo, true, 10, true));

			// const monthlyReport = await this.vehicle.monthlyReport({ year: 2021, month: 3 });
			// console.log(monthlyReport);

			// start polling
			await setTimeoutPromise(15 * 1000, 'waiting is done');
			this.enQueue({ command: 'doPoll', args: false });
			await setTimeoutPromise(15 * 1000, 'waiting is done');
			this.enQueue({ command: 'doPoll', args: true });
			this.startPolling(this.settings.pollInterval);

		} catch (error) {
			this.error(error);
			this.restartDevice(10 * 60 * 1000);
		}
	}

	// migrate stuff from old version 2.2.0
	async migrate() {
		this.log('checking capability migration');
		const status = await this.vehicle.status({ refresh: false, parsed: false });
		this.isEV = !!status.evStatus;
		const isICE = !!status.dte;
		let engine = 'HEV/ICE';
		if (this.isEV && !isICE) engine = 'Full EV';
		if (this.isEV && isICE) engine = 'PHEV';
		// set engine type in settings
		if (this.getSettings().engine !== engine) {
			this.log(`setting engine type to ${engine}`);
			this.setSettings({ engine });
		}
		// add new capabilities for EV
		if (this.isEV && !this.getCapabilities().includes('charge_target_fast')) {
			this.log('Adding charge target capabilities to', this.getName());
			await this.addCapability('charge_target_slow');
			await this.addCapability('charge_target_fast');
		}
		// remove capabilities for nonEV
		if (!this.isEV && this.getCapabilities().includes('charger')) {
			this.log('Removing EV capabilities from', this.getName());
			await this.removeCapability('measure_battery.EV');
			await this.removeCapability('charging');
			await this.removeCapability('charger');
			await this.removeCapability('charge_target_slow');
			await this.removeCapability('charge_target_fast');
		}
		// set migrate level
		this.setSettings({ level: '2.3.0' });
	}

	// stuff for queue handling here
	async enQueue(item) {
		if (this.disabled) {
			this.log('ignoring command; Homey live link is disabled.');
			return;
		}
		if (this.tail >= 10) {
			this.error('queue overflow');
			return;
		}
		this.queue[this.tail] = item;
		this.tail += 1;
		if (!this.queueRunning) {
			// await this.client.login(); // not needed with autoLogin: true
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
					this.watchDogCounter -= 1;
					throw Error('pausing queue; not logged in');
				}
				const itemWait = {
					doPoll: 5,
					start: 65,
					stop: 5,
					lock: 5,
					unlock: 5,
					setChargeTargets: 25,
					startCharge: 25,
					stopCharge: 5,
					setNavigation: 65,
				};
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
						const msg = error.body || error.message || error;
						// retry once on retCode: 'F', resCode: '4004', resMsg: 'Duplicate request - Duplicate request'
						let retryWorked = false;
						if (msg && msg.inludes('"resCode":"4004"')) {
							this.log(`${item.command} failed. Retrying in 30 seconds`);
							await setTimeoutPromise(30 * 1000, 'waiting is done');
							retryWorked = await methodClass[item.command](item.args)
								.then(() => {
									this.watchDogCounter = 6;
									this.setAvailable();
									return true;
								})
								.catch(() => false);
						}
						if (!retryWorked) {
							this.error(`${item.command} failed`, msg);
							this.watchDogCounter -= 1;
							if (this.watchDogCounter <= 0) {
								// restart the app here
								this.log('watchdog triggered, restarting device now');
								this.restartDevice();
							}
						}
						this.busy = false;
					});
				await setTimeoutPromise((itemWait[item.command] || 5) * 1000, 'waiting is done');
				this.runQueue();
			} else {
				// console.log('Finshed queue');
				this.queueRunning = false;
				this.busy = false;
				const fixState = (this.lastCommand === 'stopCharge') && ((Date.now() - this.fixStateTime) < 15 * 1000);
				if (this.lastCommand !== 'doPoll' && !fixState) {
					// this.carLastActive = Date.now();
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
			const firstPoll = !this.lastStatus;
			let status = this.lastStatus;
			let location = this.lastLocation;
			let odometer = this.lastOdometer;
			const chargeTargets = this.lastChargeTargets;

			const batSoc = this.getCapabilityValue('measure_battery.12V');
			const forcePollInterval = this.settings.pollIntervalForced
				&& (this.settings.pollIntervalForced * 60 * 1000) < (Date.now() - this.lastRefresh)
				&& (Date.now() - this.lastRefresh) > 1000 * 60 * 24 * (this.settings.pollIntervalForced / 5) * ((batSoc || 50) / 100);
				// max. 24hrs forced poll @5 min & 100% charge
			const batSoCGood = status && status.battery ? (status.battery.batSoc > this.settings.batteryAlarmLevel) : true;
			const refresh = this.pollMode	// 1 = engineOn with refresh
				|| (batSoCGood && (forceOnce || forcePollInterval)); // || !status || !location || !odometer));

			const advanced = typeof this.vehicle.fullStatus === 'function'; // works for EU vehicles only

			if (!refresh) { // get info from server
				if (advanced) { // get status, location, odo meter from server
					const fullStatus = await this.vehicle.fullStatus({
						refresh: false,
						parsed: false,
					});
					// console.log(fullStatus);
					status = fullStatus.vehicleStatus;
					if (this.lastStatus && status.time !== this.lastStatus.time) {
						this.log('Server info changed.', this.lastStatus.time, status.time);
						// if (status.sleepModeCheck) console.log(this.getName(), 'sleepModeCheck is true. Car just parked?');
						this.lastRefresh = Date.now();
					}
					this.lastStatus = status;
					if (fullStatus.vehicleLocation) {
						location = {
							latitude: fullStatus.vehicleLocation.coord.lat,
							longitude: fullStatus.vehicleLocation.coord.lon,
							altitude: fullStatus.vehicleLocation.coord.alt,
							speed: fullStatus.vehicleLocation.speed,
							heading: fullStatus.vehicleLocation.head,
						};
					}
					this.lastLocation = location;
					odometer = fullStatus.odometer || odometer;
					this.lastOdometer = odometer;
				} else { // get status from server
					status = await this.vehicle.status({
						refresh: false,
						parsed: false,
					});
					// check if server state changed
					if (status.time !== this.lastStatus.time) {
						this.log('Server info changed.');
						// get location from car
						location = await this.vehicle.location();
						this.lastLocation = location;
						// get odo meter from car
						odometer = await this.vehicle.odometer();
						this.lastOdometer = odometer;
						this.lastRefresh = Date.now();
					}
				}
				this.lastStatus = status;
			}

			if (refresh) { // get status, location, odo meter from car
				this.log('Status refresh from car');
				if (advanced) {
					const fullStatus = await this.vehicle.fullStatus({
						refresh: true,
						parsed: false,
					});
					status = fullStatus.vehicleStatus;
					this.lastStatus = status;
					if (fullStatus.vehicleLocation) {
						location = {
							latitude: fullStatus.vehicleLocation.coord.lat,
							longitude: fullStatus.vehicleLocation.coord.lon,
							altitude: fullStatus.vehicleLocation.coord.alt,
							speed: fullStatus.vehicleLocation.speed,
							heading: fullStatus.vehicleLocation.head,
						};
					} else location = await this.vehicle.location();
					this.lastLocation = location;
					odometer = fullStatus.odometer ? fullStatus.odometer : await this.vehicle.odometer();
					this.lastOdometer = odometer;
				} else {
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
				}

				this.lastRefresh = Date.now();
			}

			const info = {
				status, location, odometer, chargeTargets,
			};

			// refresh chargeTargets only on firstPoll, just parked or just charging
			if (this.isEV) {
				const hasParked = this.isParking(info);
				const startCharge = !this.getCapabilityValue('charging') && (info.status.evStatus ? info.status.evStatus.batteryCharge : false);
				if (firstPoll || hasParked || startCharge) {
					this.log('refreshing charge targets');
					const targetInfo = await this.vehicle.getChargeTargets();
					const slow = (targetInfo.find((i) => i.type === 1).targetLevel || this.lastChargeTargets.slow).toString();
					const fast = (targetInfo.find((i) => i.type === 0).targetLevel || this.lastChargeTargets.fast).toString();
					info.chargeTargets = { slow, fast };
					this.lastChargeTargets = info.chargeTargets;
				}
			}

			// check if car is active
			const justUnplugged = status && status.evStatus && !status.evStatus.batteryPlugin && this.getCapabilityValue('charger') !== '0';
			const justUnlocked = status && !isClosedLocked(status) && this.getCapabilityValue('closed_locked');
			const climateOn = status && (status.airCtrlOn || status.defrost);
			const engineOn = status && status.engine;
			const carActive = engineOn || climateOn || justUnplugged || justUnlocked;
			if (carActive) this.carLastActive = Date.now();
			const carJustActive = ((Date.now() - this.carLastActive) < 3 * 60 * 1000); // human activity or cloud refresh triggered recently

			// log data on app init
			if (firstPoll) this.log(JSON.stringify(info));

			// update ABRP
			if (this.isEV && refresh) this.abrpTelemetry(info);

			// update capabilities and flows
			this.handleInfo(info);

			// fix charger state after refresh
			if (this.isEV && refresh && status && status.evStatus && status.evStatus.batteryPlugin && !status.evStatus.batteryCharge) {
				this.chargingOnOff(false, 'state fix');
				this.fixStateTime = Date.now();
			}

			// variable polling interval based on active state
			if (this.settings.pollIntervalEngineOn && !this.pollMode && carJustActive) {
				this.pollMode = 1; // engineOn poll mode
				this.startPolling(this.settings.pollIntervalEngineOn);
			} else if (this.pollMode && !carJustActive) {
				this.pollMode = 0; // normal poll mode
				this.startPolling(this.settings.pollInterval);
			}

			return Promise.resolve(true);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	startPolling(interval) {
		const mode = this.pollMode ? 'car' : 'server';
		this.log(`Start polling ${mode} ${this.getName()} @ ${interval} minute interval`);
		if (this.settings.pollIntervalForced) this.log(`Warning: forced polling is enabled @${this.settings.pollIntervalForced} minute interval`);
		this.stopPolling();
		// this.enQueue({ command: 'doPoll', args: true });
		this.intervalIdDevicePoll = setInterval(() => {
			if (this.busy) {
				this.watchDogCounter -= 1;
				if (this.watchDogCounter <= 0) {
					// restart the app here
					this.log('watchdog triggered, restarting device now');
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

	async restartDevice(delay) {
		// this.destroyListeners();
		if (this.restarting) return;
		this.restarting = true;
		this.stopPolling();
		this.flushQueue();
		const dly = delay || 1000 * 60 * 5;
		this.log(`Device will restart in ${dly / 1000} seconds`);
		this.setUnavailable('Device is restarting. Wait a few minutes!');
		await setTimeoutPromise(dly).then(() => this.onInitDevice());
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
	async onSettings() { // { newSettings }) {
		this.log(`${this.getName()} device settings changed by user`);
		this.restartDevice(250);
		// do callback to confirm settings change
		return Promise.resolve(true); // string can be returned to user
	}

	setCapability(capability, value) {
		if (this.hasCapability(capability)) {
			// only update changed values
			if (value !== this.getCapabilityValue(capability)) {
				this.setCapabilityValue(capability, value)
					.catch((error) => {
						this.log(error, capability, value);
					});
			}
		}
	}

	async handleInfo(info) {
		try {
			const { speed } = info.location;
			const { odometer } = info;
			const { chargeTargets } = info;
			const {
				engine,	doorLock: locked, airCtrlOn, defrost,
			} = info.status;
			const targetTemperature = convert.getTempFromCode(info.status.airTemp.value);
			const alarmTirePressure = !!info.status.tirePressureLamp.tirePressureLampAll;
			const batteryCharge = info.status.battery ? info.status.battery.batSoc : undefined;

			// set defaults for non-EV vehicles
			const charging = info.status.evStatus ? info.status.evStatus.batteryCharge : false;
			let charger = info.status.evStatus ? info.status.evStatus.batteryPlugin : 0; // 0=none 1=fast 2=slow/normal
			if (charger && !charging) charger += 2;	// 3= fast off, 4 = slow off
			const EVBatteryCharge = info.status.evStatus ? info.status.evStatus.batteryStatus : 0;
			const range = info.status.evStatus ? info.status.evStatus.drvDistance[0].rangeByFuel.totalAvailableRange.value : info.status.dte.value;

			// calculated properties
			const carLocString = geo.getCarLocString(info.location); // reverse ReverseGeocoding ASYNC!!!
			const etth = this.etth(info);	// ASYNC in future!!!
			const distance = Math.round(this.distance(info.location) * 10) / 10;
			const moving = this.isMoving(info.location);
			const hasParked = this.isParking(info);
			const closedLocked = isClosedLocked(info.status);
			const alarmEVBattery = this.isEV && (EVBatteryCharge < this.settings.EVbatteryAlarmLevel);
			const alarmBattery = batteryCharge < this.settings.batteryAlarmLevel;

			// update capabilities
			this.setCapability('measure_battery.12V', batteryCharge || 0);
			this.setCapability('alarm_battery', alarmBattery || alarmEVBattery);
			this.setCapability('alarm_tire_pressure', alarmTirePressure);
			this.setCapability('locked', locked);
			this.setCapability('closed_locked', closedLocked);
			this.setCapability('target_temperature', targetTemperature);
			this.setCapability('defrost', defrost);
			this.setCapability('climate_control', airCtrlOn);
			this.setCapability('engine', engine);
			this.setCapability('odometer', odometer.value);
			this.setCapability('range', range);
			this.setCapability('speed', speed.value);
			this.setCapability('latitude', info.location.latitude);
			this.setCapability('longitude', info.location.longitude);
			this.setCapability('distance', distance);

			// update EV specific capabilities
			if (this.isEV) {
				this.setCapability('measure_battery.EV', EVBatteryCharge);
				this.setCapability('charge_target_slow', chargeTargets.slow);
				this.setCapability('charge_target_fast', chargeTargets.fast);
				this.setCapability('charging', charging);
				this.setCapability('charger', charger.toString());
			}

			// update async capabilities
			const { local, address } = await Promise.resolve(carLocString);
			this.setCapability('location', local);
			this.setCapability('etth', await Promise.resolve(etth));

			const ds = new Date(this.lastRefresh);
			const date = ds.toString().substring(4, 11);
			const time = ds.toLocaleTimeString('nl-NL', { hour12: false, timeZone: this.homey.clock.getTimezone() }).substring(0, 5);
			this.setCapability('last_refresh', `${date} ${time}`);
			this.setCapability('refresh_status', false);

			// update flow triggers
			const tokens = {};
			if (moving) {
				this.homey.flow.getDeviceTriggerCard('has_moved')
					.trigger(this, tokens)
					.catch(this.error);
			}

			if (hasParked) {
				this.parkLocation = info.location;
				this.setStoreValue('parkLocation', this.parkLocation);
				this.log(`new park location: ${local}`);
				// this.carLastActive = Date.now(); // keep polling for some time
				tokens.address = address;
				tokens.map = `https://www.google.com/maps?q=${info.location.latitude},${info.location.longitude}`;
				this.homey.flow.getDeviceTriggerCard('has_parked')
					.trigger(this, tokens)
					.catch(this.error);
			}

			if ((Date.now() - this.lastRefresh) < 30 * 1000) {
				this.homey.flow.getDeviceTriggerCard('status_update')
					.trigger(this, tokens)
					.catch(this.error);
			}

		} catch (error) {
			this.error(error);
		}
	}

	// helper functions
	isMoving(location) {
		const previousLocation = { latitude: this.getCapabilityValue('latitude'), longitude: this.getCapabilityValue('longitude') };
		const moving = location.speed.value > 0
			|| (Math.abs(location.latitude - previousLocation.latitude) > 0.0001
			|| Math.abs(location.longitude - previousLocation.longitude) > 0.0001);
		// console.log(`Moving: ${moving}@${location.speed.value} km/h`);
		if (moving) this.lastMoved = Date.now();
		return moving;
	}

	isParking(info) {
		const parked = !info.status.engine; //  && (Date.now() - this.lastMoved > 30 * 1000); // 30s after engine shut off or sleepModeCheck
		if (!parked) return false;	// car is driving

		const newLocation = Math.abs(info.location.latitude - this.parkLocation.latitude) > 0.0003
			|| Math.abs(info.location.longitude - this.parkLocation.longitude) > 0.0003;
		const parking = parked && newLocation;
		return parking;
	}

	// Estimated Time to Home.
	async etth(info) {
		try {
			if (!info || (Date.now() - this.lastRefresh) >= 3 * 60 * 1000) return this.getCapabilityValue('etth');

			// estimate TTH based on avgSpd
			const distance = this.distance(info.location);
			const avgSpd = 40;
			let etth = (distance > 0.15) ? (60 * (distance / avgSpd)) : 0;	// in minutes

			// estimate TTH based on Google directions
			if (this.gmapsEnabled && info.status.engine && distance > 0.15) {
				const origin = `${info.location.latitude},${info.location.longitude}`;
				const destination = `${this.settings.lat},${this.settings.lon}`;
				const directions = await this.maps.directions({ origin, destination })
					.catch((error) => this.error(error.message));
				if (directions.routes) {
					const duration = directions.routes[0].legs[0].duration_in_traffic
						? directions.routes[0].legs[0].duration_in_traffic.value
						: directions.routes[0].legs[0].duration.value;
					etth = duration / 60;
					// console.log(util.inspect(directions, true, 10, true));
				}
			}

			return Promise.resolve(Math.round(etth));
		} catch (error) {
			this.error(error);
			return 9999;
		}
	}

	distance(location) {
		const lat1 = location.latitude;
		const lon1 = location.longitude;
		const lat2 = this.settings.lat;
		const lon2 = this.settings.lon;
		const from = new GeoPoint(Number(lat1), Number(lon1));
		const to = new GeoPoint(Number(lat2), Number(lon2));
		return Math.round(from.distanceTo(to, true) * 100) / 100;
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
			this.error('ABPR', error.message);
		}
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

	async chargingOnOff(charge, source) {
		if (!this.isEV) return Promise.reject(Error('Control not possible; not an EV'));
		let command;
		if (charge) {
			this.log(`charging on via ${source}`);
			command = 'startCharge';
		} else {
			// if (this.liveData) return Promise.reject(Error('Control not possible; live data is on'));
			this.log(`charging off via ${source}`);
			command = 'stopCharge';
		}
		this.enQueue({ command });
		// if (this.liveData) return Promise.resolve(Error('Warning: live data is on.'));
		return Promise.resolve(true);
	}

	lock(locked, source) {
		let command;
		if (locked) {
			this.log(`locking doors via ${source}`);
			command = 'lock';
		} else {
			this.log(`unlocking doors via ${source}`);
			command = 'unlock';
		}
		this.enQueue({ command });
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

	setChargeTargets(targets = { fast: 100, slow: 80 }, source) {
		if (!this.isEV) return Promise.reject(Error('Control not possible; not an EV'));
		this.log(`Charge target is set by ${source} to slow:${targets.slow} fast:${targets.fast}`);
		const args = { fast: Number(targets.fast), slow: Number(targets.slow) };
		const command = 'setChargeTargets';
		this.enQueue({ command, args });
		this.lastChargeTargets = {
			slow: args.slow.toString(),
			fast: args.fast.toString(),
		};
		return Promise.resolve(true);
	}

	async setDestination(destination, source) {	// free text, latitude/longitude object or nomatim search object
		this.log(`Destination set by ${source} to ${JSON.stringify(destination)}`);
		let searchParam = destination;
		// check if destination is location object format
		if (destination && destination.latitude && destination.longitude) {
			searchParam = `${destination.latitude},${destination.longitude}`;
		}
		const dest = await geo.search(searchParam)
			.catch((error) => this.error(error.messsage || error));
		if (!dest) throw Error('failed to find location');
		const args = [
			{
				phone: dest.extratags.phone || '',
				waypointID: 0,
				lang: 1,
				src: 'HOMEY',
				coord: {
					lat: Number(dest.lat), lon: Number(dest.lon), type: 0,
				},
				addr: dest.display_name,
				zip: dest.address.postcode || '',
				placeid: dest.display_name,
				name: dest.namedetails.name || dest.display_name,
			},
		];
		const command = 'setNavigation';
		this.enQueue({ command, args });
		return Promise.resolve(true);
	}

	async refreshStatus(refresh, source) {
		if (refresh) {
			this.log(`Forcing status refresh via ${source}`);
			if (source === 'app' || source === 'cloud') this.carLastActive = Date.now();
			this.enQueue({ command: 'doPoll', args: true });
		}
		return Promise.resolve(true);
	}

	setHomeyLink(available, source) {
		this.log(`Homey live link enabled via ${source}: ${available}`);
		if (!available) {
			this.disabled = true;
			this.stopPolling();
			// this.flushQueue();
			this.setWarning(`Homey live link has been disabled via ${source}`);
			// this.setUnavailable('Homey live link has been disabled');
		} else {
			this.disabled = false;
			// this.setAvailable();
			this.unsetWarning();
			this.enQueue({ command: 'doPoll', args: true });
			this.startPolling(this.settings.pollInterval);
		}
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
			this.registerCapabilityListener('locked', (locked) => this.lock(locked, 'app'));
			this.registerCapabilityListener('defrost', (defrost) => this.defrostOnOff(defrost, 'app'));
			this.registerCapabilityListener('climate_control', (acOn) => this.acOnOff(acOn, 'app'));
			this.registerCapabilityListener('target_temperature', async (temp) => this.setTargetTemp(temp, 'app'));
			this.registerCapabilityListener('refresh_status', (refresh) => this.refreshStatus(refresh, 'app'));
			this.registerCapabilityListener('charging', (charge) => this.chargingOnOff(charge, 'app'));
			this.registerMultipleCapabilityListener(['charge_target_slow', 'charge_target_fast'], async (values) => {
				const slow = Number(values.charge_target_slow) || Number(this.getCapabilityValue('charge_target_slow'));
				const fast = Number(values.charge_target_fast) || Number(this.getCapabilityValue('charge_target_fast'));
				const targets = { slow, fast };
				this.setChargeTargets(targets, 'app');
			}, 10000);

			return Promise.resolve(this.listeners);
		} catch (error) {
			return Promise.reject(error);
		}
	}

}

module.exports = CarDevice;

/*
Kia Ceed ICE:
{
	"airCtrlOn":false,
	"engine":false,
	"doorLock":true,"doorOpen":{"frontLeft":0,"frontRight":0,"backLeft":0,"backRight":0},
	"trunkOpen":false,
	"airTemp":{"value":"01H","unit":0,"hvacTempType":1},
	"defrost":false,
	"lowFuelLight":false,
	"acc":false,
	"hoodOpen":false,
	"steerWheelHeat":0,
	"sideBackWindowHeat":0,
	"dte":{"value":405,"unit":1},
	"tirePressureLamp":{"tirePressureLampAll":0,"tirePressureLampFL":0,"tirePressureLampFR":0,"tirePressureLampRL":0,"tirePressureLampRR":0},
	"battery":{"batSoc":81,"batState":0},
	"time":"20210313185232"
}
2021-03-13 21:30:01 [log] [ManagerDrivers] [uvo] [0] {"latitude":51.589264,"longitude":5.340939,"altitude":0,"speed":{"value":0,"unit":0},"heading":0}
2021-03-13 21:30:01 [log] [ManagerDrivers] [uvo] [0] {"value":11440.5,"unit":1}
2021-03-13 21:30:01 [log] [ManagerDrivers] [uvo] [0] Error: out_of_range
    at Remote Process
 target_temperature 14.5

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
