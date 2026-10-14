import type { Position } from "./models";
/** Haversine great-circle distance in meters. */
export declare function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number;
/** Calculate total distance from position array. */
export declare function calculateDistance(positions: Position[]): number;
/** Motion detection: explicit motion attr > ignition attr > speed threshold. */
export declare function detectMotion(position: Position, prevPosition: Position | null): boolean;
/** Geofence check for circle. */
export declare function checkCircleGeofence(position: Position, lat: number, lon: number, radius: number): boolean;
/** Geofence check for polygon. */
export declare function checkPolygonGeofence(position: Position, polygon: {
    lat: number;
    lon: number;
}[]): boolean;
/** Alarm to event type mapping. */
export declare function alarmToEventType(alarm: string): string[];
/** Process a new position and generate events. */
export interface ProcessedPosition {
    id: number;
    deviceId: number;
    protocol: string | null;
    deviceTime: string | null;
    fixTime: string | null;
    serverTime: string;
    valid: boolean;
    latitude: number;
    longitude: number;
    altitude: number;
    speed: number;
    course: number;
    address: string | null;
    accuracy: number;
    network: Position["network"];
    geofenceIds: number[] | null;
    attributes: Record<string, unknown>;
    distance?: number;
    totalDistance?: number;
    motion?: boolean;
    events?: string[];
}
export declare function processPosition(position: Position, previousPosition: Position | null, deviceAttributes: Record<string, unknown>, geofences: Array<{
    id: number;
    area: string;
}>): Promise<ProcessedPosition>;
//# sourceMappingURL=processing.d.ts.map