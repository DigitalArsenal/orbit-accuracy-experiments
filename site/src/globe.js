// The globe: CesiumJS (window.Cesium, vendored; not OrbPro) with the Space
// Data Network's Blue Marble as its only imagery and nothing fetched from a
// third party. Orbits are inertial SampledPositionProperty paths drawn by
// Cesium's own path visualizer; the ICRF-to-fixed rotation comes from
// Cesium's IAU 2006 tables, preloaded for the arc.
const AMBER = '#f5a524', CYAN = '#59d9ff', SATELLITE = '#b3e0ff';

export async function createGlobe(container) {
  const Cesium = window.Cesium;
  const imagery = await Cesium.SingleTileImageryProvider.fromUrl('./vendor/earth/day.webp');
  const viewer = new Cesium.Viewer(container, {
    baseLayer: new Cesium.ImageryLayer(imagery),
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, animation: false, timeline: true, fullscreenButton: false,
    infoBox: false, selectionIndicator: false, skyBox: false, shouldAnimate: false,
    creditContainer: document.createElement('div'),
  });
  const scene = viewer.scene;
  scene.backgroundColor = Cesium.Color.BLACK;
  scene.fog.enabled = false;
  scene.globe.showGroundAtmosphere = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 2.5e6;
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-40, 20, 4.2e7) });
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // tracks: [{id, name, color: 'amber'|'cyan', epochsMs, positionsKm (flat)}]
  async function show(tracks, { periodSeconds }) {
    viewer.entities.removeAll();
    const startMs = Math.min(...tracks.map((t) => t.epochsMs[0])), stopMs = Math.max(...tracks.map((t) => t.epochsMs.at(-1)));
    const start = Cesium.JulianDate.fromDate(new Date(startMs)), stop = Cesium.JulianDate.fromDate(new Date(stopMs));
    await Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({ start, stop }));
    let radius = 0;
    for (const track of tracks) {
      const position = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);
      position.setInterpolationOptions({ interpolationDegree: 7, interpolationAlgorithm: Cesium.LagrangePolynomialApproximation });
      const times = [], points = [];
      track.epochsMs.forEach((ms, i) => {
        times.push(Cesium.JulianDate.fromDate(new Date(ms)));
        const p = track.positionsKm.slice(3 * i, 3 * i + 3);
        radius = Math.max(radius, Math.hypot(...p) * 1000);
        points.push(new Cesium.Cartesian3(p[0] * 1000, p[1] * 1000, p[2] * 1000));
      });
      position.addSamples(times, points);
      const color = Cesium.Color.fromCssColorString(track.color === 'cyan' ? CYAN : AMBER);
      viewer.entities.add({
        id: track.id, name: track.name, position,
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: times[0], stop: times.at(-1) })]),
        path: { width: track.color === 'cyan' ? 2 : 3, material: color, leadTime: 0, trailTime: periodSeconds, resolution: Math.max(30, periodSeconds / 120) },
        point: { pixelSize: 8, color: track.color === 'cyan' ? color : Cesium.Color.fromCssColorString(SATELLITE), outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
      });
    }
    const clock = viewer.clock;
    clock.startTime = start.clone();
    clock.stopTime = stop.clone();
    clock.currentTime = reduceMotion ? stop.clone() : start.clone();
    clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    clock.multiplier = Math.max(60, periodSeconds / 20);
    clock.shouldAnimate = !reduceMotion;
    viewer.timeline.zoomTo(start, stop);
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(-40, 25, radius * 2.4), duration: reduceMotion ? 0 : 1.2 });
  }

  return { viewer, show, destroy: () => viewer.destroy() };
}
