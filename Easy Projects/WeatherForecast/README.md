# WeatherForecast

A small, free weather site. Search a city or use your location to see current conditions and a 7-day forecast. English and Georgian, °C/°F, light and dark theme.

No account, no backend, no API key, no analytics, no cookies. Plain HTML, CSS and JavaScript (ES modules), no build step and no runtime dependencies.

## Features
- Current weather, daily high/low, humidity, wind, chance of rain, pressure, visibility, sunrise and sunset
- 7-day forecast
- City search with autocomplete (debounced), country and region shown for cities with the same name
- "My Location" with the browser Geolocation API; shows a warning when the position is only approximate
- Recent cities, last city restored on start
- English / Georgian, °C / °F, dark / light theme
- Keyboard shortcuts: `/` search, `L` location, `R` refresh, `U` units
- Subtle weather atmosphere: the background tint follows the condition (clear, cloud, rain, snow, storm, fog) and dims after local sunset
- Skeleton loading, `prefers-reduced-motion` respected, skip link, visible focus

## Run locally
ES modules need an HTTP server (not `file://`):

```
git clone <your-repo-url>
cd WeatherForecast
python3 -m http.server 8080
```
Open http://localhost:8080

## Tests
```
npm test
```
Uses Node's built-in test runner (Node 20 or newer). No packages to install. The tests cover the API layer (retry, cache, mapping), place-name parsing, date formatting, unit conversion and geolocation error mapping.

## Structure
```
index.html        main page
privacy.html      privacy page
404.html          not-found page
css/style.css     styles and fonts
js/api.js         Open-Meteo and BigDataCloud requests, timeout, retry, rate limit, cache
js/main.js        UI, search, geolocation, language, theme, units
js/theme-init.js  sets the theme before first paint
assets/           background images, fonts, favicon, social image
tests/            unit tests
```

## Free services used
| Service | Used for | Key | Limits |
|---|---|---|---|
| [Open-Meteo](https://open-meteo.com/) forecast | weather | none | free for non-commercial use: under 10,000 calls/day, 5,000/hour, 600/minute; CC BY 4.0 |
| [Open-Meteo](https://open-meteo.com/) geocoding | city search | none | same as above |
| [BigDataCloud](https://www.bigdatacloud.com/) client-side reverse geocoding | place name for "My Location" | none | free for client-side use from the user's device, see their fair use policy |

## Security
- Strict Content-Security-Policy in a `<meta>` tag: scripts only from this site, connections only to the three API hosts above
- No `innerHTML`: all text from users and APIs is inserted with `textContent`
- Search input is trimmed and length-limited; values read from `localStorage` are validated before use
- Every request has a timeout, retry with backoff, a client-side rate limit and cancellation of outdated requests
- No secrets in the code

GitHub Pages cannot set HTTP headers, so headers such as `frame-ancestors` are not available there. If you host elsewhere, add security headers on the server.

## Privacy
- Location is requested only after you press "My Location". It is used to show the weather and is not stored by this site.
- Coordinates go to Open-Meteo (weather) and, together with your IP address, to BigDataCloud (place name). BigDataCloud states that it uses this pair anonymously to improve its IP-geolocation data.
- Theme, language, unit, last city and up to five recent cities are kept in your browser's `localStorage`.
- Details: [privacy.html](privacy.html)

## Known limitations
- On desktop computers the browser location is often approximate (Wi-Fi or IP based, or a VPN).
- Weather descriptions and the interface are translated into Georgian by the author. Corrections are welcome.
- No hourly forecast, saved cities or offline mode yet.
- Not tested in every browser.

## License
Code: MIT, see [LICENSE](LICENSE). Fonts, weather data and the background photo (Unsplash License) have their own terms, see [NOTICE.md](NOTICE.md).

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
