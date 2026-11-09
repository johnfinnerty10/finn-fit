# Finn Fit

Personal training app: workouts with progression, nutrition, sleep/steps and progress charts.
Plain HTML/CSS/JS. No build step, no dependencies. Installable on iPhone as a home-screen app.

## Run it locally

```bash
python -m http.server 5173 --directory finn-fit
```

Open http://localhost:5173.

## Put it online (free)

Any static host works. Drag the `finn-fit` folder onto https://app.netlify.com/drop, or push it to GitHub and enable Pages.
Then open the URL on your iPhone in Safari → Share → **Add to Home Screen**.

## Your data

Everything is saved in the browser on the device you use (localStorage). It does not sync between devices.
Use **Settings → Export backup** regularly and **Restore** to move data to another device.

## Files

| File | What it does |
|---|---|
| `js/store.js` | Saved data, your programme and starting weights, backup/restore |
| `js/logic.js` | Dates, double-progression targets, estimated 1RM, personal bests, typo checks |
| `js/workout.js` | Live workout logger and rest timer |
| `js/views.js` | Home, Train, Nutrition, Progress, Activity, Settings screens |
| `js/charts.js` | SVG charts and progress rings |
| `sw.js` | Offline support |
