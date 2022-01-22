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
along with com.gruijter.hyundai_kia.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const https = require('https');
// const qs = require('querystring');
// const util = require('util');

const apiHost = 'api-ssl.bitly.com';
const shortenEP = '/v4/shorten';

// Bitly represents a session to create a small URL
class Bitly {

	constructor(opts) {
		this.host = opts.host || apiHost;
		this.port = opts.port || 443;
		this.timeout = opts.timeout || 10000;
		this.lastResponse = undefined;
		this.apiKey = opts.apiKey;
		if (!opts.apiKey) throw Error('apiKey is required');
	}

	async shorten(longURL) {
		try {
			const body = {
				// group_guid: 'Ba1bc23dE4F',
				// domain: 'bit.ly',
				long_url: longURL,
			};
			const path = shortenEP;
			const result = await this._makeRequest(path, body);
			return Promise.resolve(result.link);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async _makeRequest(path, message) {
		try {
			// const postData = message; // ? qs.stringify(message) : '';
			const postData = message ? JSON.stringify(message) : '';
			const headers = {
				Authorization: `Bearer ${this.apiKey}`,
				'content-length': Buffer.byteLength(postData),
				connection: 'Keep-Alive',
				'Content-Type': 'application/json',
			};
			const options = {
				hostname: this.host,
				port: this.port,
				path,
				headers,
				method: 'POST',
			};
			const result = await this._makeHttpsRequest(options, postData);
			if ((result.statusCode !== 200 && result.statusCode !== 201) || !result.body) throw Error(result.body || result.statusCode);
			const json = JSON.parse(result.body);
			if (!json.link) throw Error(json);
			return Promise.resolve(json);
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

module.exports = Bitly;

/*

{
	"created_at":"2020-08-24T12:59:47+0000",
	"id":"bit.ly/3hsAAaP",
	"link":"https://bit.ly/3hsAAaP",
	"custom_bitlinks":[],
	"long_url":"https://www.google.com/",
	"archived":false,
	"tags":[],
	"deeplinks":[],
	"references": { "group":"https://api-ssl.bitly.com/v4/groups/Bk8oceqnWmo" }
}

*/
