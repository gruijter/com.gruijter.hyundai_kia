# Hyundai and Kia

## Connect your Hyundai or Kia smart car.

Homey has access to the car's location, speed, range, door state and charge state. Control locks, defroster and A/C from a flow.

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/6/b/6bce7476628c47fe89a22771895c7597e6ae8e84.jpeg" alt="connect your car" width="250">

## WARNING: This app can damage your vehicle (e.g. drain your 12V battery). Use at own risk!
## This app can only be used on Homey V5

## Supported cars:
* Kia UVO
* Hyundai Bluelink
* Genesis Bluelink

## Status:
* EV Battery charge %
* 12V Battery charge %
* Engine on/off
* Charging
* Charger type connected
* Doors closed and locked
* Defrost on/off
* A/C on/off
* Odometer
* Speed
* Range
* GPS location
* Distance from home
* Tire pressure alarm
* Battery alarm

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/f/7/f74e05e35b24e99846155d191844b67c8d72e0c4.jpeg" alt="State" width="250">

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/7/a/7aedbd63c10e11d65dafdcb966f0cb81c5eac446.jpeg" alt="State" width="250">

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/f/a/fae2249622cd234d75f0f908ae3a6ceabf8474de.jpeg" alt="State" width="250">

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/7/8/7858ce2a2a3e4a64f908a1f631b2933d415280d1.jpeg" alt="Flow tags" width="250">

## Control (Note: this only works when the engine is off):
* Doors lock/unlock
* A/C on/off
* Defrost on/off
* Target temperature (work in progress)

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/7/8/78f40377769dcbed6db05e3471af9369fbfd6a37.jpeg" alt="Control" width="250">

## How to get live status updates:
To prevent draining the 12V battery, the status of the car is only retrieved after one of these conditions is met:
* Car was just parked (engine turned off), and A/C or heater is on
* Charging just finished or stopped
* Live data was switched on from the Homey app
* Live data was switched on via a flow

If the engine is on, the status will be automatically refreshed untill 3 minutes after the engine is turned off.

## Force 24/7 live status updates:
You can set a forced status update interval in the advanced device settings. This will however drain the 12V battery of your car when the car is parked (engine turned off). When the 12V battery is empty, you will need your emergency key to open the door, and use a battery jumper to get going again!

## Force live status updates when your phone connects to the car's Bluetooth
For Android and iOS there are apps that automatically trigger Homey to start getting live updates as soon as your phone connects to the car's Bluetooth. In the automation script you need to open the following web-page (HTTP GET):

`https://<your Homey cloudid>.connect.athom.com/api/app/com.gruijter.hyundai_kia/live?secret=<your secret>`

There are multiple apps that can do this. For Android have a look at [automate](https://play.google.com/store/apps/details?id=com.llamalab.automate) and adapt [this](https://llamalab.com/automate/community/flows/36268) flow to match your own car's Bluetooth, your Homey cloudId and secret (search for Homey in the community flows). For iOS have a look at [shortcuts](https://apps.apple.com/app/id915249334).

## ABRP
A Better Route Planner helps you to plan your trip. For its calculations ABRP can use real energy consumption data. By entering your ABRP user token in the device settings, Homey will get the live data for you from the car and acts as a bridge to upload it live to ABRP. Note that if you don’t want to upload any data to ABRP, just don’t enter your car user token in Homey

<img src="https://aws1.discourse-cdn.com/business4/uploads/athom/original/3X/a/f/afef2806940fa7428a7e16bc71bef5c4ff157934.jpeg" alt="settings" width="250">
