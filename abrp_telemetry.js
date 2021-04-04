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
along with com.gruijter.hyundai_kia.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const https = require('https');
const qs = require('querystring');
const crypto = require('crypto');
// const util = require('util');

const apiHost = 'api.iternio.com';

// Telemetry API endpoints
const sendEP = '/1/tlm/send';
const getCarModelsEP = '/1/tlm/get_carmodels_list';
const getNextChargeEP = '/1/tlm/get_next_charge';
const setNextChargeEP = '/1/tlm/set_next_charge';
const getLatestPlanEP = '/1/tlm/get_latest_plan';

// Planning API endpoints
const newSessionEP = '/1/session/new_session';
// const getSessionEP = '/1/session/get_session';
const getVehicleLibraryEP = '/1/get_vehicle_library';
const getChargersEP = '/1/get_chargers';
const getOutletTypesEP = '/1/get_outlet_types';
const getNetworksEP = '/1/get_networks';
const planEP = '/1/plan';
const planLightEP = '/1/plan_light';

// ABRP_TLM represents a session to send live car telemetry to A Better Route Planner account
class ABRP_TLM {

	constructor(opts) {
		this.host = opts.host || apiHost;
		this.port = opts.port || 443;
		this.timeout = opts.timeout || 10000;
		this.lastResponse = undefined;
		this.userToken = opts.userToken;
		this.apiKey = opts.apiKey;
		if (!opts.apiKey) throw Error('apiKey is required');

		this.apiKeyPlan = opts.apiKeyPlan || opts.apiKey;
		this.deviceId = crypto.randomBytes(32).toString('hex');
		this.cookie = undefined;
		this.sessionId = undefined;
	}

	// Telemetry API

