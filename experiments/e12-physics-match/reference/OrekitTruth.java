// Orekit 13.1 truth ephemerides for E12 (the physics-match gauntlet).
//
// E12 fits propagator/hpop under many physics hypotheses to an operator's
// ephemeris. To validate that method we need synthetic ephemerides whose
// physics is known, including physics HPOP cannot represent (EIGEN-6S gravity,
// DTM2000 or Harris-Priester drag, ...). Orekit (CS GROUP, Apache-2.0) is the
// independent engine: each case starts from one GCRF state, is propagated with
// the named force set and is sampled at the requested UTC epochs.
//
// Run (single-file source launch, Java 11+):
//   java -Dorekit.version=13.1.6 -cp "<orekit + hipparchus jars>/*" OrekitTruth.java <orekit-data dir> <gfc dir> <cases.json> <out.json>
// <gfc dir> holds EGM2008-hpop.gfc, the coefficients HPOP embeds
// (propagator/hpop tests/fixtures/orekit/make-gfc.mjs <out> 70 3.986004415e14
// 6378136.3); EIGEN-6S is read from <orekit-data dir>/Potential/eigen-6s.gfc.
// orekit-truth.mjs builds all of this and calls it.
//
// Case: { id, epoch, state[6] (m, m/s, GCRF), samples[] (ISO UTC, ascending),
//   forces: { gravity EGM2008|EIGEN6S, degree, order?, thirdBodies
//   NONE|SUN_MOON|SUN_MOON_PLANETS (Venus, Mars, Jupiter), solidTides,
//   relativity NONE|SCHWARZSCHILD, srp NONE|CANNONBALL, agom (Cr*A/m, area 1 m^2,
//   mass 1 kg, Cr = agom), atmosphere NONE|NRLMSISE00|DTM2000|HARRIS_PRIESTER|JB2008,
//   b (Cd*A/m likewise), spaceWeather CSSI|CONSTANT },
//   integrator: { tolerance (relative), maxStep (s) } }.
// Output: { cases: [{ id, samples: [{epoch, state[6]}], orekitVersion, notes }] }
// or, for a case Orekit cannot do here, { id, error } (and exit status 2).
//
// Physical constants are set to the values HPOP uses (the template is
// propagator/hpop tests/fixtures/orekit/OrekitReference.java), so a difference
// between two cases, or between a case and HPOP, is a model difference, not a
// constants difference: GM 3.986004415e14 m^3/s^2, field radius 6378136.3 m,
// Sun and Moon from JPL DE440, ITRF with IERS 2010 conventions, solar
// irradiance 1361 W/m^2 at 1 au, Sun radius 695 700 km, a spherical Earth of
// 6378137 m for the conical shadow, NRLMSISE-00 on mean local solar time (the
// template's wrapper; Orekit 13.1 uses apparent solar time) with the daily Ap
// only (switch 9 = 1). CONSTANT space weather is F10.7 = F10.7a = 150, Ap = 15
// (Kp = 3 for DTM2000). Integrator: DormandPrince853, absolute tolerance
// 1e-7, relative tolerance and maximum step from the case.
// JB2008 reads SOLFSMY.TXT and DTCFILE.TXT from <orekit-data dir> (the copy in
// orekit-data ends in June 2026; -Dorekit.jb2008Dir=<dir> reads a newer pair there)
// and has no constant-input convention.
import java.io.File;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.hipparchus.CalculusFieldElement;
import org.hipparchus.geometry.euclidean.threed.FieldVector3D;
import org.hipparchus.geometry.euclidean.threed.Vector3D;
import org.hipparchus.ode.nonstiff.DormandPrince853Integrator;
import org.orekit.bodies.CelestialBody;
import org.orekit.bodies.CelestialBodyFactory;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.data.DataContext;
import org.orekit.data.DirectoryCrawler;
import org.orekit.forces.drag.DragForce;
import org.orekit.forces.drag.IsotropicDrag;
import org.orekit.forces.gravity.HolmesFeatherstoneAttractionModel;
import org.orekit.forces.gravity.Relativity;
import org.orekit.forces.gravity.SolidTides;
import org.orekit.forces.gravity.ThirdBodyAttraction;
import org.orekit.forces.gravity.potential.GravityFieldFactory;
import org.orekit.forces.gravity.potential.ICGEMFormatReader;
import org.orekit.forces.gravity.potential.TideSystem;
import org.orekit.forces.radiation.IsotropicRadiationSingleCoefficient;
import org.orekit.forces.radiation.SolarRadiationPressure;
import org.orekit.frames.Frame;
import org.orekit.frames.FramesFactory;
import org.orekit.models.earth.atmosphere.Atmosphere;
import org.orekit.models.earth.atmosphere.DTM2000;
import org.orekit.models.earth.atmosphere.DTM2000InputParameters;
import org.orekit.models.earth.atmosphere.HarrisPriester;
import org.orekit.models.earth.atmosphere.JB2008;
import org.orekit.models.earth.atmosphere.NRLMSISE00;
import org.orekit.models.earth.atmosphere.NRLMSISE00InputParameters;
import org.orekit.models.earth.atmosphere.data.CssiSpaceWeatherData;
import org.orekit.models.earth.atmosphere.data.JB2008SpaceEnvironmentData;
import org.orekit.orbits.CartesianOrbit;
import org.orekit.propagation.SpacecraftState;
import org.orekit.propagation.numerical.NumericalPropagator;
import org.orekit.time.AbsoluteDate;
import org.orekit.time.FieldAbsoluteDate;
import org.orekit.time.TimeScale;
import org.orekit.time.TimeScalesFactory;
import org.orekit.utils.Constants;
import org.orekit.utils.ExtendedPositionProvider;
import org.orekit.utils.IERSConventions;
import org.orekit.utils.PVCoordinates;

