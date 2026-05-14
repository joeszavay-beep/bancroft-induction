import { useState, useEffect } from 'react'

const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

const WMO_CODES = {
  0: { label: 'Clear', icon: '☀️' },
  1: { label: 'Mostly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Heavy drizzle', icon: '🌦️' },
  61: { label: 'Light rain', icon: '🌧️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '🌨️' },
  75: { label: 'Heavy snow', icon: '🌨️' },
  77: { label: 'Snow grains', icon: '🌨️' },
  80: { label: 'Light showers', icon: '🌦️' },
  81: { label: 'Showers', icon: '🌧️' },
  82: { label: 'Heavy showers', icon: '🌧️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm + hail', icon: '⛈️' },
  99: { label: 'Thunderstorm + heavy hail', icon: '⛈️' },
}

function getWeatherInfo(code) {
  return WMO_CODES[code] || { label: 'Unknown', icon: '❓' }
}

function getDayLabel(dateStr, idx) {
  if (idx === 0) return 'Today'
  if (idx === 1) return 'Tomorrow'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}

function getWarnings(day) {
  const warnings = []
  if (day.precipProbability > 60) warnings.push({ label: 'Rain expected', color: 'blue' })
  if (day.gustMph > 25) warnings.push({ label: 'High wind', color: 'amber' })
  if (day.tempLow < 2) warnings.push({ label: 'Frost risk', color: 'sky' })
  if (day.weatherCode >= 95) warnings.push({ label: 'Storm warning', color: 'red' })
  return warnings
}

export function useWeather(lat, lng) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!lat || !lng) { setLoading(false); return }

    const cacheKey = `weather_${lat.toFixed(2)}_${lng.toFixed(2)}`
    const cached = sessionStorage.getItem(cacheKey)

    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
          setData(parsed.data)
          setLoading(false)
          return
        }
      } catch { /* stale, refetch */ }
    }

    let cancelled = false

    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code&current_weather=true&timezone=Europe/London&forecast_days=4&wind_speed_unit=mph`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Weather API ${res.status}`)
        const json = await res.json()

        const days = json.daily.time.map((date, i) => ({
          date,
          dayLabel: getDayLabel(date, i),
          weatherCode: json.daily.weather_code[i],
          weather: getWeatherInfo(json.daily.weather_code[i]),
          tempHigh: Math.round(json.daily.temperature_2m_max[i]),
          tempLow: Math.round(json.daily.temperature_2m_min[i]),
          precipProbability: json.daily.precipitation_probability_max[i],
          windMph: Math.round(json.daily.wind_speed_10m_max[i]),
          gustMph: Math.round(json.daily.wind_gusts_10m_max[i]),
        }))
        days.forEach(d => { d.warnings = getWarnings(d) })

        const result = {
          current: {
            temp: Math.round(json.current_weather.temperature),
            weather: getWeatherInfo(json.current_weather.weathercode),
            windMph: Math.round(json.current_weather.windspeed),
          },
          days,
          fetchedAt: Date.now(),
        }

        if (!cancelled) {
          setData(result)
          setError(null)
          sessionStorage.setItem(cacheKey, JSON.stringify({ data: result, fetchedAt: Date.now() }))
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
        // Try stale cache
        if (cached && !cancelled) {
          try { setData(JSON.parse(cached).data) } catch { /* nothing */ }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchWeather()
    return () => { cancelled = true }
  }, [lat, lng])

  return { data, loading, error }
}
