/*
Copyright 2020 - 2022, Robin de Gruijter (gruijter@hotmail.com)

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
const Logger = require('./captureLogs');

class carApp extends Homey.App {

	onInit() {
		process.env.LOG_LEVEL = 'info'; // info or debug
		if (!this.logger) this.logger = new Logger({ name: 'log', length: 200, homey: this.homey });
		this.log('Hyundai and Kia app is running...');

		// register some listeners
		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error.message);
		});
		process.on('uncaughtException', (error) => {
			this.error('uncaughtException! ', error);
		});
		this.homey
			.on('unload', () => {
				this.log('app unload called');
				// save logs to persistant storage
				this.logger.saveLogs();
			})
			.on('memwarn', () => {
				this.log('memwarn!');
			});
		this.registerFlowListeners();
		// do garbage collection every 10 minutes
		// this.intervalIdGc = setInterval(() => {
		// 	global.gc();
		// }, 1000 * 60 * 10);

	}

	//  stuff for frontend API
	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		return this.logger.logArray;
	}

	remoteRefresh(query) {
		const devices = this.getAllDevices();
		devices.forEach((device) => {
			if (!device.settings.remote_force_secret || device.settings.remote_force_secret === '') return;
			if (query.secret !== device.settings.remote_force_secret) return;
			device.refreshStatus(true, 'cloud');
		});
	}

	// special stuff
	getAllDevices() {
		let devices = [];
		const drivers = this.homey.drivers.getDrivers();
		Object.keys(drivers).forEach((driverId) => {
			devices = devices.concat(drivers[driverId].getDevices());
		});
		return devices;
	}

	setHomeyLink(available, source) {	// call with device bound as this
		if (!available) {
			this.disabled = true;
			this.stopPolling();
			// this.flushQueue();
			this.log(`Homey live link has been disabled via ${source}`);
			this.setUnavailable(`Homey live link has been disabled via ${source}`);
		} else {
			this.disabled = false;
			this.setAvailable();
			this.log(`Homey live link has been enabled via ${source}`);
			this.startPolling(this.settings.pollInterval);
		}
		return Promise.resolve(true);
	}

	registerFlowListeners() {

		// action cards
		const forcePoll = this.homey.flow.getActionCard('force_refresh');
		forcePoll.registerRunListener((args) => args.device.refreshStatus(true, 'flow'));

		const chargingOff = this.homey.flow.getActionCard('charging_off');
		chargingOff.registerRunListener((args) => args.device.chargingOnOff(false, 'flow'));

		const chargingOn = this.homey.flow.getActionCard('charging_on');
		chargingOn.registerRunListener((args) => args.device.chargingOnOff(true, 'flow'));

		const acOff = this.homey.flow.getActionCard('ac_off');
		acOff.registerRunListener((args) => args.device.acOnOff(false, 'flow'));

		const acOn = this.homey.flow.getActionCard('ac_on');
		acOn.registerRunListener((args) => args.device.acOnOff(true, 'flow'));

		const defrostOff = this.homey.flow.getActionCard('defrost_off');
		defrostOff.registerRunListener((args) => args.device.defrostOnOff(false, 'flow'));

		const defrostOn = this.homey.flow.getActionCard('defrost_on');
		defrostOn.registerRunListener((args) => args.device.defrostOnOff(true, 'flow'));

		const setTargetTemp = this.homey.flow.getActionCard('set_target_temp');
		setTargetTemp.registerRunListener((args) => args.device.setTargetTemp(args.temp, 'flow'));

		const setChargeTargets = this.homey.flow.getActionCard('set_charge_targets');
		setChargeTargets.registerRunListener((args) => args.device.setChargeTargets(args, 'flow'));

		const setDestination = this.homey.flow.getActionCard('set_destination');
		setDestination.registerRunListener((args) => args.device.setDestination(args.destination, 'flow'));

		// condition cards
		const alarmBattery = this.homey.flow.getConditionCard('alarm_battery');
		alarmBattery.registerRunListener((args) => args.device.getCapabilityValue('alarm_batt'));

		const alarmTirePressure = this.homey.flow.getConditionCard('alarm_tire_pressure');
		alarmTirePressure.registerRunListener((args) => args.device.getCapabilityValue('alarm_tire_pressure'));

		const charging = this.homey.flow.getConditionCard('charging');
		charging.registerRunListener((args) => args.device.getCapabilityValue('charging'));

		const climateControl = this.homey.flow.getConditionCard('climate_control');
		climateControl.registerRunListener((args) => args.device.getCapabilityValue('climate_control'));

		const closedLocked = this.homey.flow.getConditionCard('closed_locked');
		closedLocked.registerRunListener((args) => args.device.getCapabilityValue('closed_locked'));

		const defrost = this.homey.flow.getConditionCard('defrost');
		defrost.registerRunListener((args) => args.device.getCapabilityValue('defrost'));

		const engine = this.homey.flow.getConditionCard('engine');
		engine.registerRunListener((args) => args.device.getCapabilityValue('engine'));

		const moving = this.homey.flow.getConditionCard('moving');
		moving.registerRunListener((args) => args.device.moving);

		const parked = this.homey.flow.getConditionCard('parked');
		parked.registerRunListener((args) => !args.device.getCapabilityValue('engine'));

		const homeyLinkOn = this.homey.flow.getActionCard('homey_link_on');
		homeyLinkOn.registerRunListener((args) => {
			const devices = this.getAllDevices();
			const device = devices.filter((dev) => dev.getData().id === args.device.id)[0];
			if (device) {
				this.setHomeyLink.call(device, true, 'flow');
			}
		});
		homeyLinkOn
			.getArgument('device')
			.registerAutocompleteListener(() => {
				const devices = this.getAllDevices();
				return devices.map((device) => (
					{
						name: device.getName(),
						id: device.getData().id,
					}
				));
			});

		const homeyLinkOff = this.homey.flow.getActionCard('homey_link_off');
		homeyLinkOff.registerRunListener((args) => {
			const devices = this.getAllDevices();
			const device = devices.filter((dev) => dev.getData().id === args.device.id)[0];
			if (device) {
				this.setHomeyLink.call(device, false, 'flow');
			}
		});
		homeyLinkOff
			.getArgument('device')
			.registerAutocompleteListener(() => {
				const devices = this.getAllDevices();
				return devices.map((device) => (
					{
						name: device.getName(),
						id: device.getData().id,
					}
				));
			});
	}

}

module.exports = carApp;