public class OrekitTruth {
    static final double GM = 3.986004415e14, FIELD_RADIUS = 6378136.3, RE = 6378137.0;
    static final double AU = 149597870700.0, SOLAR_PRESSURE = 1361.0 / 299792458.0;  // N/m^2 at 1 au
    static final double F107 = 150.0, AP = 15.0, KP = 3.0;

    // ---- minimal JSON reader: objects -> Map, arrays -> List, numbers -> Double ----
    static final class Json {
        final String s; int i = 0;
        Json(String s) { this.s = s; }
        Object read() { ws(); char c = s.charAt(i);
            if (c == '{') { Map<String, Object> m = new java.util.LinkedHashMap<>(); i++; ws();
                if (s.charAt(i) == '}') { i++; return m; }
                do { ws(); String k = (String) read(); ws(); i++; m.put(k, read()); ws(); } while (s.charAt(i++) == ',');
                return m; }
            if (c == '[') { List<Object> l = new ArrayList<>(); i++; ws();
                if (s.charAt(i) == ']') { i++; return l; }
                do { l.add(read()); ws(); } while (s.charAt(i++) == ',');
                return l; }
            if (c == '"') { StringBuilder b = new StringBuilder(); i++;
                while (s.charAt(i) != '"') { char d = s.charAt(i++); if (d == '\\') { char e = s.charAt(i++); b.append(e == 'n' ? '\n' : e == 't' ? '\t' : e == 'u' ? (char) Integer.parseInt(s.substring(i, i += 4), 16) : e); } else b.append(d); }
                i++; return b.toString(); }
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int j = i; while (j < s.length() && "+-.eE0123456789".indexOf(s.charAt(j)) >= 0) j++;
            double d = Double.parseDouble(s.substring(i, j)); i = j; return d; }
        void ws() { while (Character.isWhitespace(s.charAt(i))) i++; }
    }
    @SuppressWarnings("unchecked") static Map<String, Object> obj(Object o) { return (Map<String, Object>) o; }
    @SuppressWarnings("unchecked") static List<Object> arr(Object o) { return (List<Object>) o; }
    static String str(Map<String, Object> m, String k, String dflt) { Object v = m.get(k); return v == null ? dflt : (String) v; }
    static double num(Map<String, Object> m, String k, double dflt) { Object v = m.get(k); return v == null ? dflt : (Double) v; }
    static boolean bool(Map<String, Object> m, String k) { return Boolean.TRUE.equals(m.get(k)); }
    static String oneOf(Map<String, Object> m, String k, String dflt, String... allowed) {
        String v = str(m, k, dflt);
        for (String a : allowed) if (a.equals(v)) return v;
        throw new IllegalArgumentException("forces." + k + " = '" + v + "' is not one of " + String.join("|", allowed));
    }

