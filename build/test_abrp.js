'use strict';

const util = require('util');
const ABRP = require('./abrp_telemetry.js');

const apiKey = '3138880f-883a-4c37-a046-a8b2b8de1e67';
const apiKeyPlan = 'f4128c06-5e39-4852-95f9-3286712a9f3a';
const userToken = '91efb481-91ee-480a-97e1-d6ef02ba53b0';

const abrpOptions = {
	apiKey,
	userToken,
	apiKeyPlan,
};
const abrp = new ABRP(abrpOptions);

// abrp.getCarModels()
// 	.then((result) => console.log(util.inspect(result, true, 10, true)))
// 	.catch((error) => console.log(util.inspect(error, true, 10, true)));

// abrp.getLatestPlan()
// 	.then((result) => console.log(util.inspect(result, true, 10, true)))
// 	.catch((error) => console.log(util.inspect(error, true, 10, true)));

// abrp.getNextCharge()
// 	.then((result) => console.log(util.inspect(result, true, 10, true)))
// 	.catch((error) => console.log(util.inspect(error, true, 10, true)));

// test plan API

const planParams = {
	car_model: '3long',
	destinations: [{ address: 'Lund, Sweden' }, { address: 'Berlin, Germany' }],
	initial_soc_perc: 90,
};

const getChargersParams = {
	lat: 52,
	lon: 5,
	radius: 25000,
	types: 'ccs',
	limit: 5,
};

abrp.newSession()
	.then((result) => {
		console.log(util.inspect(result, true, 10, true));

		abrp.planLight(planParams)
			.then((res3) => console.log(util.inspect(res3, true, 10, true)))
			.catch((error) => console.log(util.inspect(error, true, 10, true)));

		abrp.getChargers(getChargersParams)
			.then((res3) => console.log(util.inspect(res3, true, 10, true)))
			.catch((error) => console.log(util.inspect(error, true, 10, true)));
	})

	.catch((error) => console.log(util.inspect(error, true, 10, true)));
