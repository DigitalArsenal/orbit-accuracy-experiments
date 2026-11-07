// DsstArm.java: the DSST arm's driver (experiments/dsst-arm/DSST.md as amended 2026-11-05). One JVM serves many windows: it reads
// request-file paths from stdin, one a line, fits and flies each, writes <request>.out and prints "done <path>" or "fail <path> <why>".
//   java -cp "<jars>/*" DsstArm.java <common data dir>
// Request (text lines): key <key>; cutoff <iso>; fit <hours>; dragBelowKm <perigee height>; window <dir holding finals2000A.all and
// SpaceWeather-All-v1.2.txt>; arc N, then N lines "<iso> x y z vx vy vz" (km, km/s, GCRF); out M, then M lines "<iso>".
// Response: status ok|fail <why>; drag 0|1; perigeeKm; iterations; evaluations; rms_m; cd; cr; epoch <iso>; mean a ex ey hx hy lM;
// cost fitCpuNs fitWallNs flightCpuNs flightWallNs peakHeapBytes flightPath; then M lines "state <iso> x y z vx vy vz" (km, km/s, GCRF).
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.hipparchus.optim.nonlinear.vector.leastsquares.LevenbergMarquardtOptimizer;
import org.orekit.attitudes.AttitudeProvider;
import org.orekit.attitudes.FrameAlignedProvider;
import org.orekit.bodies.CelestialBody;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.data.DataSource;
import org.orekit.data.DirectoryCrawler;
import org.orekit.data.LazyLoadedDataContext;
import org.orekit.estimation.leastsquares.BatchLSEstimator;
import org.orekit.estimation.measurements.EstimatedMeasurement;
import org.orekit.estimation.measurements.ObservableSatellite;
import org.orekit.estimation.measurements.ObservedMeasurement;
import org.orekit.estimation.measurements.Position;
import org.orekit.forces.drag.DragSensitive;
import org.orekit.forces.gravity.potential.UnnormalizedSphericalHarmonicsProvider;
import org.orekit.forces.radiation.RadiationSensitive;
import org.orekit.frames.Frame;
import org.orekit.models.earth.atmosphere.NRLMSISE00;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.orbits.EquinoctialOrbit;
import org.orekit.orbits.KeplerianOrbit;
import org.orekit.propagation.PropagationType;
import org.orekit.propagation.sampling.OrekitStepHandler;
import org.orekit.propagation.sampling.OrekitStepInterpolator;
import org.orekit.propagation.Propagator;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.conversion.DSSTPropagatorBuilder;
import org.orekit.propagation.conversion.DormandPrince853IntegratorBuilder;
import org.orekit.propagation.semianalytical.dsst.DSSTPropagator;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTAtmosphericDrag;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTForceModel;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTJ2SquaredClosedForm;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTNewtonianAttraction;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTSolarRadiationPressure;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTTesseral;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTThirdBody;
import org.orekit.propagation.semianalytical.dsst.forces.DSSTZonal;
import org.orekit.propagation.semianalytical.dsst.forces.ZeisModel;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.TimeScale;
import org.orekit.utils.Constants;
import org.orekit.utils.IERSConventions;
import org.orekit.utils.PVCoordinates;
import org.orekit.utils.ParameterDriver;
import org.orekit.utils.TimeStampedPVCoordinates;

public class DsstArm {
  static final double AREA = 1000.0; // m^2 on Orekit's default 1,000 kg: each coefficient is an area-to-mass product in m^2/kg
  static final double PRIOR = 0.01;  // AP's priors for B and AGOM, m^2/kg: the start values

  static final double GRID_S = 300.0; // the short-periodic coefficients on a 300 s grid, the scoring step (DSST.md, amendment 2026-11-05 (grid check))

  /** The builder whose propagators, in the fit and the flight, compute their short-periodic coefficients on the 300 s grid. */
  static final class GriddedBuilder extends DSSTPropagatorBuilder {
    GriddedBuilder(final org.orekit.orbits.Orbit orbit, final org.orekit.propagation.conversion.ODEIntegratorBuilder integrator, final double scale, final PropagationType propagation, final PropagationType state) {
      super(orbit, integrator, scale, propagation, state);
    }
    @Override
    public DSSTPropagator buildPropagator(final double[] normalizedParameters) {
      final DSSTPropagator p = super.buildPropagator(normalizedParameters);
      p.setInterpolationGridToMaxTimeGap(GRID_S);
      return p;
    }
  }