    // Orekit 13.1's NRLMSISE-00 on mean local solar time (the template's wrapper).
    static final class MeanSolarTimeNRLMSISE00 implements Atmosphere {
        final NRLMSISE00 model; final Frame itrf;
        MeanSolarTimeNRLMSISE00(NRLMSISE00InputParameters weather, OneAxisEllipsoid earth, TimeScale utc) {
            itrf = earth.getBodyFrame();
            // A mean Sun on the ITRF equator at longitude 15 * (12 - UT hours) degrees makes 13.1's hour angle UT + longitude/15.
            ExtendedPositionProvider meanSun = new ExtendedPositionProvider() {
                public Vector3D getPosition(AbsoluteDate date, Frame frame) {
                    double ut = date.getComponents(utc).getTime().getSecondsInLocalDay() / 3600;
                    double lambda = Math.toRadians(15 * (12 - ut)), au = Constants.IAU_2012_ASTRONOMICAL_UNIT;
                    return itrf.getStaticTransformTo(frame, date).transformPosition(new Vector3D(au * Math.cos(lambda), au * Math.sin(lambda), 0));
                }
                public <T extends CalculusFieldElement<T>> FieldVector3D<T> getPosition(FieldAbsoluteDate<T> date, Frame frame) {
                    return new FieldVector3D<>(date.getField(), getPosition(date.toAbsoluteDate(), frame));
                }
            };
            model = new NRLMSISE00(weather, meanSun, earth, utc).withSwitch(9, 1);
        }
        public Frame getFrame() { return itrf; }
        public double getDensity(AbsoluteDate date, Vector3D position, Frame frame) {
            return model.getDensity(date, frame.getStaticTransformTo(itrf, date).transformPosition(position), itrf);
        }
        public <T extends CalculusFieldElement<T>> T getDensity(FieldAbsoluteDate<T> date, FieldVector3D<T> position, Frame frame) {
            return model.getDensity(date, frame.getStaticTransformTo(itrf, date).transformPosition(position), itrf);
        }
    }

    // F10.7 = F10.7a = 150, Ap = 15 (Kp = 3), for every date.
    static final class ConstantWeather implements NRLMSISE00InputParameters, DTM2000InputParameters {
        public AbsoluteDate getMinDate() { return AbsoluteDate.PAST_INFINITY; }
        public AbsoluteDate getMaxDate() { return AbsoluteDate.FUTURE_INFINITY; }
        public double getDailyFlux(AbsoluteDate d) { return F107; }
        public double getAverageFlux(AbsoluteDate d) { return F107; }
        public double[] getAp(AbsoluteDate d) { return new double[] {AP, AP, AP, AP, AP, AP, AP}; }
        public double getInstantFlux(AbsoluteDate d) { return F107; }
        public double getMeanFlux(AbsoluteDate d) { return F107; }
        public double getThreeHourlyKP(AbsoluteDate d) { return KP; }
        public double get24HoursKp(AbsoluteDate d) { return KP; }
    }

    static CssiSpaceWeatherData cssi;
    static CssiSpaceWeatherData cssi() { return cssi != null ? cssi : (cssi = new CssiSpaceWeatherData(CssiSpaceWeatherData.DEFAULT_SUPPORTED_NAMES)); }

    // SOLFSMY.TXT and DTCFILE.TXT from -Dorekit.jb2008Dir, else from the orekit-data directory.
    static JB2008SpaceEnvironmentData jb2008Data() {
        String dir = System.getProperty("orekit.jb2008Dir");
        return dir == null
            ? new JB2008SpaceEnvironmentData(JB2008SpaceEnvironmentData.DEFAULT_SUPPORTED_NAMES_SOLFSMY, JB2008SpaceEnvironmentData.DEFAULT_SUPPORTED_NAMES_DTC)
            : new JB2008SpaceEnvironmentData(new org.orekit.data.DataSource(new File(dir, "SOLFSMY.TXT")), new org.orekit.data.DataSource(new File(dir, "DTCFILE.TXT")));
    }

