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
const Logger = require('./captureLogs.js');

class carApp extends Homey.App {

	onInit() {
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

	forceLive(query) {
		const devices = this.getAllDevices();
		devices.forEach((device) => device.forceLive(query.secret));
		// const drivers = this.homey.drivers.getDrivers();
		// Object.keys(drivers).forEach((driverId) => {
		// 	const devices = drivers[driverId].getDevices();
		// 	devices.forEach((device) => {
		// 		device.forceLive(query.secret);
		// 	});
		// });
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
