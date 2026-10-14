import type { Position } from "./models";
export interface OsmAndQueryData {
    id: string;
    lat: number;
    lon: number;
    timestamp?: number;
    speed?: number;
    bearing?: number;
    altitude?: number;
    accuracy?: number;
    batt?: number;
    charge?: boolean;
    hdop?: number;
    driverUniqueId?: string;
    cell?: string;
    wifi?: string;
    location?: string;
}
export interface OsmAndJsonData {
    device_id: string;
    location: {
        coords: {
            latitude: number;
            longitude: number;
            speed?: number;
            heading?: number;
            accuracy?: number;
            altitude?: number;
        };
        timestamp: number;
        is_moving?: boolean;
        battery?: {
            level: number;
            is_charging: boolean;
        };
        event?: string;
        odometer?: number;
        activity?: string;
        alarm?: string;
        extras?: Record<string, unknown>;
    };
}
export interface DecodedPosition {
    uniqueId: string;
    position: Partial<Position>;
    notificationToken?: string;
}
/** Parse epoch milliseconds, seconds, or ISO string to ISO-8601 UTC. */
export declare function parseTimestamp(value: number | string | undefined): string | null;
/** Decode OsmAnd query-string parameters. */
export declare function decodeOsmAndQuery(params: OsmAndQueryData): DecodedPosition;
/** Decode OsmAnd/Traccar Client JSON payload. */
export declare function decodeOsmAndJson(data: OsmAndJsonData): DecodedPosition;
/** Convert m/s to knots. */
export declare function msToKnots(ms: number): number;
/** Parse WKT circle: CIRCLE(lat lon, radius) -> {lat, lon, radius}. */
export declare function parseWktCircle(wkt: string): {
    lat: number;
    lon: number;
    radius: number;
} | null;
/** Parse WKT polygon: POLYGON((lon lat, ...)) -> [{lat, lon}, ...]. */
export declare function parseWktPolygon(wkt: string): {
    lat: number;
    lon: number;
}[] | null;
/** Check if point is inside circle. */
export declare function pointInCircle(lat: number, lon: number, circle: {
    lat: number;
    lon: number;
    radius: number;
}): boolean;
/** Check if point is inside polygon (ray casting). */
export declare function pointInPolygon(lat: number, lon: number, polygon: {
    lat: number;
    lon: number;
}[]): boolean;
//# sourceMappingURL=protocol.d.ts.map