    // Propagates one case; returns {samples json, notes}.
    static String[] run(Map<String, Object> c, Frame gcrf, Frame itrf, TimeScale utc, CelestialBody sun, CelestialBody moon) {
        Map<String, Object> f = obj(c.get("forces")), ig = obj(c.get("integrator"));
        String gravity = oneOf(f, "gravity", "EGM2008", "EGM2008", "EIGEN6S");
        int degree = (int) num(f, "degree", 0), order = (int) num(f, "order", degree);
        if (gravity.equals("EGM2008") && degree > 70) throw new IllegalArgumentException("EGM2008 as embedded in HPOP stops at degree 70");
        String bodies = oneOf(f, "thirdBodies", "NONE", "NONE", "SUN_MOON", "SUN_MOON_PLANETS");
        String relativity = oneOf(f, "relativity", "NONE", "NONE", "SCHWARZSCHILD");
        String srp = oneOf(f, "srp", "NONE", "NONE", "CANNONBALL");
        String atm = oneOf(f, "atmosphere", "NONE", "NONE", "NRLMSISE00", "DTM2000", "HARRIS_PRIESTER", "JB2008");
        String weather = oneOf(f, "spaceWeather", "CONSTANT", "CSSI", "CONSTANT");
        if (atm.equals("JB2008") && weather.equals("CONSTANT")) throw new IllegalArgumentException("JB2008 has no constant space-weather convention; use spaceWeather CSSI (SET indices from the orekit-data directory)");
        double tolerance = num(ig, "tolerance", 1e-13), maxStep = num(ig, "maxStep", 30);

        AbsoluteDate epoch = new AbsoluteDate(((String) c.get("epoch")).replaceAll("Z$", ""), utc);
        List<Object> st = arr(c.get("state"));
        double[] x = new double[6];
        for (int k = 0; k < 6; ++k) x[k] = (Double) st.get(k);
        CartesianOrbit orbit = new CartesianOrbit(new PVCoordinates(new Vector3D(x[0], x[1], x[2]), new Vector3D(x[3], x[4], x[5])), gcrf, epoch, GM);
        NumericalPropagator p = new NumericalPropagator(new DormandPrince853Integrator(1e-3, maxStep, 1e-7, tolerance));
        p.setOrbitType(org.orekit.orbits.OrbitType.CARTESIAN);
        p.setInitialState(new SpacecraftState(orbit).withMass(1.0));

        if (degree > 0) {
            GravityFieldFactory.clearPotentialCoefficientsReaders();
            GravityFieldFactory.addPotentialCoefficientsReader(new ICGEMFormatReader(gravity.equals("EGM2008") ? "EGM2008-hpop.gfc" : "eigen-6s.gfc", false));
            p.addForceModel(new HolmesFeatherstoneAttractionModel(itrf, GravityFieldFactory.getNormalizedProvider(degree, order)));
        }
        if (!bodies.equals("NONE")) { p.addForceModel(new ThirdBodyAttraction(sun)); p.addForceModel(new ThirdBodyAttraction(moon)); }
        if (bodies.equals("SUN_MOON_PLANETS"))
            for (CelestialBody b : new CelestialBody[] {CelestialBodyFactory.getVenus(), CelestialBodyFactory.getMars(), CelestialBodyFactory.getJupiter()})
                p.addForceModel(new ThirdBodyAttraction(b));
        if (bool(f, "solidTides"))  // IERS 2010 section 6.2, no pole tide, tide-free field, coefficients every 60 s
            p.addForceModel(new SolidTides(itrf, FIELD_RADIUS, GM, TideSystem.TIDE_FREE, false, 60.0, 12, IERSConventions.IERS_2010, TimeScalesFactory.getUT1(IERSConventions.IERS_2010, false), sun, moon));
        if (relativity.equals("SCHWARZSCHILD")) p.addForceModel(new Relativity(GM));
        if (srp.equals("CANNONBALL"))  // conical (umbra + penumbra) shadow of a spherical Earth
            p.addForceModel(new SolarRadiationPressure(AU, SOLAR_PRESSURE, sun, new OneAxisEllipsoid(RE, 0.0, itrf), new IsotropicRadiationSingleCoefficient(1.0, num(f, "agom", 0))));
        if (!atm.equals("NONE")) {
            OneAxisEllipsoid earth = new OneAxisEllipsoid(Constants.WGS84_EARTH_EQUATORIAL_RADIUS, Constants.WGS84_EARTH_FLATTENING, itrf);
            boolean constant = weather.equals("CONSTANT");
            Atmosphere a = switch (atm) {
                case "NRLMSISE00" -> new MeanSolarTimeNRLMSISE00(constant ? new ConstantWeather() : cssi(), earth, utc);
                case "DTM2000" -> new DTM2000(constant ? new ConstantWeather() : cssi(), sun, earth);
                case "HARRIS_PRIESTER" -> new HarrisPriester(sun, earth);
                default -> new JB2008(jb2008Data(), sun, earth);
            };
            p.addForceModel(new DragForce(a, new IsotropicDrag(1.0, num(f, "b", 0))));
        }

        StringBuilder out = new StringBuilder();
        for (Object o : arr(c.get("samples"))) {
            String iso = (String) o;
            PVCoordinates pv = p.propagate(new AbsoluteDate(iso.replaceAll("Z$", ""), utc)).getPVCoordinates(gcrf);
            Vector3D r = pv.getPosition(), v = pv.getVelocity();
            out.append(out.length() == 0 ? "" : ",").append(String.format("{\"epoch\":\"%s\",\"state\":[%.9f,%.9f,%.9f,%.12f,%.12f,%.12f]}",
                iso, r.getX(), r.getY(), r.getZ(), v.getX(), v.getY(), v.getZ()));
        }
        String notes = String.format("%s %dx%d, third bodies %s, solid tides %b, relativity %s, SRP %s, drag %s (%s weather), DormandPrince853 rtol %.1e max step %.0f s, GCRF",
            gravity, degree, order, bodies, bool(f, "solidTides"), relativity, srp, atm, weather, tolerance, maxStep);
        return new String[] {out.toString(), notes};
    }

