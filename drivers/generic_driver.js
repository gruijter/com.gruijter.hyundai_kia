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
const Client = require('bluelinky');
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

const capabilitiesEV = ['target_temperature', 'charge_target_slow',	'charge_target_fast', 'refresh_status',
	'locked', 'defrost', 'climate_control',	'last_refresh',	'engine', 'closed_locked', 'location', 'distance',
	'etth', 'speed', 'range', 'charger', 'charging', 'odometer', 'alarm_tire_pressure', 'alarm_battery', 'measure_battery.EV',
	'measure_battery.12V', 'latitude', 'longitude'];

const capabilitiesPHEV = ['target_temperature', 'refresh_status', 'locked', 'defrost', 'climate_control',	'last_refresh',
	'engine', 'closed_locked', 'location', 'distance', 'etth', 'speed', 'range', 'charger', 'charging', 'odometer', 'alarm_tire_pressure',
	'alarm_battery', 'measure_battery.EV', 'measure_battery.12V', 'latitude', 'longitude'];

const capabilitiesNonEV = ['target_temperature', 'refresh_status', 'locked', 'defrost', 'climate_control', 'last_refresh',
	'engine', 'closed_locked', 'location', 'distance', 'etth', 'speed', 'range', 'odometer', 'alarm_tire_pressure', 'alarm_battery',
	'measure_battery.12V', 'latitude', 'longitude'];

const capabilitiesMap = {
	'Full EV': capabilitiesEV,
	PHEV: capabilitiesPHEV,
	'HEV/ICE': capabilitiesNonEV,
};

class CarDriver extends Homey.Driver {

	async onDriverInit() {
		this.log('onDriverInit');
	}

	onPair(session) {
		try {
			this.log('Pairing of new car started');

			let settings;
			let vehicles = [];

			session.setHandler('validate', async (data) => {
				this.log('validating credentials');
				settings = data;
				vehicles = [];

				if (settings.pin.length !== 4) {
					throw Error('Enter your 4 digit PIN');
				}

				const options = {
					username: settings.username,
					password: settings.password,
					pin: settings.pin,
					brand: 'kia',	// use Kia as default
					region: settings.region,
					deviceUuid: 'HomeyPair',
					autoLogin: true,
				};

				if (this.ds.driverId === 'bluelink') options.brand = 'hyundai';
				const client = new Client(options);

				const validated = await new Promise((resolve, reject) => {
					let cancelTimeout = false;
					client.on('error', async (error) => {
						cancelTimeout = true;
						this.error(error);
						reject(Error(`Login failed ${error}`));
					});
					client.on('ready', (veh) => {
						cancelTimeout = true;
						if (!veh || !Array.isArray(veh) || veh.length < 1) {
							this.error('No vehicles in this account!');
							reject(Error('No vehicles in this account!'));
							return;
						}
						veh[0].odometer()
							.then(() => {
								this.log('CREDENTIALS OK!');
								vehicles = veh;
								resolve(true);
							})
							.catch(() => {
								this.error('Incorrect PIN!');
								reject(Error('Incorrect PIN!'));
							});
					});
					setTimeoutPromise(15 * 1000, 'done waiting')	// login timeout
						.then(() => {
							if (cancelTimeout) return;
							this.error('Login timeout!');
							reject(Error('Login timeout'));
						});
				});
				return validated;
			});

			session.setHandler('list_devices', async () => {
				this.log('listing of devices started');
				const devices = vehicles.map(async (vehicle) => {
					const status = await vehicle.status({ refresh: false, parsed: false });
					const isEV = !!status.evStatus;
					const isICE = !!status.dte || !!status.fuelLevel;
					let engine = 'HEV/ICE';
					if (isEV && !isICE) engine = 'Full EV';
					if (isEV && isICE) engine = 'PHEV';
					return {
						name: vehicle.vehicleConfig.nickname,
						data: {
							id: vehicle.vehicleConfig.vin,
						},
						settings: {
							username: settings.username,
							password: settings.password,
							pin: settings.pin,
							region: settings.region,
							language: 'en',
							// pollInterval,
							nameOrg: vehicle.vehicleConfig.name,
							idOrg: vehicle.vehicleConfig.id,
							vin: vehicle.vehicleConfig.vin,
							regDate: vehicle.vehicleConfig.regDate.split(' ')[0],
							brandIndicator: vehicle.vehicleConfig.brandIndicator,
							generation: vehicle.vehicleConfig.generation,
							engine,
							level: '2.3.0',
							lat: Math.round(this.homey.geolocation.getLatitude() * 100000000) / 100000000,
							lon: Math.round(this.homey.geolocation.getLongitude() * 100000000) / 100000000,
						},
						capabilities: capabilitiesMap[engine],
					};
				});
				return Promise.all(devices);
			});

		} catch (error) {
			this.error(error);
		}

	}

}

module.exports = CarDriver;

/*
vehicleConfig: {
	nickname: 'NIRO',
	name: 'NIRO EV 19',
	regDate: '2020-07-01 12:00:00.000',
	brandIndicator: 'H',
	id: '40346e0c-144c-422d-a944-159a22f14ec8',
	vin: 'ABCD12EFG3451234',
	generation: '2020'
}

*/
