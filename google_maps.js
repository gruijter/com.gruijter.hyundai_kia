/*
Copyright 2020 - 2024, Robin de Gruijter (gruijter@hotmail.com)

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

const apiHost = 'maps.googleapis.com';
const directionsEP = '/maps/api/directions/json?';

// Maps represents a session with the Google Maps API
class Maps {

	constructor(opts) {
		this.host = opts.host || apiHost;
		this.port = opts.port || 443;
		this.timeout = opts.timeout || 10000;
		this.lastResponse = undefined;
		this.apiKey = opts.apiKey;
		if (!opts.apiKey) throw Error('apiKey is required');
	}

	async directions({ origin, destination }) {
		try {
			const query = {
				key: this.apiKey,
				origin,
				destination,
				departure_time: 'now',
				units: 'metric', // imperial
				// alternatives: false,
				// mode: 'driving', // driving walking bicycling transit
				// avoid: 'tolls|highways|ferries',
			};
			const qString = qs.stringify(query);
			const path = `${directionsEP}${qString}`;
			const result = await this._makeRequest(path);
			return Promise.resolve(result);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async _makeRequest(path, message) {
		try {
			// const postData = message; // ? qs.stringify(message) : '';
			const postData = message ? JSON.stringify(message) : '';
			const headers = {
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
			if (!result.body) throw Error(result.statusCode);
			if (result.statusCode !== 200) throw Error(result.body);
			const json = JSON.parse(result.body);
			if (json.status !== 'OK') throw Error(result.body);
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

module.exports = Maps;

// https://developers.google.com/maps/documentation/directions/overview?hl=en
// https://developers.google.com/maps/documentation/directions/get-api-key

/*

{
	 "error_message" : "You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable Learn more at https://developers.google.com/maps/gmp-get-started",
	 "routes" : [],
	 "status" : "REQUEST_DENIED"
}

{
	 "geocoded_waypoints" : [
			{
				 "geocoder_status" : "OK",
				 "place_id" : "ChIJs_H-hDtuxkcRnr_8qQXTfJ0",
				 "types" : [ "locality", "political" ]
			},
			{
				 "geocoder_status" : "OK",
				 "place_id" : "ChIJU-nI0jhwxkcRZ7S43N65I2k",
				 "types" : [ "neighborhood", "political" ]
			}
	 ],
	 "routes" : [
			{
				 "bounds" : {
						"northeast" : {
							 "lat" : 52.1358291,
							 "lng" : 5.037361199999999
						},
						"southwest" : {
							 "lat" : 52.1030037,
							 "lng" : 5.0141895
						}
				 },
				 "copyrights" : "Map data ©2020",
				 "legs" : [
						{
							 "distance" : {
									"text" : "6.3 km",
									"value" : 6269
							 },
							 "duration" : {
									"text" : "11 mins",
									"value" : 654
							 },
							 "end_address" : "Vleuten, Utrecht, Netherlands",
							 "end_location" : {
									"lat" : 52.1091962,
									"lng" : 5.024604099999999
							 },
							 "start_address" : "Maarssen, Netherlands",
							 "start_location" : {
									"lat" : 52.1323585,
									"lng" : 5.016759299999999
							 },
							 "steps" : [
									{
										 "distance" : {
												"text" : "0.4 km",
												"value" : 389
										 },
										 "duration" : {
												"text" : "2 mins",
												"value" : 128
										 },
										 "end_location" : {
												"lat" : 52.1349049,
												"lng" : 5.0146292
										 },
										 "html_instructions" : "Head \u003cb\u003esouthwest\u003c/b\u003e on \u003cb\u003eReigerskamp\u003c/b\u003e",
										 "polyline" : {
												"points" : "gbe}Hwyr]Hb@?HAFAFKXGZIh@WvBAF_@f@MNOPQRML_@`@GBA@k@EE?C@IFQNONONOLOLG?EAaAc@EAEAQISIWKUM"
										 },
										 "start_location" : {
												"lat" : 52.1323585,
												"lng" : 5.016759299999999
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.2 km",
												"value" : 206
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 39
										 },
										 "end_location" : {
												"lat" : 52.1355431,
												"lng" : 5.0171136
										 },
										 "html_instructions" : "Turn \u003cb\u003eright\u003c/b\u003e to stay on \u003cb\u003eReigerskamp\u003c/b\u003e",
										 "maneuver" : "turn-right",
										 "polyline" : {
												"points" : "cre}Hmlr]Uo@Uo@Kc@Me@GQES]cA]cAM_@EMAS?G@GDW\\m@"
										 },
										 "start_location" : {
												"lat" : 52.1349049,
												"lng" : 5.0146292
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "72 m",
												"value" : 72
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 11
										 },
										 "end_location" : {
												"lat" : 52.1358291,
												"lng" : 5.0179655
										 },
										 "html_instructions" : "Turn \u003cb\u003eleft\u003c/b\u003e to stay on \u003cb\u003eReigerskamp\u003c/b\u003e",
										 "maneuver" : "turn-left",
										 "polyline" : {
												"points" : "cve}H}{r]BGBE_@mAa@oA"
										 },
										 "start_location" : {
												"lat" : 52.1355431,
												"lng" : 5.0171136
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "1.1 km",
												"value" : 1060
										 },
										 "duration" : {
												"text" : "2 mins",
												"value" : 90
										 },
										 "end_location" : {
												"lat" : 52.1281075,
												"lng" : 5.0267971
										 },
										 "html_instructions" : "Turn \u003cb\u003eright\u003c/b\u003e onto \u003cb\u003eVogelweg\u003c/b\u003e",
										 "maneuver" : "turn-right",
										 "polyline" : {
												"points" : "}we}Hias]?W@M?M@OlDeF|@sAlBsCDGDEzAcBzAaBFKBCHIBEp@}@pAuATURSDGDENQNQtDeErDcEDGDGlAkAZ]^W\\QZQHIBCLKRQfCcC"
										 },
										 "start_location" : {
												"lat" : 52.1358291,
												"lng" : 5.0179655
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.6 km",
												"value" : 566
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 50
										 },
										 "end_location" : {
												"lat" : 52.12401389999999,
												"lng" : 5.0316925
										 },
										 "html_instructions" : "Continue onto \u003cb\u003eFloraweg\u003c/b\u003e",
										 "polyline" : {
												"points" : "ugd}Hoxt]LMLOBEDERUPSNQdB}Bp@iAXg@Xg@p@iA|@iADEFE~AiB~AgBZ]vAaBxAaB"
										 },
										 "start_location" : {
												"lat" : 52.1281075,
												"lng" : 5.0267971
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.5 km",
												"value" : 546
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 46
										 },
										 "end_location" : {
												"lat" : 52.122802,
												"lng" : 5.0373317
										 },
										 "html_instructions" : "Turn \u003cb\u003eleft\u003c/b\u003e onto the ramp to \u003cb\u003e's-Hertogenbosch\u003c/b\u003e/\u003cwbr/\u003e\u003cb\u003e
										 	Amsterdam\u003c/b\u003e/\u003cwbr/\u003e\u003cb\u003eUtrecht\u003c/b\u003e",
										 "maneuver" : "ramp-left",
										 "polyline" : {
												"points" : "anc}Hawu]?OAOOi@Oi@wAsEcAgDAKAM?M@i@rAcBlCiD\\c@Zi@@APYJYHWNi@Lk@FUDKBCFEDAJ@HBV@"
										 },
										 "start_location" : {
												"lat" : 52.12401389999999,
												"lng" : 5.0316925
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.7 km",
												"value" : 696
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 65
										 },
										 "end_location" : {
												"lat" : 52.1172796,
												"lng" : 5.0325865
										 },
										 "html_instructions" : "Merge onto \u003cb\u003eN230\u003c/b\u003e",
										 "maneuver" : "merge",
										 "polyline" : {
												"points" : "ofc}Hizv]zAdAhAr@`CzAh@^f@^LHVP`BhANH~@t@fAz@LLjAdAbA`Ab@h@XXXX^^\\^FFFFHJB@HLB@DFRTz@z@"
										 },
										 "start_location" : {
												"lat" : 52.122802,
												"lng" : 5.0373317
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "1.7 km",
												"value" : 1740
										 },
										 "duration" : {
												"text" : "2 mins",
												"value" : 108
										 },
										 "end_location" : {
												"lat" : 52.1030037,
												"lng" : 5.0226196
										 },
										 "html_instructions" : "Continue straight onto \u003cb\u003eHaarrijnse Rading\u003c/b\u003e (signs for \u003cb\u003eVleuten\u003c/b\u003e)",
										 "maneuver" : "straight",
										 "polyline" : {
												"points" : "_db}Hu|u]JLRXj@j@n@j@?@@@PNJJJJh@d@h@d@JHLF@BBBb@Z~@v@NJHHRNTNZVHF@?TRhAt@^VbDvBpCnBPJHFnCpAv@Zx@\\fC`A@@@?~BbANFjDvAvIjDnFxBbC`Af@V^Rn@^v@n@tAvA@?v@dAFFNX~@`Bz@t@"
										 },
										 "start_location" : {
												"lat" : 52.1172796,
												"lng" : 5.0325865
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.1 km",
												"value" : 99
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 17
										 },
										 "end_location" : {
												"lat" : 52.10359949999999,
												"lng" : 5.021560900000001
										 },
										 "html_instructions" : "Turn \u003cb\u003eright\u003c/b\u003e onto \u003cb\u003eHindersteinlaan\u003c/b\u003e",
										 "maneuver" : "turn-right",
										 "polyline" : {
												"points" : "wj_}Hk~s]Op@CJO^a@t@W^Y^"
										 },
										 "start_location" : {
												"lat" : 52.1030037,
												"lng" : 5.0226196
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.7 km",
												"value" : 735
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 63
										 },
										 "end_location" : {
												"lat" : 52.1093767,
												"lng" : 5.026125299999999
										 },
										 "html_instructions" : "At the roundabout, take the \u003cb\u003e1st\u003c/b\u003e exit onto \u003cb\u003eDe Tol\u003c/b\u003e",
										 "maneuver" : "roundabout-right",
										 "polyline" : {
												"points" : "on_}Hwws]ECEAE?GBCGCIGMi@aAEEuByEs@qAy@eACE[UOMi@Wo@YeC}@cBu@eAa@aAa@kCgA{Ak@aBm@"
										 },
										 "start_location" : {
												"lat" : 52.10359949999999,
												"lng" : 5.021560900000001
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "0.1 km",
												"value" : 102
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 13
										 },
										 "end_location" : {
												"lat" : 52.1096951,
												"lng" : 5.0248634
										 },
										 "html_instructions" : "\u003cb\u003eDe Tol\u003c/b\u003e turns slightly \u003cb\u003eleft\u003c/b\u003e and becomes \u003cb\u003eGriendhoeve\u003c/b\u003e",
										 "polyline" : {
												"points" : "sr`}Hitt]O?EFEJCNGx@@JKhAMhA"
										 },
										 "start_location" : {
												"lat" : 52.1093767,
												"lng" : 5.026125299999999
										 },
										 "travel_mode" : "DRIVING"
									},
									{
										 "distance" : {
												"text" : "58 m",
												"value" : 58
										 },
										 "duration" : {
												"text" : "1 min",
												"value" : 24
										 },
										 "end_location" : {
												"lat" : 52.1091962,
												"lng" : 5.024604099999999
										 },
										 "html_instructions" : "Turn \u003cb\u003eleft\u003c/b\u003e onto \u003cb\u003eGulden Hoeve\u003c/b\u003e",
										 "maneuver" : "turn-left",
										 "polyline" : {
												"points" : "st`}Hklt]~An@BB"
										 },
										 "start_location" : {
												"lat" : 52.1096951,
												"lng" : 5.0248634
										 },
										 "travel_mode" : "DRIVING"
									}
							 ],
							 "traffic_speed_entry" : [],
							 "via_waypoint" : []
						}
				 ],
				 "overview_polyline" : {
			"points" : "gbe}Hwyr]Hl@CNSt@a@`Da@n@]`@_@`@g@d@m@CI@{@v@_@ZMA_Bq@k@UUMUo@a@sAUw@oA{DGa@@ODW\\m@FMaA}C@e@@]jFyHrB
			{C`BiBpB{Bt@cAfBkBn@s@~JcLrAsAZ]^Wx@c@LMvDoDj@q@`@e@dB}Bp@iAr@oAp@iA|@iALK~DqElEaFA_@_@sA{C{JCY@w@`FmGx@mAR[Tq@\\
			uALa@JIP?`@DdDxBjDzBnDdCdDhCnCfC|@bA~A`BxB~B^f@zAvA^^jB`Bv@j@lB|A|@n@~AhAbEnCbDzBxCxAzF|B|HbDfQdHjDxAnAr@v@n@tAvAx
			@dAV`@~@`Bz@t@S|@q@tAq@~@KEMBy@aBEEuByEs@qA}@kAk@c@yAq@eC}@cBu@gCcAgFsBaBm@O?KRKhA@JKhAMhA~An@BB"
				 },
				 "summary" : "Haarrijnse Rading",
				 "warnings" : [],
				 "waypoint_order" : []
			}
	 ],
	 "status" : "OK"
}

*/
