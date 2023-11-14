'use strict';

const util = require('util');
const Maps = require('./google_maps.js');

const geo = require('./nomatim.js');

geo.test()
	.then((result) => console.log(util.inspect(result, true, 10, true)))
	.catch((error) => console.log(util.inspect(error, true, 10, true)));

// Harmelen
const location1 = {
	latitude: 52.0899142,
	longitude: 4.9856795,
	altitude: 0,
	speed: { unit: 0, value: 0 },
	heading: 146,
};

// Vleuten
const location2 = {
	latitude: 52.092742,
	longitude: 5.001092,
	altitude: 0,
	speed: { unit: 1, value: 0 },
	heading: 146,
};

// Maarssen
const location3 = {
	latitude: 52.142972,
	longitude: 5.03828,
	altitude: 0,
	speed: { unit: 1, value: 0 },
	heading: 146,
};

geo.getCarLocString(location1)
	.then((result) => console.log(util.inspect(result, true, 10, true)))
	.catch((error) => console.log(util.inspect(error, true, 10, true)));

geo.reverseGeo(location2.latitude, location2.longitude)
	.then((result) => console.log(util.inspect(result, true, 10, true)))
	.catch((error) => console.log(util.inspect(error, true, 10, true)));

geo.getCarLocString(location3)
	.then((result) => console.log(util.inspect(result, true, 10, true)))
	.catch((error) => console.log(util.inspect(error, true, 10, true)));

geo.search('52.0923217,5.0012904')
	.then((result) => console.log(util.inspect(result, true, 10, true)))
	.catch((error) => console.log(util.inspect(error, true, 10, true)));

// const options = {
// 	apiKey: '',
// };
// const maps = new Maps(options);

// // 52.142978,5.037636
// maps.directions({ origin: 'maarssen nl', destination: 'vleuten nl' })
// 	.then((result) => console.log(util.inspect(result, true, 10, true)))
// 	.catch((error) => console.log(util.inspect(error, true, 10, true)));

