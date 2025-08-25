// components/MapNative.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  View,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import MapView, { Marker, Polyline, UrlTile, LatLng } from "react-native-maps";

import { useFetch } from "@/lib/fetch";
import {
  calculateDriverTimes,
  calculateRegion,
  generateMarkersFromData,
} from "@/lib/map";
import { useDriverStore, useLocationStore } from "@/store";

import type { Driver, MarkerData } from "@/types/type";

/**
 * routeOSRM: calls OSRM public demo server and returns a route object.
 * - Strong input validation
 * - Helpful debug logs (remove or guard behind env check in production)
 */
async function routeOSRM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  function invalidPoint(p: { lat: number; lon: number } | null | undefined) {
    return (
      p == null ||
      typeof p.lat !== "number" ||
      typeof p.lon !== "number" ||
      !isFinite(p.lat) ||
      !isFinite(p.lon) ||
      p.lat < -90 ||
      p.lat > 90 ||
      p.lon < -180 ||
      p.lon > 180
    );
  }

  if (invalidPoint(a) || invalidPoint(b)) {
    throw new Error(
      `Invalid coordinates. a=${JSON.stringify(a)} b=${JSON.stringify(b)}`,
    );
  }

  // if origin == destination, return trivial route
  if (Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9) {
    return {
      distanceMeters: 0,
      durationSeconds: 0,
      coordinates: [{ latitude: a.lat, longitude: a.lon }],
    };
  }

  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${Number(a.lon)},${Number(a.lat)};${Number(
      b.lon,
    )},${Number(b.lat)}`,
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("alternatives", "false");

  // Debug: log URL so you can paste into a browser during development
  // Remove or guard in production.
  // eslint-disable-next-line no-console
  console.debug("[routeOSRM] url =", url.toString());

  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) {
    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch {
      bodyText = "(failed to read response body)";
    }
    // eslint-disable-next-line no-console
    console.warn("[routeOSRM] non-ok response:", resp.status, bodyText);
    throw new Error(`Routing failed: ${resp.status} — ${bodyText}`);
  }

  const data = await resp.json();

  if (!data.routes || data.routes.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("[routeOSRM] no routes in response:", data);
    throw new Error("No route found");
  }

  const r = data.routes[0];
  if (!r.geometry || !Array.isArray(r.geometry.coordinates)) {
    // eslint-disable-next-line no-console
    console.warn("[routeOSRM] unexpected geometry:", r);
    throw new Error("Route geometry missing or malformed");
  }

  const coords: LatLng[] = r.geometry.coordinates.map((c: [number, number]) => {
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!isFinite(lat) || !isFinite(lon)) {
      // eslint-disable-next-line no-console
      console.warn("[routeOSRM] invalid coordinate in geometry:", c);
      throw new Error("Invalid coordinate in route geometry");
    }
    return { latitude: lat, longitude: lon };
  });

  return {
    distanceMeters: r.distance,
    durationSeconds: r.duration,
    coordinates: coords,
  };
}

export default function MapNative(): JSX.Element {
  const mapRef = useRef<MapView | null>(null);

  const {
    userLongitude,
    userLatitude,
    destinationLatitude,
    destinationLongitude,
  } = useLocationStore();
  const { setDrivers } = useDriverStore();

  const { data: drivers, loading, error } = useFetch<Driver[]>("/(api)/driver");
  const [markers, setMarkers] = useState<MarkerData[]>([]);

  // Example override states (used for demo Lagos -> Uyo)
  const [exampleFrom, setExampleFrom] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [exampleTo, setExampleTo] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [route, setRoute] = useState<{
    distanceMeters: number;
    durationSeconds: number;
    coordinates: LatLng[];
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!Array.isArray(drivers)) return;
    if (userLatitude == null || userLongitude == null) return;
    const newMarkers = generateMarkersFromData({
      data: drivers,
      userLatitude,
      userLongitude,
    });
    setMarkers(newMarkers);
  }, [drivers, userLatitude, userLongitude]);

  useEffect(() => {
    if (
      markers.length > 0 &&
      destinationLatitude !== undefined &&
      destinationLongitude !== undefined
    ) {
      calculateDriverTimes({
        markers,
        userLatitude,
        userLongitude,
        destinationLatitude,
        destinationLongitude,
      })
        .then((ds) => {
          setDrivers(ds as MarkerData[]);
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn("calculateDriverTimes error", e);
        });
    }
  }, [
    markers,
    destinationLatitude,
    destinationLongitude,
    setDrivers,
    userLatitude,
    userLongitude,
  ]);

  const region = useMemo(() => {
    // If exampleFrom/To exist, center between them; otherwise reuse calculateRegion
    if (exampleFrom && exampleTo) {
      const midLat = (exampleFrom.lat + exampleTo.lat) / 2;
      const midLon = (exampleFrom.lon + exampleTo.lon) / 2;
      return {
        latitude: midLat,
        longitude: midLon,
        latitudeDelta: Math.abs(exampleFrom.lat - exampleTo.lat) * 2 || 0.2,
        longitudeDelta: Math.abs(exampleFrom.lon - exampleTo.lon) * 2 || 0.2,
      };
    }
    return calculateRegion({
      userLatitude,
      userLongitude,
      destinationLatitude,
      destinationLongitude,
    });
  }, [
    exampleFrom,
    exampleTo,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  ]);

  // Build list of all points used for fitToCoordinates
  const allPoints = useMemo(() => {
    const pts: LatLng[] = [];
    if (exampleFrom)
      pts.push({ latitude: exampleFrom.lat, longitude: exampleFrom.lon });
    else if (userLatitude != null && userLongitude != null)
      pts.push({
        latitude: Number(userLatitude),
        longitude: Number(userLongitude),
      });

    if (exampleTo)
      pts.push({ latitude: exampleTo.lat, longitude: exampleTo.lon });
    else if (destinationLatitude != null && destinationLongitude != null)
      pts.push({
        latitude: Number(destinationLatitude),
        longitude: Number(destinationLongitude),
      });

    if (route?.coordinates) pts.push(...route.coordinates);
    markers.forEach((m) =>
      pts.push({ latitude: m.latitude, longitude: m.longitude }),
    );
    return pts;
  }, [
    exampleFrom,
    exampleTo,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    route,
    markers,
  ]);

  // Fetch route whenever we have effective origin + destination
  useEffect(() => {
    let mounted = true;

    async function fetchRoute() {
      setRouteError(null);
      setRoute(null);

      const origin =
        exampleFrom ??
        (userLatitude != null && userLongitude != null
          ? { lat: Number(userLatitude), lon: Number(userLongitude) }
          : null);
      const dest =
        exampleTo ??
        (destinationLatitude != null && destinationLongitude != null
          ? {
              lat: Number(destinationLatitude),
              lon: Number(destinationLongitude),
            }
          : null);

      if (!origin || !dest) {
        return;
      }

      setRouteLoading(true);
      try {
        const r = await routeOSRM(origin, dest);
        if (!mounted) return;
        setRoute(r);

        // Fit map to route + relevant points
        if (mapRef.current && r.coordinates.length > 0) {
          const pts = [
            ...r.coordinates,
            origin && { latitude: origin.lat, longitude: origin.lon },
            dest && { latitude: dest.lat, longitude: dest.lon },
            ...markers.map((m) => ({
              latitude: m.latitude,
              longitude: m.longitude,
            })),
          ].filter(
            (p) =>
              p &&
              isFinite((p as LatLng).latitude) &&
              isFinite((p as LatLng).longitude),
          ) as LatLng[];

          if (pts.length > 0) {
            mapRef.current.fitToCoordinates(pts, {
              edgePadding: { top: 60, right: 60, bottom: 140, left: 60 },
              animated: true,
            });
          }
        }
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn("OSRM error", err);
        if (!mounted) return;
        setRouteError(err?.message ?? "Failed to fetch route");
      } finally {
        if (mounted) setRouteLoading(false);
      }
    }

    fetchRoute();

    return () => {
      mounted = false;
    };
  }, [
    exampleFrom,
    exampleTo,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    markers,
  ]);

  // Demo Lagos -> Uyo helper
  function setLagosToUyoDemo() {
    // Lagos coordinates (approx)
    const lagos = { lat: 6.5244, lon: 3.3792 };
    // Uyo coordinates (approx)
    const uyo = { lat: 5.032, lon: 7.5671 };
    setExampleFrom(lagos);
    setExampleTo(uyo);
  }

  function clearExample() {
    setExampleFrom(null);
    setExampleTo(null);
  }

  if (
    loading ||
    ((userLatitude == null || userLongitude == null) && !exampleFrom)
  ) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color="#000" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text>Error: {String(error)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={(r) => (mapRef.current = r)}
        style={styles.map}
        initialRegion={{
          latitude: region.latitude ?? 6.5244,
          longitude: region.longitude ?? 3.3792,
          latitudeDelta: region.latitudeDelta ?? 0.2,
          longitudeDelta: region.longitudeDelta ?? 0.2,
        }}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {/* OpenStreetMap tiles via UrlTile (no Google) */}
        <UrlTile
          urlTemplate={
            Platform.OS === "android"
              ? "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
              : "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
          maximumZ={19}
          flipY={false}
        />

        {/* example from/to markers (if set) */}
        {exampleFrom && (
          <Marker
            coordinate={{
              latitude: exampleFrom.lat,
              longitude: exampleFrom.lon,
            }}
            title="From (Lagos)"
          />
        )}
        {exampleTo && (
          <Marker
            coordinate={{ latitude: exampleTo.lat, longitude: exampleTo.lon }}
            title="To (Uyo)"
          />
        )}

        {/* fallback user/destination markers when example not set */}
        {!exampleFrom && userLatitude != null && userLongitude != null && (
          <Marker
            coordinate={{
              latitude: Number(userLatitude),
              longitude: Number(userLongitude),
            }}
            title="You"
          />
        )}
        {!exampleTo &&
          destinationLatitude != null &&
          destinationLongitude != null && (
            <Marker
              coordinate={{
                latitude: Number(destinationLatitude),
                longitude: Number(destinationLongitude),
              }}
              title="Destination"
            />
          )}

        {/* driver markers */}
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            title={m.title}
          />
        ))}

        {/* route polyline */}
        {route && route.coordinates.length > 0 && (
          <Polyline
            coordinates={route.coordinates}
            strokeWidth={4}
            strokeColor="#0286FF"
          />
        )}
      </MapView>

      {/* info panel */}
      <View style={styles.info}>
        <View style={styles.demoRow}>
          <TouchableOpacity style={styles.demoBtn} onPress={setLagosToUyoDemo}>
            <Text style={styles.demoBtnText}>Demo Lagos → Uyo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.demoBtn, styles.clearBtn]}
            onPress={clearExample}
          >
            <Text style={[styles.demoBtnText, styles.clearBtnText]}>
              Clear Example
            </Text>
          </TouchableOpacity>
        </View>

        {routeLoading && <Text>Calculating route…</Text>}
        {routeError && (
          <Text style={styles.errorText}>Route error: {routeError}</Text>
        )}
        {route && (
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Distance</Text>
              <Text>{(route.distanceMeters / 1000).toFixed(1)} km</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>ETA</Text>
              <Text>{Math.round(route.durationSeconds / 60)} min</Text>
            </View>
          </View>
        )}
        <Text style={styles.small}>
          Data © OpenStreetMap contributors · Routing via OSRM
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  info: {
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  col: { flex: 1 },
  label: { fontSize: 12, fontWeight: "600", color: "#333" },
  small: { fontSize: 11, color: "#666", marginTop: 8 },
  errorText: { color: "red" },

  demoRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  demoBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: "#0366d6",
    borderRadius: 8,
    alignItems: "center",
  },
  demoBtnText: { color: "#fff", fontWeight: "600" },
  clearBtn: { backgroundColor: "#f1f3f5" },
  clearBtnText: { color: "#333" },
});
