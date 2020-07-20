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

const GenericDriver = require('../generic_driver.js');

const driverSpecifics = {
	driverId: 'uvo',
	deviceCapabilities: [
		'ignition',
		'odometer',
		'speed',
		'measure_battery.EV',
		'measure_battery.12V',
		'range',
		'location',
		'distance',
		'alarm_battery',
		'locked',
		'charging',
		'target_temperature',
		'defrost',
		'climate_control',
	],
};

class UvoDriver extends GenericDriver {
	onInit() {
		// this.log('driver onInit');
		this.ds = driverSpecifics;
		this.onDriverInit();
	}
}

module.exports = UvoDriver;