	async send(data) {
		try {
			const body = {
				tlm: {
					utc: Math.round(Date.now() / 1000), // Current UTC timestamp (epoch) in seconds (note, not milliseconds!)
					soc: data.soc, // [SoC %]: State of Charge of the vehicle (what's displayed on the dashboard of the vehicle is preferred)
					speed: data.speed, // [km/h]: Vehicle speed
					lat: data.lat, // [degrees]: Current vehicle latitude
					lon: data.lon, //  [degrees]: Current vehicle longitude
					is_charging: data.charging, // [boolean or 1/0]: Determines vehicle state. 0 is not charging, 1 is charging
					is_dcfc: data.dcfc, // If is_charging, indicate if this is DC fast charging
				},
			};
			const path = `${sendEP}?tlm=${JSON.stringify(body.tlm)}&token=${this.userToken}`;
			const result = await this._makeRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getCarModels() {
		try {
			const path = getCarModelsEP;
			const result = await this._makeRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async setNextCharge(level) {
		try {
			const body = { next_charge_to_perc: level };
			const path = `${setNextChargeEP}?token=${this.userToken}`;
			const result = await this._makeRequest(path, body);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getNextCharge() {
		try {
			const path = `${getNextChargeEP}?token=${this.userToken}`;
			const result = await this._makeRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getLatestPlan() {
		try {
			const path = `${getLatestPlanEP}?token=${this.userToken}`;
			const result = await this._makeRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// Planning API

	async newSession() {
		try {
			const body = { platform: 'ios', device_id: this.deviceId };
			const path = `${newSessionEP}`;
			const result = await this._makeSessionRequest(path, body);
			this.sessionId = result;
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// async getSession() {
	// 	try {
	// 		const body = {
	// 			client: 'abrp-ios', version: 345, variant: 'default',
	// 		};
	// 		const path = `${getSessionEP}?session_id=${this.sessionId}`;
	// 		const result = await this._makeSessionRequest(path, body);
	// 		return Promise.resolve(result);
	// 	} catch (error) {
	// 		return Promise.reject(error);
	// 	}
	// }

	async getVehicleLibrary() {
		try {
			const path = `${getVehicleLibraryEP}?session_id=${this.sessionId}`;
			const result = await this._makeSessionRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getChargers(parameters) {	// { lat, lon, radius, types, limit, allowed_dbs }
		try {
			const query = parameters || {};
			Object.keys(query).forEach((param) => {
				if (typeof query[param] === 'object') {
					query[param] = JSON.stringify(query[param]);
				}
			});
			const path = `${getChargersEP}?session_id=${this.sessionId}&${qs.stringify(query)}`;
			const result = await this._makeSessionRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getOutletTypes() {
		try {
			const path = `${getOutletTypesEP}?session_id=${this.sessionId}`;
			const result = await this._makeSessionRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getNetworks() {
		try {
			const path = `${getNetworksEP}?session_id=${this.sessionId}`;
			const result = await this._makeSessionRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async plan(parameters) { // see https://tinyurl.com/ynskkxed
		try {
			const query = parameters || {};
			Object.keys(query).forEach((param) => {
				if (typeof query[param] === 'object') {
					query[param] = JSON.stringify(query[param]);
				}
			});
			const path = `${planEP}?session_id=${this.sessionId}&${qs.stringify(query)}`;
			const result = await this._makeSessionRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async planLight(parameters) {	// { car_model, destinations, initial_soc_perc }
		try {
			const query = parameters || {};
			Object.keys(query).forEach((param) => {
				if (typeof query[param] === 'object') {
					query[param] = JSON.stringify(query[param]);
				}
			});
			const path = `${planLightEP}?session_id=${this.sessionId}&${qs.stringify(query)}`;
			const result = await this._makeSessionRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// HTTP request stuff

	async _makeSessionRequest(path, message) {
		try {
			const postData = message ? qs.stringify(message) : '';
			// const postData = message ? JSON.stringify(message) : '';
			const headers = {
				Authorization: `APIKEY ${this.apiKeyPlan}`,
				'Content-Type': 'multipart/form-data',
				'content-length': Buffer.byteLength(postData),
				connection: 'Keep-Alive',
			};
			if (this.cookie) headers.cookie = this.cookie;
			const options = {
				hostname: this.host,
				port: this.port,
				path,
				headers,
				method: 'POST',
			};
			const result = await this._makeHttpsRequest(options, postData);
			if (result.statusCode !== 200 || !result.body) {
				throw Error(`${result.statusCode} ${result.body}`);
			}
			const json = JSON.parse(result.body);
			if (!json.result || json.status !== 'ok') throw Error(result.body);
			if (result.headers['set-cookie']) this.cookie = result.headers['set-cookie'];
			return Promise.resolve(json.result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async _makeRequest(path, message) {
		try {
			const postData = message ? qs.stringify(message) : '';
			// const postData = message ? JSON.stringify(message) : '';
			const headers = {
				Authorization: `APIKEY ${this.apiKey}`,
				'content-length': Buffer.byteLength(postData),
				connection: 'Keep-Alive',
				'Content-Type': 'multipart/form-data', // 'application/json',
			};
			const options = {
				hostname: this.host,
				port: this.port,
				path,
				headers,
				method: 'POST',
			};
			const result = await this._makeHttpsRequest(options, postData);
			if (result.statusCode !== 200 || !result.body) {
				throw Error(`${result.statusCode} ${result.body}`);
			}
			const json = JSON.parse(result.body);
			if (json.status !== 'ok') throw Error(result.body);
			return Promise.resolve(json.result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	_makeHttpsRequest(options, postData, timeout) {
		return new Promise((resolve, reject) => {
			const opts = options;
			opts.timeout = timeout || this.timeout;
			const req = https.request(opts, (res) => {
				let resBody = '';
				res.on('data', (chunk) => {
					resBody += chunk;
				});
				res.once('end', () => {
					if (!res.complete) {
						return reject(Error('The connection was terminated while the message was still being sent'));
					}
					res.body = resBody;
					return resolve(res); // resolve the request
				});
			});
			req.on('error', (e) => {
				req.destroy();
				this.lastResponse = e;	// e.g. ECONNREFUSED on wrong soap port or wrong IP // ECONNRESET on wrong IP
				return reject(e);
			});
			req.on('timeout', () => {
				req.destroy();
			});
			// req.write(postData);
			req.end(postData);
		});
	}

}

module.exports = ABRP_TLM;

/*
{
  plan_uuid: '03d395e2-ecee-4b07-873b-5c3bdca4a1a0',
  plan_url: 'https://abetterrouteplanner.com/?plan_uuid=03d395e2-ecee-4b07-873b-5c3bdca4a1a0',
  car_model: '3long',
  routes: [
    {
      steps: [
        {
          name: 'Lund, Sweden',
          id: 4010717,
          lat: 55.70664,
          lon: 13.1876,
          utc_offset: 7200,
          wp_type: 0,
          is_charger: false,
          is_station: false,
          is_end_station: false,
          charger_type: 0,
          is_waypoint: true,
          is_new_waypoint: false,
          waypoint_idx: 0,
          is_amenity_charger: false,
          is_destcharger: false,
          arrival_perc: 90,
          departure_perc: 90,
          departure_duration: 25694,
          departure_dist: 485872,
          arrival_dist: 485872,
          arrival_duration: 25694,
          max_speed: 41.666666666666664,
          is_mod_speed: false,
          is_valid_step: true,
          country_3: 'SWE',
          region: 'europe',
          stay_duration: 0,
          drive_duration: 6086,
          wait_duration: 0,
          drive_dist: 166576
        },
        {
          name: 'Nørre Alslev Supercharger [Tesla]',
          id: 201,
          lat: 54.899885,
          lon: 11.89693,
          utc_offset: 7200,
          wp_type: 0,
          is_charger: true,
          is_station: false,
          is_end_station: false,
          charger_type: 'SC',
          is_waypoint: false,
          is_new_waypoint: false,
          is_amenity_charger: false,
          is_destcharger: false,
          arrival_perc: 50,
          departure_perc: 84,
          departure_duration: 18490,
          departure_dist: 319295,
          arrival_dist: 319295,
          arrival_duration: 19580,
          max_speed: 41.666666666666664,
          is_mod_speed: false,
          is_valid_step: true,
          country_3: 'DNK',
          region: 'europe',
          stay_duration: 1090,
          charge_duration: 1090,
          charge_energy: 24.38279944095033,
          charge_cost: 63.39527854647085,
          charge_cost_currency: 'DKK',
          charger: {
            name: 'Nørre Alslev Supercharger [Tesla]',
            id: 201,
            address: 'Cargo Syd\n4 Cargovej\nNørre Alslev, Denmark 4840',
            lat: 54.899885,
            lon: 11.89693,
            url: 'https://www.tesla.com/findus/location/supercharger/norrealslevsupercharger',
            comment: '',
            status: 'OPEN',
            region: 'europe',
            country_3: 'DNK',
            network_id: 1,
            network_name: 'Tesla',
            network_icon: 'tesla.png',
            outlets: [
              {
                type: 'SC',
                stalls: 8,
                power: 150,
                status: 'OPERATIONAL'
              },
              {
                type: 'tesla_ccs',
                stalls: 8,
                power: 150,
                status: 'OPERATIONAL'
              },
              [length]: 2
            ],
            locationid: 'tesla_norrealslevsupercharger'
          },
          drive_duration: 2100,
          wait_duration: 0,
          drive_dist: 40898
        },
        {
          name: 'Gedser Landevej, 4874 Gedser, Danmark',
          id: 4281952,
          lat: 54.573907,
          lon: 11.924458,
          utc_offset: 7200,
          wp_type: 0,
          is_charger: false,
          is_station: true,
          is_end_station: false,
          charger_type: 0,
          is_waypoint: false,
          is_new_waypoint: false,
          is_amenity_charger: false,
          is_destcharger: false,
          arrival_perc: 77,
          departure_perc: 77,
          departure_duration: 14574,
          departure_dist: 278397,
          arrival_dist: 278397,
          arrival_duration: 16389,
          max_speed: 0,
          is_mod_speed: false,
          is_valid_step: true,
          country_3: 'DNK',
          region: 'europe',
          stay_duration: 1815,
          drive_duration: 6282,
          wait_duration: 1815,
          drive_dist: 48376
        },
        {
          name: 'Am Warnowkai, 18147 Rostock, Deutschland',
          id: 2607289,
          lat: 54.15268,
          lon: 12.10113,
          utc_offset: 7200,
          wp_type: 0,
          is_charger: false,
          is_station: false,
          is_end_station: true,
          charger_type: 0,
          is_waypoint: false,
          is_new_waypoint: false,
          is_amenity_charger: false,
          is_destcharger: false,
          arrival_perc: 77,
          departure_perc: 77,
          departure_duration: 7388,
          departure_dist: 230021,
          arrival_dist: 230021,
          arrival_duration: 8291,
          max_speed: 41.666666666666664,
          is_mod_speed: false,
          is_valid_step: true,
          country_3: 'DEU',
          region: 'europe',
          stay_duration: 903,
          drive_duration: 7371,
          wait_duration: 903,
          drive_dist: 230021
        },
        {
          name: 'Berlin, Germany',
          id: 8168,
          lat: 52.5200066,
          lon: 13.404954,
          utc_offset: 7200,
          wp_type: 0,
          is_charger: false,
          is_station: false,
          is_end_station: false,
          charger_type: 0,
          is_waypoint: true,
          is_new_waypoint: false,
          waypoint_idx: 1,
          is_amenity_charger: false,
          is_destcharger: false,
          arrival_perc: 10,
          departure_perc: 10,
          departure_duration: 0,
          departure_dist: 0,
          arrival_dist: 0,
          arrival_duration: 0,
          max_speed: 41.666666666666664,
          is_mod_speed: false,
          is_valid_step: true,
          country_3: 'DEU',
          region: 'europe',
          stay_duration: 0
        },
        [length]: 5
      ],
      total_dist: 485872,
      total_charge_duration: 1090,
      total_drive_duration: 24557,
      total_drive_distance: 437364.5654909611,
      average_consumption: 186.03383418949477,
      total_energy_used: 81.36479309074008,
      is_valid_route: true
    },
    [length]: 1
  ],
  plan_log_id: 111144896
}
*/