/*
{
	geocoded_waypoints: [
		{
			geocoder_status: 'OK',
			place_id: 'ChIJ43jw6ZJlxkcRdkR01fyF76g',
			types: [ 'street_address', [length]: 1 ]
		},
		{
			geocoder_status: 'OK',
			place_id: 'ChIJ1x_ZB3NwxkcRWamSPEEZYT8',
			types: [ 'street_address', [length]: 1 ]
		},
		[length]: 2
	],
	routes: [
		{
			bounds: {
				northeast: { lat: 52.0930015, lng: 5.103676500000001 },
				southwest: { lat: 52.0684664, lng: 5.001250799999999 }
			},
			copyrights: 'Map data ©2020',
			legs: [
				{
					distance: { text: '10.4 km', value: 10396 },
					duration: { text: '16 mins', value: 952 },
					duration_in_traffic: { text: '15 mins', value: 914 },
					end_address: 'Bergamotteperenlaan 9, 3452 DK Utrecht, Netherlands',
					end_location: { lat: 52.0927519, lng: 5.001250799999999 },
					start_address: 'Beneluxlaan 924A, 3526 KJ Utrecht, Netherlands',
					start_location: { lat: 52.068698, lng: 5.103676500000001 },
					steps: [
						{
							distance: { text: '85 m', value: 85 },
							duration: { text: '1 min', value: 49 },
							end_location: { lat: 52.0685246, lng: 5.1025472 },
							html_instructions: 'Head <b>southwest</b> on <b>Koeriersterlaan</b> toward <b>Beneluxlaan</b>',
							polyline: { points: 'ktx|H_yc^Rt@Pv@DN@F?D?F?D?B?F?HAJ?DCHCT' },
							start_location: { lat: 52.068698, lng: 5.103676500000001 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.7 km', value: 699 },
							duration: { text: '1 min', value: 75 },
							end_location: { lat: 52.07397599999999, lng: 5.097458 },
							html_instructions: 'Turn <b>right</b> onto <b>Beneluxlaan</b>',
							maneuver: 'turn-right',
							polyline: {
								points: 'gsx|H}qc^wLzKaBzAaBxAcA~@cA|@yCrC_@ZMLwAnAYTA@CB'
							},
							start_location: { lat: 52.0685246, lng: 5.1025472 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.3 km', value: 265 },
							duration: { text: '1 min', value: 44 },
							end_location: { lat: 52.073192, lng: 5.0940889 },
							html_instructions: 'Turn <b>left</b> onto <b>Churchilllaan</b>',
							maneuver: 'turn-left',
							polyline: {
								points: 'kuy|Hcrb^AHABGLGJGTANATCNJ^\\tAr@lCj@`Ch@tBDVFX'
							},
							start_location: { lat: 52.07397599999999, lng: 5.097458 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.9 km', value: 869 },
							duration: { text: '1 min', value: 83 },
							end_location: { lat: 52.0693182, lng: 5.0830994 },
							html_instructions: 'At the roundabout, take the <b>2nd</b> exit and stay on <b>Churchilllaan</b>',
							maneuver: 'roundabout-right',
							polyline: {
								points: 'mpy|Ha}a^?@?@?@A@?@?@@B?@?B?@?B@B?@?B@D@FBDBD@DBBDBBBLh@BFTn@@BFVDPRr@Pv@h@lBBH\\zAfAnEDRZlAT~@?@Rr@?BVbAHZt@vC`@bBV`ADN?@Tx@?@?@FT\\vAV~@Nh@Pr@b@`BLd@h@tBPp@ZtAFb@Hb@'
							},
							start_location: { lat: 52.073192, lng: 5.0940889 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.1 km', value: 129 },
							duration: { text: '1 min', value: 19 },
							end_location: { lat: 52.06868859999999, lng: 5.0815177 },
							html_instructions: 'Continue straight onto <b>Taatsenplein</b>',
							maneuver: 'straight',
							polyline: { points: 'gxx|Hkx_^Lb@lBrG@B' },
							start_location: { lat: 52.0693182, lng: 5.0830994 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.4 km', value: 384 },
							duration: { text: '1 min', value: 43 },
							end_location: { lat: 52.0716688, lng: 5.078689 },
							html_instructions: 'Turn <b>right</b> onto <b>Orteliuslaan</b>',
							maneuver: 'turn-right',
							polyline: {
								points: 'itx|Hon_^ABMJMNo@h@m@f@YVUXMFIHIHGFgA`AgAbAKLMJcB~AcB~AEFED'
							},
							start_location: { lat: 52.06868859999999, lng: 5.0815177 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.7 km', value: 689 },
							duration: { text: '1 min', value: 68 },
							end_location: { lat: 52.0748483, lng: 5.0716871 },
							html_instructions: 'Turn <b>left</b> onto <b>Marinus van Tyruslaan</b>/<wbr/><b>Marinus van Tyrusviaduct</b><div style="font-size:0.9em">Continue to follow Marinus van Tyrusviaduct</div>',
							maneuver: 'turn-left',
							polyline: {
								points: '}fy|Hy|~]?X?R@THVPt@Rx@Jl@BN?ZANAJEVCNCLMVMTMPUNSL[Le@LgA\\_AZC@]La@RIDKHKJKLINKPKVKZOn@m@pCERIVERMn@GTGTO`@_@hAYfAI\\Qt@Mb@G\\'
							},
							start_location: { lat: 52.0716688, lng: 5.078689 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.3 km', value: 313 },
							duration: { text: '1 min', value: 28 },
							end_location: { lat: 52.0726907, lng: 5.0691593 },
							html_instructions: 'Turn <b>left</b> onto <b>Stadsbaan Leidsche Rijn</b>',
							maneuver: 'turn-left',
							polyline: {
								points: 'yzy|Haq}]Ch@FBHBJBLBd@Pb@N\\PVP`A|@l@|@RZP^FJFLLVJZJXJZLVHJFHNN'
							},
							start_location: { lat: 52.0748483, lng: 5.0716871 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '5.2 km', value: 5157 },
							duration: { text: '6 mins', value: 354 },
							end_location: { lat: 52.0802133, lng: 5.001844699999999 },
							html_instructions: 'Continue onto <b>C.H. Letschertweg</b>/<wbr/><b>N198</b>',
							polyline: {
								points: 'imy|Hga}]HHLDFBLBbBd@bBd@v@XnB`Ah@^z@x@fAfB|@`C`@fBDVDRFZHf@BXFf@B\\B\\Dt@Bd@@V@P?^?p@?P?FAp@Ah@Cf@Cd@El@I~@M`Bm@jHk@zGg@`G
								[pDGd@KdAI~@CNMzAShCSlCGn@Ep@OnBqAxOCj@qA~OuAfPGb@E\\Kv@A?A?A@A?A@A??@A@A@?@A??@A@?@?@A@?@?@A@?@?B?B?@?@?@?@?@?@@@?B?@?@@@?@@@?@@@?@@
								??@@@IbB?Vs@tIa@`Fk@zGo@|HGZk@jG}@zIKfAa@dEUrBIj@CRCTGb@o@~Fi@`FS`B_@`DS`BWdCAJCRCVGb@ALEf@Ap@@d@@b@Ht@Jp@Jb@Pt@h@~BD\\@DDp@Bj@?ZAZAXC
								`@?@@JWxCMxA?@Ip@KhAOtAS|BIv@_@hDOzAKdAk@dFKt@Iv@WnBa@jDUfBgAfIiC`S[`C[vBOlAg@~DKv@QlAS~AQpASrAQv@Yx@e@|@a@j@[X[Ti@TOFu@f@WTEBIFc@^{@z@'
							},
							start_location: { lat: 52.0726907, lng: 5.0691593 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.5 km', value: 475 },
							duration: { text: '1 min', value: 35 },
							end_location: { lat: 52.084298, lng: 5.0034223 },
							html_instructions: 'At the roundabout, take the <b>1st</b> exit onto <b>Veldhuizerweg</b>/<wbr/><b>N198</b>',
							maneuver: 'roundabout-right',
							polyline: {
								points: 'i|z|Ho|o]CACAAAC?C?A?C@C@KKg@w@QS?A[]WQ[KQGSG_ASSE_BQsBWOA{@M}@Is@MSECAEAWGQGk@M'
							},
							start_location: { lat: 52.0802133, lng: 5.001844699999999 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.9 km', value: 928 },
							duration: { text: '1 min', value: 74 },
							end_location: { lat: 52.0923081, lng: 5.006003 },
							html_instructions: 'At the roundabout, continue straight onto <b>Veldhuizerweg</b>',
							maneuver: 'roundabout-right',
							polyline: {
								points: '{u{|Hkfp]?C?AAC?A?AAC?AAA?AACAA?AAACAAAAAA?A?AAA?A?A?A@A?A??@A?A@A@A@A@?@A@A@?@AB?@A@?B?@?BA@?B?@[@WAy@COCWEwG}@m@IYEmCa@WEqAW[I]KSEe@MeA[qEsA_Bg@c@SMGMEs@]s@[y@a@w@a@ICIE'
							},
							start_location: { lat: 52.084298, lng: 5.0034223 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.2 km', value: 196 },
							duration: { text: '1 min', value: 22 },
							end_location: { lat: 52.0929454, lng: 5.0034772 },
							html_instructions: 'Turn <b>left</b> onto <b>Landschapsbaan</b>',
							maneuver: 'turn-left',
							polyline: { points: '}g}|Hovp]GCICCRCPq@lFs@jF' },
							start_location: { lat: 52.0923081, lng: 5.006003 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '33 m', value: 33 },
							duration: { text: '1 min', value: 10 },
							end_location: { lat: 52.0926615, lng: 5.0033343 },
							html_instructions: 'Turn <b>left</b> onto <b>Conferenceperenlaan</b>',
							maneuver: 'turn-left',
							polyline: { points: '}k}|Hwfp]HBFBHDHBHDHD' },
							start_location: { lat: 52.0929454, lng: 5.0034772 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '0.1 km', value: 120 },
							duration: { text: '1 min', value: 26 },
							end_location: { lat: 52.0930015, lng: 5.00166 },
							html_instructions: 'Turn <b>right</b> to stay on <b>Conferenceperenlaan</b>',
							maneuver: 'turn-right',
							polyline: { points: 'cj}|Hyep]MbAObAQ`BSbB' },
							start_location: { lat: 52.0926615, lng: 5.0033343 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '36 m', value: 36 },
							duration: { text: '1 min', value: 19 },
							end_location: { lat: 52.0926953, lng: 5.0015022 },
							html_instructions: 'Turn <b>left</b> onto <b>Bergamotteperenlaan</b>',
							maneuver: 'turn-left',
							polyline: { points: 'gl}|Hk{o]XJXLB@BB' },
							start_location: { lat: 52.0930015, lng: 5.00166 },
							travel_mode: 'DRIVING'
						},
						{
							distance: { text: '18 m', value: 18 },
							duration: { text: '1 min', value: 3 },
							end_location: { lat: 52.0927519, lng: 5.001250799999999 },
							html_instructions: 'Turn <b>right</b> to stay on <b>Bergamotteperenlaan</b><div style="font-size:0.9em">Destination will be on the left</div>',
							maneuver: 'turn-right',
							polyline: { points: 'kj}|Hkzo]Ip@' },
							start_location: { lat: 52.0926953, lng: 5.0015022 },
							travel_mode: 'DRIVING'
						},
						[length]: 16
					],
					traffic_speed_entry: [ [length]: 0 ],
					via_waypoint: [ [length]: 0 ]
				},
				[length]: 1
			],
			overview_polyline: {
				points: 'ktx|H_yc^l@dC?VAb@G^yOvNcKjJ_DnCEDCLOXId@Ed@h@tBnC|KDb@BVFVNRj@dBb@`B|AjG~BpJdDvMxA|FrAdFz@fDb@xBVfAnBvGmAhAgA~@c@`@cB
				|AeE|DiBfBED?X@h@ZlA^fBBj@CZIf@Qd@[f@i@\\aAZkCz@_A`@UNWXU`@Wr@}@`Ec@nB_AvCcA~DKfAPFbBh@t@b@`A|@l@|@d@z@NXp@hBVb@VXVNTFfEjAv@XnB
				`Ah@^z@x@fAfB|@`Cf@~BLn@XfCNpC@tBGjCa@tF}Cz^a@zD}@bLU`DqAxOCj@gDfa@M`AKv@C?C@IHEN?RBNBF@@GdB?Vs@tImA|No@|HGZiBfRm@lG_@~C_AlIsCd
				WIp@GxABhATfB\\xAn@|CFv@BfAGvA@Le@rFe@rEmAzLmAxKwCjUkHnj@e@dDk@pBgAhBw@n@y@\\mA|@oBfBMEMBs@cAQUs@o@m@SsA[sBW}Fq@qAWuAa@ESOOO?KL
				ETAD?@[@qAEOCwJsAeDg@mBa@}C{@qH{Bq@[oDaBsAo@ICCRu@~Fs@jFHBPHRHHDMbAa@dDSbBXJ\\NBBIp@'
			},
			summary: 'N198',
			warnings: [ [length]: 0 ],
			waypoint_order: [ [length]: 0 ]
		},
		[length]: 1
	],
	status: 'OK'
}

*/
