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
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

class CarDriver extends Homey.Driver {

	async onDriverInit() {
		this.log('onDriverInit');
		this.registerFlowListeners();
	}

	registerFlowListeners() {
		const forcePoll = this.homey.flow.getActionCard('force_poll');
		forcePoll.registerRunListener((args) => args.device.liveData(true, 'flow'));

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

	}

	onPair(session) {
		try {
			const deviceUuid = 'homeyPair';
			const regions = ['EU', 'CA', 'US'];
			let region = null;
			let {	username,	password, pin } = {};
			let vehicles = [];

			this.log('Pairing of new car started');

			session.setHandler('login', async (data) => {
				this.log('validating credentials');
				username = data.username;
				password = data.password;

				// auto check region
				region = null;
				const regionPromise = new Promise((resolve) => {
					regions.forEach(async (reg) => {
						// console.log(`checking ${reg}`);
						try {
							const options = {
								username,
								password,
								region: reg,
								deviceUuid,
								autoLogin: true,
							};
							let client;
							if (this.ds.driverId === 'bluelink') {
								client = new Bluelink(options);
							} else { client = new Uvo(options); }
							client.on('ready', () => {
								this.log('username/password OK!');
								this.log(`region is ${reg}`);
								region = reg;
								return resolve(reg);
							});
						} catch (error) {
							this.log(error);
						}
					});
					setTimeoutPromise(15 * 1000, 'done waiting')	// login timeout
						.then(() => resolve(null));
				});
				await regionPromise;
				if (region) return true;
				return false;
			});

			session.setHandler('pincode', async (pincode) => {
				pin = pincode.join('');
				if (pin.length !== 4) {
					throw Error('Enter your 4 digit PIN');
				}

				const options = {
					username,
					password,
					pin,
					region,
					deviceUuid,
					autoLogin: true,
				};
				let client;
				if (this.ds.driverId === 'bluelink') {
					client = new Bluelink(options);
				} else client = new Uvo(options);

				const loginResult = await new Promise((resolve, reject) => {
					client.on('ready', (veh) => {
						if (!veh || !Array.isArray(veh)) {
							this.error('No vehicles in this account!');
							reject(Error('No vehicles in this account!'));
							return;
						}
						veh[0].odometer()
							.then(() => {
								this.log('PIN OK!');
								vehicles = veh;
								resolve(true);
							})
							.catch(() => {
								this.error('Incorrect PIN!');
								reject(Error('Incorrect PIN!'));
							});
					});
					setTimeoutPromise(15 * 1000, 'done waiting')	// login timeout
						.then(() => resolve(false));
				});
				return loginResult;
			});

			session.setHandler('list_devices', () => {
				this.log('listing of devices started');
				const devices = vehicles.map((vehicle) => ({
					name: vehicle.vehicleConfig.nickname,
					data: {
						id: vehicle.vehicleConfig.vin,
					},
					settings: {
						username,
						password,
						pin,
						region,
						// pollInterval,
						nameOrg: vehicle.vehicleConfig.name,
						idOrg: vehicle.vehicleConfig.id,
						vin: vehicle.vehicleConfig.vin,
						regDate: vehicle.vehicleConfig.regDate.split(' ')[0],
						brandIndicator: vehicle.vehicleConfig.brandIndicator,
						generation: vehicle.vehicleConfig.generation,
						lat: this.homey.geolocation.getLatitude(),
						lon: this.homey.geolocation.getLongitude(),
					},
					capabilities: this.ds.deviceCapabilities,
				}));
				return devices;
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
