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

const https = require('https');
const qs = require('querystring');
// const util = require('util');

const _makeHttpsRequest = (options = {}) => new Promise((resolve, reject) => {
	const opts = options;
	opts.timeout = options.timeout || 5000;
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
		return reject(e);
	});
	req.on('timeout', () => {
		req.destroy();
	});
	req.end();
});

const reverseGeo = async (lat, lon) => {
	try {
		const query = {
			format: 'jsonv2', // [xml|json|jsonv2|geojson|geocodejson]
			// osm_type: 'N',	// [N|W|R] node / way / relation, preferred over lat,lon
			lat,	// The location to generate an address for
			lon,	// The location to generate an address for
			zoom: 18, // [0-18]	Level of detail required where 0 is country and 18 is house/building
			addressdetails: 1,	// [0|1] Include a breakdown of the address into elements
			email: 'gruijter@hotmail.com', // <valid email address> only used to contact you in the event of a problem, see Usage Policy
			// extratags: 1,	// [0|1] Include additional information in the result if available, e.g. wikipedia link, opening hours.
			// namedetails: 1,	// [0|1] Include a list of alternative names in the results. language variants, references, operator and brand
		};
		const headers = {
			'Content-Length': 0,
		};
		const options = {
			hostname: 'nominatim.openstreetmap.org',
			path: `/reverse?${qs.stringify(query)}`,
			headers,
			'User-Agent': 'Homey Hyundai_Kia',
			method: 'GET',
		};
		const result = await _makeHttpsRequest(options, '');
		if (result.statusCode !== 200 || result.headers['content-type'] !== 'application/json; charset=UTF-8') {
			throw Error(`reverse geo service error: ${result.statusCode}`);
		}
		const jsonData = JSON.parse(result.body);
		// console.log(util.inspect(jsonData, { depth: null, colors: true }));
		return Promise.resolve(jsonData);
	} catch (error) {
		return Promise.resolve(error);
	}
};

const test = () => {
	const testLocs = [[51.50667, -0.08713], [52.46760, 13.52803], [41.88980, 12.49124], [38.89734, -77.03655]];
	const resArray = testLocs.map((loc) => reverseGeo(loc[0], loc[1]));
	return Promise.all(resArray);
};

const getCarLocString = async (location) => {
	try {
		let local = '-?-';
		let address = '-?-';
		const loc = await reverseGeo(location.latitude, location.longitude);
		if (!loc.address) {	// no reverse geolocation available
			return Promise.resolve({ location, address });
		}
		// const countryCode = loc.address.country_code.toUpperCase();
		local = loc.address.city_district || loc.address.village || loc.address.town || loc.address.city
			|| loc.address.municipality || loc.address.county || loc.address.state_district || loc.address.state || loc.address.region;
		// locString = `${countryCode}${loc.address.postcode} ${local}`;
		// local = `${local}`;
		address = loc.display_name;
		return Promise.resolve({ local, address });
	} catch (error) {
		return Promise.reject(error);
	}
};

module.exports.test = test;
module.exports.reverseGeo = reverseGeo;
module.exports.getCarLocString = getCarLocString;

/*
addressdetails
Address details in the xml and json formats return a list of names together with a designation label. Per default the following labels may appear:

continent
country, country_code
region, state, state_district, county
municipality, city, town, village
city_district, district, borough, suburb, subdivision
hamlet, croft, isolated_dwelling
neighbourhood, allotments, quarter
city_block, residental, farm, farmyard, industrial, commercial, retail
road
house_number, house_name
emergency, historic, military, natural, landuse, place, railway, man_made, aerialway, boundary, amenity, aeroway, club, craft, leisure, office, mountain_pass, shop, tourism, bridge, tunnel, waterway

{ place_id: 81479432,
	licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
	osm_type: 'way',
	osm_id: 27687816,
	lat: '52.374028',
	lon: '4.91789314639283',
	display_name: 'Marinekazerne Amsterdam, Dijksgrachtkade, Oostelijke Eilanden, Amsterdam, Noord-Holland, Nederland, 1019BT, Nederland',
	address:
	 { address29: 'Marinekazerne Amsterdam',
		 road: 'Dijksgrachtkade',
		 neighbourhood: 'Oostelijke Eilanden',
		 suburb: 'Amsterdam',
		 city: 'Amsterdam',
		 state: 'Noord-Holland',
		 postcode: '1019BT',
		 country: 'Nederland',
		 country_code: 'nl' },
	boundingbox: [ '52.3725587', '52.3759276', '4.9143916', '4.9210072' ] }

{
	place_id: 235247644,
	licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
	osm_type: 'relation',
	osm_id: 124410,
	lat: '41.890224',
	lon: '12.49116833244149',
	display_name: 'Piazza del Colosseo, Rione XIX Celio, Municipio Roma I, Roma, Roma Capitale, Lazio, Italia',
	address: {
		road: 'Piazza del Colosseo',
		quarter: 'Rione XIX Celio',
		suburb: 'Municipio Roma I',
		city: 'Roma',
		county: 'Roma Capitale',
		state: 'Lazio',
		country: 'Italia',
		country_code: 'it'
	},
	boundingbox: [ '41.8893606', '41.8910905', '12.4908796', '12.4938184' ]
}

{
	place_id: 98155333,
	licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
	osm_type: 'way',
	osm_id: 43063205,
	lat: '52.46765655',
	lon: '13.527714596391501',
	display_name: 'Modellpark Berlin-Brandenburg, 81, An der Wuhlheide, Oberschöneweide, Treptow-Köpenick, Berlin, 12459, Deutschland',
	address: {
		tourism: 'Modellpark Berlin-Brandenburg',
		house_number: '81',
		road: 'An der Wuhlheide',
		suburb: 'Oberschöneweide',
		borough: 'Treptow-Köpenick',
		city: 'Berlin',
		postcode: '12459',
		country: 'Deutschland',
		country_code: 'de'
	},
	boundingbox: [ '52.4665429', '52.4685188', '13.5263966', '13.5292893' ]
}

{
	place_id: 224676065,
	licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
	osm_type: 'way',
	osm_id: 702285118,
	lat: '51.5039477',
	lon: '-0.09196511873755582',
	display_name: 'Roman Southwark, London Bridge, Borough, Southwark, London Borough of Southwark, City of London, Greater London, England, SE1 2PF, United Kingdom',
	address: {
		historic: 'Roman Southwark',
		road: 'London Bridge',
		quarter: 'Borough',
		suburb: 'Southwark',
		city: 'London Borough of Southwark',
		county: 'City of London',
		state_district: 'Greater London',
		state: 'England',
		postcode: 'SE1 2PF',
		country: 'United Kingdom',
		country_code: 'gb'
	},
	boundingbox: [ '51.5007496', '51.5072237', '-0.0973303', '-0.0862909' ]
}

{
	place_id: 279192455,
	licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
	osm_type: 'way',
	osm_id: 779232532,
	lat: '38.8974662',
	lon: '-77.03660175919836',
	display_name: 'Penn Quarter, Washington, District of Columbia, United States of America',
	address: {
		neighbourhood: 'Penn Quarter',
		city: 'Washington',
		county: 'Washington',
		state: 'District of Columbia',
		country: 'United States of America',
		country_code: 'us'
	},
	boundingbox: [ '38.8974521', '38.8974818', '-77.0366164', '-77.0365858' ]
}

*/
