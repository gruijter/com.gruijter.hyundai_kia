import { REGIONS } from '../constants';
import { VehicleStatus, FullVehicleStatus, VehicleOdometer, VehicleLocation, VehicleClimateOptions, VehicleRegisterOptions, VehicleStatusOptions, RawVehicleStatus } from '../interfaces/common.interfaces';
import { Vehicle } from './vehicle';
import { EuropeanController } from '../controllers/european.controller';
export default class EuropeanVehicle extends Vehicle {
    vehicleConfig: VehicleRegisterOptions;
    controller: EuropeanController;
    region: REGIONS;
    constructor(vehicleConfig: VehicleRegisterOptions, controller: EuropeanController);
    private checkControlToken;
    start(config: VehicleClimateOptions): Promise<string>;
    stop(): Promise<string>;
    lock(): Promise<string>;
    unlock(): Promise<string>;
    fullStatus(input: VehicleStatusOptions): Promise<FullVehicleStatus | null>;
    status(input: VehicleStatusOptions): Promise<VehicleStatus | RawVehicleStatus | null>;
    odometer(): Promise<VehicleOdometer | null>;
    location(): Promise<VehicleLocation>;
    startCharge(): Promise<string>;
    stopCharge(): Promise<string>;
}