  public static void main(String[] args) throws Exception {
    final File common = new File(args[0]);
    final BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = in.readLine()) != null) {
      line = line.trim();
      if (line.isEmpty()) continue;
      final File req = new File(line);
      try {
        process(common, req);
        System.out.println("done " + line);
      } catch (Throwable t) {
        final String why = brief(t);
        t.printStackTrace(System.err);
        try (PrintWriter w = new PrintWriter(new File(line + ".out"), StandardCharsets.UTF_8)) { w.println("status fail " + why); }
        System.out.println("fail " + line + " " + why);
      }
      System.out.flush();
    }
  }

  static String brief(Throwable t) {
    Throwable c = t;
    while (c.getCause() != null && c.getCause() != c) c = c.getCause();
    final String m = (c.getClass().getSimpleName() + ": " + String.valueOf(c.getMessage())).replaceAll("\\s+", " ");
    return m.length() > 220 ? m.substring(0, 220) : m;
  }

  static AbsoluteDate date(String iso, TimeScale utc) {
    return new AbsoluteDate(iso.endsWith("Z") ? iso.substring(0, iso.length() - 1) : iso, utc);
  }

  static long heapPeak(boolean reset) {
    long sum = 0;
    for (MemoryPoolMXBean p : ManagementFactory.getMemoryPoolMXBeans()) {
      if (p.getType() != MemoryType.HEAP) continue;
      if (reset) p.resetPeakUsage(); else sum += p.getPeakUsage().getUsed();
    }
    return sum;
  }

  static void process(File common, File req) throws Exception {
    final List<String> lines = Files.readAllLines(req.toPath(), StandardCharsets.UTF_8);
    final Map<String, String> head = new HashMap<>();
    final List<String[]> arc = new ArrayList<>();
    final List<String> out = new ArrayList<>();
    for (int i = 0; i < lines.size();) {
      final String l = lines.get(i++).trim();
      if (l.isEmpty()) continue;
      final String[] t = l.split("\\s+", 2);
      if (t[0].equals("arc")) { final int n = Integer.parseInt(t[1].trim()); for (int k = 0; k < n; k++) arc.add(lines.get(i++).trim().split("\\s+")); }
      else if (t[0].equals("out")) { final int n = Integer.parseInt(t[1].trim()); for (int k = 0; k < n; k++) out.add(lines.get(i++).trim()); }
      else head.put(t[0], t.length > 1 ? t[1].trim() : "");
    }
    final File window = new File(head.get("window"));
    final double dragBelowKm = Double.parseDouble(head.get("dragBelowKm"));

    final com.sun.management.OperatingSystemMXBean os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    heapPeak(true);
    final long c0 = os.getProcessCpuTime(), w0 = System.nanoTime();

    // one data context per window: the window's Earth orientation and weather, the common field, ephemerides and leap seconds
    final LazyLoadedDataContext ctx = new LazyLoadedDataContext();
    ctx.getDataProvidersManager().addProvider(new DirectoryCrawler(common));
    ctx.getDataProvidersManager().addProvider(new DirectoryCrawler(window));
    final TimeScale utc = ctx.getTimeScales().getUTC();
    final Frame gcrf = ctx.getFrames().getGCRF();
    final Frame itrf = ctx.getFrames().getITRF(IERSConventions.IERS_2010, true);
    final OneAxisEllipsoid earth = new OneAxisEllipsoid(Constants.WGS84_EARTH_EQUATORIAL_RADIUS, Constants.WGS84_EARTH_FLATTENING, itrf);
    final CelestialBody sun = ctx.getCelestialBodies().getSun(), moon = ctx.getCelestialBodies().getMoon();
    final UnnormalizedSphericalHarmonicsProvider provider = ctx.getGravityFields().getUnnormalizedProvider(20, 20);
    final double mu = provider.getMu();

    // the arc: Position measurements, sigma 1 m, weight 1; the last state seeds the mean elements
    final ObservableSatellite sat = new ObservableSatellite(0);
    final List<Position> measurements = new ArrayList<>();
    TimeStampedPVCoordinates first = null, last = null;
    for (String[] s : arc) {
      final AbsoluteDate d = date(s[0], utc);
      final Vector3D p = new Vector3D(Double.parseDouble(s[1]) * 1000.0, Double.parseDouble(s[2]) * 1000.0, Double.parseDouble(s[3]) * 1000.0);
      final Vector3D v = new Vector3D(Double.parseDouble(s[4]) * 1000.0, Double.parseDouble(s[5]) * 1000.0, Double.parseDouble(s[6]) * 1000.0);
      measurements.add(new Position(d, p, 1.0, 1.0, sat));
      if (first == null) first = new TimeStampedPVCoordinates(d, p, v);
      last = new TimeStampedPVCoordinates(d, p, v);
    }
    if (measurements.size() < 7) throw new IllegalStateException("arc holds " + measurements.size() + " states");

    // drag by the fit's first state: on when the perigee height is below dragBelowKm (FFM's own cutoff)
    final KeplerianOrbit firstKep = new KeplerianOrbit(first, gcrf, mu);
    final double perigeeKm = (firstKep.getA() * (1.0 - firstKep.getE()) - Constants.WGS84_EARTH_EQUATORIAL_RADIUS) / 1000.0;
    final boolean drag = perigeeKm < dragBelowKm;
    final File cssi = new File(window, "SpaceWeather-All-v1.2.txt");
    if (drag && !cssi.exists()) throw new IllegalStateException("drag on (perigee " + Math.round(perigeeKm) + " km) but the window has no weather rows");

    final List<DSSTForceModel> forces = new ArrayList<>();
    forces.add(new DSSTNewtonianAttraction(mu));
    forces.add(new DSSTZonal(provider));
    forces.add(new DSSTTesseral(itrf, Constants.WGS84_EARTH_ANGULAR_VELOCITY, provider));
    forces.add(new DSSTJ2SquaredClosedForm(new ZeisModel(), provider));
    forces.add(new DSSTThirdBody(sun, mu));
    forces.add(new DSSTThirdBody(moon, mu));
    forces.add(new DSSTSolarRadiationPressure(PRIOR, AREA, sun, earth, mu));
    // the four-argument constructor: the window context's UT1, not the default context's (which holds no data). The atmosphere's
    // ceiling is the registered drag switch, 2,500 km (DSST.md, amendment 2026-11-05 (review 2), 1), in place of Orekit's 1,000 km.
    if (drag) {
      final DSSTAtmosphericDrag atmosphericDrag = new DSSTAtmosphericDrag(new NRLMSISE00(new CssiSpaceWeatherData(new DataSource(cssi), utc), sun, earth, ctx.getTimeScales().getUT1(IERSConventions.IERS_2010, true)), PRIOR, AREA, mu);
      atmosphericDrag.setRbar(Constants.WGS84_EARTH_EQUATORIAL_RADIUS + dragBelowKm * 1000.0);
      forces.add(atmosphericDrag);
    }

    final AttitudeProvider attitude = new FrameAlignedProvider(gcrf);
    final SpacecraftState osculating = new SpacecraftState(new CartesianOrbit(last, gcrf, mu));
    final EquinoctialOrbit mean = new EquinoctialOrbit(DSSTPropagator.computeMeanState(osculating, attitude, forces).getOrbit());
    final double period = mean.getKeplerianPeriod();
    // the mean-element steps (DSST.md, amendment 5): one Keplerian period capped at 43,200 s to a day, or to the period where it exceeds a day
    final double minStep = Math.min(period, 43200.0), maxStep = Math.max(86400.0, period);
    final DSSTPropagatorBuilder builder = new GriddedBuilder(mean, new DormandPrince853IntegratorBuilder(minStep, maxStep, 1.0), 1.0, PropagationType.OSCULATING, PropagationType.MEAN);
    builder.setAttitudeProvider(attitude);
    for (DSSTForceModel f : forces) builder.addForceModel(f);
    for (ParameterDriver d : builder.getPropagationParametersDrivers().getDrivers()) {
      if (d.getName().equals(DragSensitive.DRAG_COEFFICIENT)) { d.setMinValue(0.0); d.setMaxValue(10.0); d.setValue(PRIOR); d.setSelected(drag); }
      else if (d.getName().equals(RadiationSensitive.REFLECTION_COEFFICIENT)) { d.setMinValue(0.0); d.setMaxValue(10.0); d.setValue(PRIOR); d.setSelected(!drag); }
      else d.setSelected(false);
    }
    final BatchLSEstimator estimator = new BatchLSEstimator(new LevenbergMarquardtOptimizer(), builder);
    estimator.setParametersConvergenceThreshold(1e-3);
    estimator.setMaxIterations(50);
    estimator.setMaxEvaluations(100);
    for (Position m : measurements) estimator.addMeasurement(m);
    final Propagator[] fitted = estimator.estimate();
    final long c1 = os.getProcessCpuTime(), w1 = System.nanoTime();

    double ss = 0.0; int n = 0;
    for (Map.Entry<ObservedMeasurement<?>, EstimatedMeasurement<?>> e : estimator.getLastEstimations().entrySet()) {
      final double[] o = e.getKey().getObservedValue(), est = e.getValue().getEstimatedValue();
      for (int k = 0; k < 3; k++) ss += (o[k] - est[k]) * (o[k] - est[k]);
      n++;
    }
    final double rms = Math.sqrt(ss / Math.max(1, n));
    double cd = Double.NaN, cr = Double.NaN;
    for (ParameterDriver d : estimator.getPropagatorParametersDrivers(false).getDrivers()) {
      if (d.getName().equals(DragSensitive.DRAG_COEFFICIENT)) cd = d.getValue();
      else if (d.getName().equals(RadiationSensitive.REFLECTION_COEFFICIENT)) cr = d.getValue();
    }
    final Propagator prop = fitted[0];
    final SpacecraftState initial = prop.getInitialState();
    final EquinoctialOrbit fo = new EquinoctialOrbit(initial.getOrbit());

    // the flight: one propagation from the fit epoch over the span; a step handler takes the state at every scored epoch from the
    // integrator's dense output with the short periodics evaluated at that epoch, as the fit's own residuals are. The propagator keeps
    // its initial state (no reset at the end), so direct propagations to the first and last epoch check the handler's states; the gaps
    // are recorded, and above 100 m every epoch is propagated directly instead.
    final List<AbsoluteDate> dates = new ArrayList<>();
    for (String s : out) dates.add(date(s, utc));
    final PVCoordinates[] sampled = new PVCoordinates[dates.size()];
    final List<PVCoordinates> states = new ArrayList<>();
    String flightPath = "step-handler";
    double gapFirst = 0.0, gapLast = 0.0;
    if (!dates.isEmpty()) {
      final DSSTPropagator dsst = (DSSTPropagator) prop;
      dsst.setResetAtEnd(false);
      final int[] next = {0};
      dsst.getMultiplexer().add(new OrekitStepHandler() {
        @Override
        public void handleStep(final OrekitStepInterpolator interpolator) {
          final AbsoluteDate end = interpolator.getCurrentState().getDate();
          while (next[0] < dates.size() && dates.get(next[0]).compareTo(end) <= 0) {
            sampled[next[0]] = interpolator.getInterpolatedState(dates.get(next[0])).getPVCoordinates(gcrf);
            next[0]++;
          }
        }
      });
      dsst.propagate(dates.get(dates.size() - 1));
      dsst.clearStepHandlers();
      for (int k = 0; k < sampled.length; k++) if (sampled[k] == null) throw new IllegalStateException("the step handler missed epoch " + out.get(k));
      final PVCoordinates directFirst = dsst.propagate(dates.get(0)).getPVCoordinates(gcrf);
      final PVCoordinates directLast = dsst.propagate(dates.get(dates.size() - 1)).getPVCoordinates(gcrf);
      gapFirst = Vector3D.distance(sampled[0].getPosition(), directFirst.getPosition());
      gapLast = Vector3D.distance(sampled[sampled.length - 1].getPosition(), directLast.getPosition());
      if (gapFirst <= 100.0 && gapLast <= 100.0) {
        for (PVCoordinates pv : sampled) states.add(pv);
      } else {
        flightPath = "direct";
        for (AbsoluteDate d : dates) states.add(dsst.propagate(d).getPVCoordinates(gcrf));
      }
    }
    final long c2 = os.getProcessCpuTime(), w2 = System.nanoTime();
    final long peak = heapPeak(false);

    try (PrintWriter w = new PrintWriter(new File(req.getPath() + ".out"), StandardCharsets.UTF_8)) {
      w.println("status ok");
      w.println("drag " + (drag ? 1 : 0));
      w.println(String.format(Locale.ROOT, "perigeeKm %.3f", perigeeKm));
      w.println("iterations " + estimator.getIterationsCount());
      w.println("evaluations " + estimator.getEvaluationsCount());
      w.println(String.format(Locale.ROOT, "rms_m %.6f", rms));
      w.println(String.format(Locale.ROOT, "cd %.10g", cd));
      w.println(String.format(Locale.ROOT, "cr %.10g", cr));
      w.println("epoch " + initial.getDate().toString(utc));
      w.println(String.format(Locale.ROOT, "mean %.6f %.12e %.12e %.12e %.12e %.12e", fo.getA(), fo.getEquinoctialEx(), fo.getEquinoctialEy(), fo.getHx(), fo.getHy(), fo.getLM()));
      w.println("cost " + (c1 - c0) + " " + (w1 - w0) + " " + (c2 - c1) + " " + (w2 - w1) + " " + peak + " " + flightPath);
      w.println(String.format(Locale.ROOT, "ephemerisGapM %.3f %.3f", gapFirst, gapLast));
      for (int k = 0; k < dates.size(); k++) {
        final PVCoordinates pv = states.get(k);
        w.println(String.format(Locale.ROOT, "state %s %.9f %.9f %.9f %.12f %.12f %.12f", out.get(k), pv.getPosition().getX() / 1000.0, pv.getPosition().getY() / 1000.0, pv.getPosition().getZ() / 1000.0,
          pv.getVelocity().getX() / 1000.0, pv.getVelocity().getY() / 1000.0, pv.getVelocity().getZ() / 1000.0));
      }
    }
  }
}
