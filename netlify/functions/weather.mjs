// Current conditions + today's forecast for the dashboard weather strip.
// Uses Open-Meteo (no API key required). Coordinates default to the Ward
// Parkway campus; override with WEATHER_LAT / WEATHER_LON if needed.

import { json, requireOfficer, getStore, errorResponse } from "./lib/shared.mjs";

const CACHE_KEY = "weather-v1";
const CACHE_TTL_MS = 30 * 60 * 1000;

const WEATHER_CODES = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
  85: "Snow showers", 86: "Snow showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm"
};

export default async (request) => {
  if (request.method !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  try {
    await requireOfficer(request);

    const store = await getStore("hub-cache");
    const cached = await store.get(CACHE_KEY, { type: "json" });
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return json(200, { ok: true, cached: true, ...cached.body });
    }

    const lat = process.env.WEATHER_LAT || "39.036";
    const lon = process.env.WEATHER_LON || "-94.590";

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=1`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
    const data = await response.json();

    const body = {
      current: {
        temp: Math.round(data.current?.temperature_2m ?? 0),
        feelsLike: Math.round(data.current?.apparent_temperature ?? 0),
        wind: Math.round(data.current?.wind_speed_10m ?? 0),
        gusts: Math.round(data.current?.wind_gusts_10m ?? 0),
        conditions: WEATHER_CODES[data.current?.weather_code] || "—"
      },
      today: {
        high: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
        low: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
        precipChance: Math.round(data.daily?.precipitation_probability_max?.[0] ?? 0),
        conditions: WEATHER_CODES[data.daily?.weather_code?.[0]] || "—"
      }
    };

    await store.setJSON(CACHE_KEY, { fetchedAt: Date.now(), body });

    return json(200, { ok: true, cached: false, ...body });
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/weather" };