    static String quote(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\""; }

    public static void main(String[] args) throws Exception {
        Locale.setDefault(Locale.ROOT);
        DataContext.getDefault().getDataProvidersManager().addProvider(new DirectoryCrawler(new File(args[0])));
        DataContext.getDefault().getDataProvidersManager().addProvider(new DirectoryCrawler(new File(args[1])));
        TimeScale utc = TimeScalesFactory.getUTC();
        Frame gcrf = FramesFactory.getGCRF(), itrf = FramesFactory.getITRF(IERSConventions.IERS_2010, false);
        CelestialBody sun = CelestialBodyFactory.getSun(), moon = CelestialBodyFactory.getMoon();
        String version = System.getProperty("orekit.version", "13.1");
        Map<String, Object> input = obj(new Json(Files.readString(new File(args[2]).toPath())).read());
        StringBuilder out = new StringBuilder("{\"cases\":[");
        boolean failed = false;
        for (Object o : arr(input.get("cases"))) {
            Map<String, Object> c = obj(o);
            String id = (String) c.get("id");
            if (out.charAt(out.length() - 1) != '[') out.append(",\n");
            try {
                String[] r = run(c, gcrf, itrf, utc, sun, moon);
                out.append(String.format("{\"id\":%s,\"orekitVersion\":%s,\"notes\":%s,\"samples\":[%s]}", quote(id), quote(version), quote(r[1]), r[0]));
                System.err.println(id + " done");
            } catch (Exception e) {
                failed = true;
                out.append(String.format("{\"id\":%s,\"error\":%s}", quote(id), quote(e.getClass().getSimpleName() + ": " + e.getMessage())));
                System.err.println(id + " FAILED: " + e);
            }
        }
        out.append("]}\n");
        try (PrintWriter w = new PrintWriter(args[3], "UTF-8")) { w.print(out); }
        if (failed) System.exit(2);
    }
}
