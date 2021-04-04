# Hyundai and Kia

## Connect your Hyundai or Kia smart car.

Homey has access to the car's location, speed, range, door state and charge state. Control locks, defroster and A/C from a flow.

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/6/b/6bce7476628c47fe89a22771895c7597e6ae8e84.jpeg" alt="connect your car" width="250">

## WARNING: This app can damage your vehicle (e.g. drain your 12V battery). Due to license restrictions the number of server requests and car status updates is severely limited by Kia/Hyundai. You will be locked out from using their service if you overuse it. Use at own risk!
## This app can only be used on Homey V5

## Supported cars:
* Kia UVO
* Hyundai Bluelink
* Genesis Bluelink

## Status:
* 12V Battery charge %
* Engine on/off
* Doors closed and locked
* Defrost on/off
* A/C on/off
* Odometer
* Speed
* Range
* Tire pressure alarm
* Battery alarm
* GPS location
* Distance from home
* Estimated Time To Home (ETTH)

## Extra status for EV vehicles:
* EV Battery charge %
* Charge targets
* Charging on/off
* Charger type connected (slow/fast)

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/f/7/f74e05e35b24e99846155d191844b67c8d72e0c4.jpeg" alt="State" width="250">

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/7/a/7aedbd63c10e11d65dafdcb966f0cb81c5eac446.jpeg" alt="State" width="250">

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/f/a/fae2249622cd234d75f0f908ae3a6ceabf8474de.jpeg" alt="State" width="250">

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/7/8/7858ce2a2a3e4a64f908a1f631b2933d415280d1.jpeg" alt="Flow tags" width="250">

## Control (Note: some commands only work when the engine is off):
* Doors lock/unlock
* A/C on/off
* Defrost on/off
* Target temperature
* Target Charge
* Charger on/off
* Send destination to car's navigation

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/7/8/78f40377769dcbed6db05e3471af9369fbfd6a37.jpeg" alt="Control" width="250">

## How to update the car status in Homey:
Homey will get an update of the car status within 10 minutes after it is parked. You can also request a status update from the Homey app, or from a flow.

## 24/7 car status updates:
You can set a forced status update interval in the advanced device settings. This will however drain the 12V battery of your car when the car is parked (engine turned off). When the 12V battery is empty, you will need your emergency key to open the door, and use a battery jumper to get going again!

## Update car status when your phone connects to the car's Bluetooth
For Android and iOS there are apps that automatically trigger Homey to do a status update as soon as your phone connects to the car's Bluetooth. In the automation script you need to open a specific web-page (HTTP GET). The URL of this page can be found in the advanced device settings. By using a optional URL shortener from Bit.ly, the URL is now nice and simple e.g. `https://bit.ly/A2TiGLk`

There are multiple apps that can do this. For Android have a look at [automate](https://play.google.com/store/apps/details?id=com.llamalab.automate) and adapt [this](https://llamalab.com/automate/community/flows/36268) flow to match your own car's Bluetooth and the URL.

For iOS have a look at [shortcuts](https://apps.apple.com/app/id915249334). In Shortcuts Automation > Create Personal Automation > Bluetooth > Choose Your Vehicles Bluetooth Device Name > Get URL.

## Disable Homey status and control (privacy mode)
To temporarily disable Homey being able to get location data, you can create a flow with the action card 'Disable Homey control and live data'. By adding this to your favorite flows, you can fully disable the connection that Homey has with the car from the Homey app. This means that no data is received or logged by Homey, but also that no controls can be sent to the car via Homey. Create a second flow with the action card 'Enable Homey control and live data' to enable the connection again.

## ETTH with Google Directions
The Estimated Time To Home - ETTH - is a very (very) rough estimate. Enabling Google Directions will greatly improve the ETTH accuracy. It uses real-time traffic information. Fill in the Google API key in the advanced settings. Leave empty to disable Google Directions. You can get a key [here](https://developers.google.com/maps/documentation/directions/get-api-key). This is a paid service from Google, but you will get $200 every month for free, which should be more than enough for the Homey app. Disclaimer: based on Google's Directions Advanced [pricing plan](https://cloud.google.com/maps-platform/pricing/#matrix) September 2020.

## A Better Route Planner (ABRP)
A Better Route Planner helps you to plan your trip. For its calculations ABRP can use real energy consumption data. By entering your ABRP user token in the device settings, Homey will get the live data for you from the car and acts as a bridge to upload it live to ABRP. Note that if you don’t want to upload any data to ABRP, just don’t enter your car user token in Homey

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/a/f/afef2806940fa7428a7e16bc71bef5c4ff157934.jpeg" alt="settings" width="250">

## Send a destination to the car's navigation
Via a flow you can send a new destination to the navigation system. You can use a tag or free text, or [lat,lon] format, e.g.
* Amsterdam Stopera Parking
* Downingstreet 10, london
* 38.8976805,-77.0387185

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/6/3/63adf9e516c042d698c7886d2dab3c8322af0774.jpeg" alt="settings" width="250">

