// NOAA API utility for Miramar Beach, FL
const NOAA_POINTS_URL = 'https://api.weather.gov/points/30.3755,-86.3587';
const USER_AGENT = 'PhotoTrackerApp (your@email.com)'; // Replace with your real contact info

export async function fetchWeeklyWeather() {
  try {
    // 1. Get forecast URL for this grid
    const pointsRes = await fetch(NOAA_POINTS_URL, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const pointsData = await pointsRes.json();
    const forecastUrl = pointsData.properties.forecast;
    if (!forecastUrl) throw new Error('No forecast URL found');

    // 2. Get the 7-day forecast
    const forecastRes = await fetch(forecastUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const forecastData = await forecastRes.json();
    const periods = forecastData.properties.periods || [];

    // 3. Only include daytime periods (ignore "Tonight" and "... Night")
    return periods
      .filter(p => !/night/i.test(p.name))
      .map(p => ({
        name: p.name, // e.g. "Monday"
        detailedForecast: p.detailedForecast,
        shortForecast: p.shortForecast // <-- Needed for icon mapping!
      }));
  } catch (err) {
    console.error('Failed to fetch NOAA weather:', err);
    return [];
  }
}