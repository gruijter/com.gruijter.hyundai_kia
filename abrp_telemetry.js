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
// const util = require('util');

const apiHost = 'api.iternio.com';
const sendEP = '/1/tlm/send';
const getCarModelsEP = '/1/tlm/get_carmodels_list';
const getNextChargeEP = '/1/tlm/get_next_charge';
const setNextChargeEP = '/1/tlm/set_next_charge';
const getLatestPlanEP = '/1/tlm/get_latest_plan';

// ABRP_TLM represents a session to send live car telemetry to A Better Route Planner account
class ABRP_TLM {

	constructor(opts) {
		this.host = opts.host || apiHost;
		this.port = opts.port || 443;
		this.timeout = opts.timeout || 10000;
		this.lastResponse = undefined;
		this.apiKey = opts.apiKey;
		this.userToken = opts.userToken;
		if (!opts.apiKey) throw Error('apiKey is required');
	}

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
			if (json.status !== 'ok') throw Error(json);
			return Promise.resolve(json.result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	_makeHttpsRequest(options, postData, timeout) {
		return new Promise((resolve, reject) => {
			const req = https.request(options, (res) => {
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
				req.abort();
				this.lastResponse = e;	// e.g. ECONNREFUSED on wrong soap port or wrong IP // ECONNRESET on wrong IP
				return reject(e);
			});
			req.setTimeout(timeout || this.timeout, () => {
				req.abort();
			});
			// req.write(postData);
			req.end(postData);
		});
	}

}

module.exports = ABRP_TLM;
