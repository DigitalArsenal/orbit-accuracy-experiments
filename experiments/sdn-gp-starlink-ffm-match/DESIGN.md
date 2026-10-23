# SDN-GP: design of the theory (mathematics first)

Task `experiments-sdn-gp-starlink-ffm-match-20261023`, written for side B of the clean room
(`modules-sdn-gp-propagator-20261023`). Sources: open literature, the public SGP4-XP release-note
description, side A's `SPEC.md` (closed-modules `packages/sdn-gp-propagator/SPEC.md` at 4b454a9) and its
`spec-vectors/`, side B's measured status (its README at 7d64707), and this experiment's baselines
(`results/sdn-gp-starlink-ffm-match/README.md`, cited below as **G1**). Nothing of the US Space Force library's
internals was read. No implementation code appears here; equations are written in the notation of `SPEC.md`
(Earth radii and minutes inside the theory unless a unit is given).

Owner, 2026-10-23, verbatim: "we should have modified the XP to work like our current SGP4 and hyper optimize it so
taht we're fast"; "I want to be able to improve it and be able to roll in our version of dynamically calibrated
atmosphere"; "we want something that's going to match the FFM propagated starlink as close as possible, and also do
other cool math shit, whatever you can think of"; "We should have stuff for satellites in every orbital regime even
cislunar in there, and interplanetary"; "Also trying to figure out why other people haven't done this yet"; about
COMSPOC's full-catalog XP sets: "yes, I want to beat them".

**Headline target.** SDN-GP fitted to a truth beats SGP4-XP fitted to the same truth on the same windows
("best-case XP", G1 arm 2) on held-out days 1 to 3, in every regime of the G1 headline table, at no more than
4 KiB of state per object and within 2 times side B's measured SGP4XP propagation cost.

**The measured starting point (G1, median 3D RMS, km, fit / day 1 / day 3; best-case XP vs SGP4).**

| Regime | best-case XP | SGP4 | day-3 in-track share (XP) |
| --- | --- | --- | --- |
| LEO, Starlink, FFM-propagated truth (239) | 0.483 / 1.502 / 9.867 | 0.480 / 2.008 / 14.6 | 99.8 % |
| LEO, ISS (NASA OEM, 14 windows) | 0.455 / 2.124 / 16.5 | 0.460 / 2.047 / 16.3 | 99.9 % |
| LEO, laser-ranged (98) | 0.409 / 0.970 / 9.399 | 0.415 / 1.219 / 9.193 | 99.9 % |
| MEO, GNSS (60) | 0.022 / 0.064 / 0.187 | 0.122 / 0.319 / 1.566 | 89 % |
| MEO, laser-ranged high (77) | 0.125 / 0.146 / 0.271 | 0.127 / 0.211 / 1.075 | 97 % |
| IGSO (120) | 0.109 / 0.246 / 0.556 | 0.758 / 1.804 / 5.630 | 87 % |
| GEO (84) | 0.146 / 0.317 / 0.805 | 0.931 / 4.692 / 35.5 | 90 % |

Three further G1 facts drive the design: the fit-span study (next-day XP error 1.330 / 0.819 / 0.769 km for 24 /
48 / 72 h fits on 100 Starlinks); COMSPOC's XP sets at matched age (15.7 km against 10.3 km for best-case XP on the
same 40 Starlinks); covariance realism (mean d²/3 of 24.9 for SynCoPate and 3.40 for our E14 S3-KC on SGP4, where
1 is realistic).

---

## 1. Prior art and why it stops short

### 1.0 The short answer to "why hasn't anyone done this"

Almost every term in this document exists somewhere in the open literature; what does not exist is the
combination, because no one has had all of its inputs at once, in the open. The public US catalog standardized on
SGP4 in 1980 for interoperability, and the operational need for accuracy was met another way: special-perturbations
(numerical) orbits with HASDM's dynamically calibrated atmosphere, kept inside the Space Surveillance Network and
shared as conjunction messages, not as a better public theory (Hoots, Schumacher & Glover 2004; Storz et al. 2005).
The analytic theories that did go further (HANDE with a dynamic atmosphere in 1987; DSST with tesseral and resonant
terms since the late 1970s) never became an exchange format, so no consumer base pulled them into the public data
stream. Improving a general-perturbations theory also needs three things the public never had together: precise
truth for the whole catalog (only operators and science missions have it, and few publish), a dynamic density that
anyone may use (HASDM output is controlled and JB2008's driving indices are commercial), and the operator's own
maneuver plans (constellations thrust continuously, which ballistic theories cannot represent). COMSPOC's XP sets
show the consequence: they are fitted to orbits built from public element-set histories, so their truth is itself
limited by SGP4, and G1 measures them at 15.7 km at an age where XP fitted to precise truth is at 10.3 km. SDN has
all three inputs in the open: operator ephemerides for about 90 % of the active catalog, FFM-1 to turn them into
dynamically consistent truth, and an open DCA (E13, E13b) with open space weather (GFZ, NOAA SWPC). SDN-GP is the
theory that carries them.

### 1.1 SGP, SGP4 and SDP4

- **What it does.** Brouwer–Lyddane mean elements under J2, J3 and J4 (Kozai mean motion on input), with drag from
  Lane's power-law density ρ = ρ₀ ((q₀ − s)/(r − s))⁴ through a single fitted B*, and, above a 225-minute period
  (SDP4), lunar–solar secular and periodic terms and the half-day and one-day resonances (Hujsak 1979). Closed form:
  one evaluation per output time (Lane & Cranford 1969; Lane & Hoots 1979; Hoots & Roehrich 1980; Vallado et al.
  2006).
- **Where it stops.** The atmosphere is static (no solar or geomagnetic dependence), so B* absorbs every density
  change and every thrust, and takes non-physical (including negative) values; no solar radiation pressure; no
  tesseral terms below the deep-space bands; no covariance. Fitted to precise ephemerides it reaches about 1 km at
  epoch and grows a few km per day in LEO (Kelso 2007; Vallado & Crawford 2008); G1 measures 0.48 km fit and 14.6 km
  day 3 on FFM-propagated Starlink.
- **What SDN-GP adds.** Everything below; SDN-GP keeps SGP4's virtue, a self-contained element set that any
  consumer propagates without a network, as its fallback mode (section 2a: climatology when no weather is reachable).

### 1.2 SGP4-XP

- **What it does.** The US Space Force's extended theory (Astrodynamics Standards release notes 8.0 and later;
  `SPEC.md`): six mean equinoctial elements integrated by a third-order Runge–Kutta step on an epoch-anchored grid of
  two periods (95 minutes for epoch periods of 1,100 minutes and more), cubic Hermite output, zonals through J5 in the
  Brouwer manner, Jacchia-70 density driven by a date-only generic solar-cycle flux model, 13-point Gauss–Legendre
  orbit averaging of drag, cannonball SRP (AGOM) with an Escobal shadow, analytic Sun and Moon to the octupole,
  resonance classes at 1 day, 0.5 day, 16 h and 8 h, and Brouwer J2 short-periodics. Element set: the two-line form
  with B (m²/kg) and AGOM in place of n-dot and n-ddot.
- **Where it stops.** By design the element set carries no space weather: the flux and Ap are a fixed function of
  date (`SPEC.md` 3.1), so real solar and geomagnetic variation is absent and the fitted B absorbs it. There is no
  thrust term: drag makeup and net thrust can only be absorbed by B (G1's own truth fitter, which is ballistic too,
  puts 52 of 239 Starlinks at B_eff = 0). No tesseral terms outside the four resonance classes (the LEO fit floor of
  0.44 km in-track is shared with SGP4, G1 section 3), no covariance output, Earth-centered only (the release notes
  list a lunar potential and lunar shadow as planned).
- **What SDN-GP adds.** It keeps XP's integrator, grid, checkpoints and output chain unchanged (so side B's SGP4XP
  path is reused), and replaces or adds rate terms: real density with late-bound weather (2a), thrust (2b), empirical
  along-track terms (2c), tesseral m-daily and shallow-resonance terms (2d), fitting rules (2e), an analytic STM with
  calibrated process noise (2f), a residual series (2g) and non-Earth centers (2h).

### 1.3 PPT2 and PPT3

- **What it does.** The Navy's analytic theory (NAVSPASUR, later Naval Space Command): Brouwer–Lyddane with a
  simplified drag term in the mean motion and its rate, and analytic partials for differential correction ("Position
  and Partials as functions of Time"); PPT3 extended the zonals to J5 (Solomon 1991; Hoots, Schumacher & Glover 2004).
  XP's release notes cite PPT3 as the reference for its zonal content (`SPEC.md` section 2).
- **Where it stops.** Drag enters as fitted polynomial rates of the mean motion, not as a density model, so
  prediction beyond the fit span extrapolates a polynomial; no lunar–solar or resonance terms of XP's scope; Earth
  only.
- **What SDN-GP adds.** Analytic partials survive as the STM of section 2f, now including the drag and thrust
  parameters, and the polynomial drag rates are replaced by a density model with a physically decaying correction.

### 1.4 HANDE (Hoots & France 1987)

- **What it does.** An analytic theory with gravity and a *dynamic* atmosphere: Jacchia's density driven by the
  observed solar flux and geomagnetic index, integrated analytically along the orbit (Hoots & France 1987). It was
  built as an accuracy upgrade of SGP4 for space surveillance (Hoots, Schumacher & Glover 2004).
- **Where it stops.** It never replaced SGP4 in the public catalog; operations met the accuracy need with numerical
  orbits and HASDM instead. Its atmosphere is Jacchia with indices only (no calibration), and its density input is
  the index history at fit time.
- **What SDN-GP adds.** The closest ancestor of term 2a. SDN-GP uses a calibrated density (NRLMSISE-00 × exp s(t))
  and binds the density at propagation time, not at fit time (section 2a.6), so an old element set improves when a
  newer density nowcast is published.

### 1.5 Brouwer–Lyddane and Kozai

- **What it does.** First-order (in J2) closed-form solutions of the zonal problem by canonical averaging: secular
  rates to second order, long-period terms in ω, short-period terms in M (Brouwer 1959; Kozai 1959), made regular
  at small e and i by Lyddane's (1963) nonsingular variables.
- **Where it stops.** No drag (Brouwer's title: "without drag"); no tesserals or third bodies; the long-period terms
  are singular at the critical inclination (the divisor 1 − 5 cos² i).
- **What SDN-GP adds.** These remain the zonal core of the averaged rates (as in XP) and the short-period map at the
  output; the critical-inclination divisor never appears because the long-period terms are integrated, not solved
  in closed form (XP's choice, `SPEC.md` section 2).

### 1.6 Liu (SALT) and King-Hele drag theories

- **What it does.** Analytic and semi-analytic theories of drag on near-circular and eccentric orbits: King-Hele's
  expansions in modified Bessel functions Iₖ(ae/H) for an exponential, oblate, rotating atmosphere with a day-to-night
  bulge (King-Hele 1964, 1987); Liu's semi-analytic theory (SALT) integrating averaged equations with J2 and an
  atmosphere model, used for lifetime and decay prediction (Liu 1974; Liu & Alford 1980).
- **Where it stops.** Static or index-driven atmospheres with fixed scale heights; built for lifetime, not for a
  catalog exchange format; no thrust.
- **What SDN-GP adds.** King-Hele's Bessel-function treatment of the eccentricity direction becomes the radial part of
  the catalog-shared density kernel of section 2a.4, joined to a spherical-harmonic description of the
  latitude–local-time structure, which makes the orbit average a short sum instead of 13 density calls.

### 1.7 DSST (Draper Semianalytic Satellite Theory)

- **What it does.** Mean equinoctial elements integrated with large steps under averaged rates from the zonal,
  tesseral (resonant and m-daily), third-body, drag (by numerical quadrature over the orbit, any atmosphere model) and
  SRP terms, with short-periodic series recovered at output; analytic partials for orbit determination (McClain 1977;
  Danielson et al. 1995). It runs in GTDS and in the open Orekit library (Maisonobe, Pommier & Parraud 2010), and it
  has been studied for catalog maintenance (Setty et al. 2016).
- **Where it stops.** DSST is the most complete prior art, but it is a propagator inside orbit-determination
  systems, not an element-set standard: no public catalog is distributed as DSST mean elements, its drag has no
  calibrated density or thrust term, and its per-object cost (full short-periodic recovery with many tesseral terms)
  is set for one satellite at a time, not for a 30,000-object console frame.
- **What SDN-GP adds.** SDN-GP takes DSST's tesseral m-daily and resonance formulation (section 2d) in the minimal
  form the G1 floor calls for, and adds what DSST lacks: the calibrated, late-bound density, the thrust term, the
  calibrated covariance, a residual series, one element-set form for every central body, and catalog-scale cost.

### 1.8 HASDM and other dynamic calibrations

- **What it does.** HASDM's Dynamic Calibration of the Atmosphere (DCA) estimates corrections to a Jacchia-type
  density (temperature parameters, spherical-harmonic in latitude and local time, every 3 hours) from the drag of
  about 75 calibration satellites, and forecasts them (Marcos et al. 1998; Casali & Barker 2002; Storz et al. 2005);
  JB2008 is its companion empirical model (Bowman et al. 2008). Open analogues calibrate a model from element-set
  decay (Picone, Emmert & Lean 2005; Doornbos, Klinkrad & Visser 2008; Gondelach & Linares 2020). Our E5, E8, E13
  and E13b are open calibrations; E13's fleet common mode reduces the density spread against Swarm and GRACE-FO by
  R1 = 0.247 (E13 test A), and the SDS `$DCL` record publishes s(t).
- **Where it stops.** Every one of them feeds a numerical propagator. HASDM's output is controlled (a historical
  database was released: Tobiska et al. 2021); none has been rolled into a general-perturbations element set. The
  errors these corrections remove grow along-track as t^(3/2) to t² (Emmert et al. 2017), which is exactly the error
  that dominates G1 (99.8 % in-track at day 3), but only a theory with a density term can use them.
- **What SDN-GP adds.** The DCA inside the averaged rates of an analytic theory (2a), with the forecast chain beyond
  the data, and the density-error statistics of E13 as the process noise of the analytic covariance (2f).

### 1.9 CelesTrak SupGP

- **What it does.** Supplemental GP element sets: SGP4 fitted to operator ephemerides (SpaceX, OneWeb, Planet and
  others) and published beside the public catalog (CelesTrak SupGP documentation; Kelso 2007 for the method on GPS
  precise ephemerides).
- **Where it stops.** It is SGP4: the theory's floor and static atmosphere remain, and the Starlink inputs contain
  SpaceX's planned thrust and the 48-hour blend join (G1 truth notes), which SGP4's B* folds in non-physically.
- **What SDN-GP adds.** The same input (operator ephemerides, now through FFM-1 and the κ·D thrust model), fitted with
  a theory that can carry thrust and density, scored on newer-file and precise truth rather than on the forecast.

### 1.10 COMSPOC Spacebook: XP sets and SynCoPate (published descriptions only)

- **What it does.** Spacebook publishes SGP4-XP element sets for the full catalog and SynCoPate trajectories with
  covariance, both generated by COMSPOC from its own processing of public element-set histories (Spacebook product
  documentation).
- **Where it stops.** XP fitted to trajectories that are themselves derived from SGP4 histories inherits both
  theories' limits. G1 scores them locally (never fitted to, never an input): 15.7 km at their first truth day (age
  3.2 days) on 40 Starlinks against 10.3 km for XP fitted to the FFM truth at a matched age, and SynCoPate's
  covariance at mean d²/3 = 24.9 (95 % coverage 0.71), overconfident by a factor of about 5 in sigma.
- **What SDN-GP adds.** Precise truth instead of element-set histories, a better theory than XP fitted to it, and a
  covariance calibrated to d²/3 near 1 (2f). Beating best-case XP in every regime beats COMSPOC's XP by construction,
  because their sets cannot beat XP fitted to precise truth.

### 1.11 SPICE SPK Chebyshev ephemerides

- **What it does.** Piecewise Chebyshev polynomials in time for position (types 2 and 3; JPL's planetary ephemerides
  in the same form, Newhall 1989), evaluated by Clenshaw's recurrence; exact to the source trajectory at any
  tolerance (Acton 1996; Acton et al. 2018; NAIF SPK Required Reading).
- **Where it stops.** No physics: nothing beyond the span, no covariance, and bytes grow linearly with span and with
  the dynamics' bandwidth (a LEO orbit needs records of a fraction of a revolution).
- **What SDN-GP adds.** Section 2g puts the Chebyshev on the *residual* of a theory, which is slow and small, so the
  bytes fall by one to two orders of magnitude at the same accuracy, and beyond the span the set falls back to the
  theory instead of ending.

### 1.12 VSOP87 and JPL approximate planetary elements

- **What it does.** VSOP87 is a Poisson-series theory of the planets fitted to numerical integration (Bretagnon &
  Francou 1988); JPL's approximate Keplerian elements give each planet linear element rates (and four extra terms for
  the outer planets) fitted over 1800–2050 (Standish & Williams, in Urban & Seidelmann 2012).
- **Where it stops.** Planets only, one fixed fit per body, no spacecraft, no SRP, no covariance.
- **What SDN-GP adds.** The same idea per spacecraft and per segment: mean heliocentric elements with secular rates,
  an SRP-reduced solar gravitational parameter and a fitted residual (section 2h.3).

### 1.13 Richardson halo series and Lindstedt–Poincaré

- **What it does.** Analytic periodic orbits about the collinear libration points of the circular restricted
  three-body problem (CR3BP): Richardson's (1980) third-order Lindstedt–Poincaré expansion of halo orbits (after
  Farquhar & Kamel 1973), carried to high order by Jorba & Masdemont (1999) and Gómez et al. (2001).
- **Where it stops.** The CR3BP is circular and has no Sun; the series converge slowly at large amplitude, so near
  rectilinear halo orbits (NRHOs, perilune of a few thousand km) are out of reach of a third-order series; in the real
  ephemeris the orbits are quasi-periodic. Mission practice therefore ships numerically corrected ephemerides (for
  example the Gateway reference NRHO, Lee 2019) as SPK files.
- **What SDN-GP adds.** The series as the *basis* of a fitted quasi-periodic representation in the synodic frame,
  with the phase regularized by a Sundman transformation so that a short series spans the perilune passage, fitted to
  an ephemeris and carried in the same element-set form (2h.2).

### 1.14 Which theory has which term

| Term | SGP4 | XP | PPT3 | HANDE | DSST (Orekit) | SDN-GP |
| --- | --- | --- | --- | --- | --- | --- |
| Zonals through J5, averaged and integrated | J2–J4 closed form | yes | J2–J5 closed form | analytic | yes | yes (XP's) |
| Density driven by observed weather | no | no (date only) | no | yes | model inputs | yes, calibrated, late-bound |
| Dynamic calibration (DCA) | no | no | no | no | no | yes (2a) |
| Thrust (drag makeup, net thrust) | B* sign only | no | no | no | no | yes (2b, 2c) |
| Tesseral m-daily short-periodics | no | no | no | no | yes | yes (2d) |
| Resonances | 0.5 d, 1 d | 4 classes | no | no | any (j, m) | any (j, m) in a band (2d) |
| Analytic partials or STM | no | for its fit | yes | no | yes | yes, with process noise (2f) |
| Calibrated covariance | no | no | no | no | no | yes (2f) |
| Residual series per object | no | no | no | no | no | yes (2g) |
| Non-Earth centers | no | no | no | no | no | Moon, libration, Sun, planets (2h) |

---

## 2. SDN-GP terms

### 2.0 Framework, notation and the cost baseline

**State.** The six mean equinoctial elements of `SPEC.md` 1.5, y = (n, a_f, a_g, χ, ψ, λ), with a_f + i a_g =
e e^{i(ω+Ω)} and ψ + i χ = tan(i/2) e^{iΩ}. SDN-GP integrates

    ẏ = f_zonal + f_3body + f_res + f_SRP + f_drag + f_thrust + f_emp

with XP's third-order Runge–Kutta step, epoch-anchored grid, fallbacks and cubic Hermite output unchanged
(`SPEC.md` 9), so the module reuses side B's integrator, checkpoints and batch entry. New terms enter in one of two
places only: the averaged rate function (evaluated at the RK stages and nodes), or the output-time correction chain
of `SPEC.md` 8 (added after the Hermite step, beside the Sun/Moon and J2 short-periodics).

**Gauss equations.** A perturbing acceleration with radial, transverse and normal components (R, T, N) changes the
elements as in Walker, Ireland & Owens (1985), with true longitude L = Ω + ω + ν, w = 1 + a_f cos L + a_g sin L,
s² = 1 + χ² + ψ² and p the semi-latus rectum:

    ȧ   = (2a²/h) [ e sin ν R + (p/r) T ]                 ṅ = -(3/2)(n/a) ȧ
    ȧ_f = √(p/μ) [ R sin L + ((w+1) cos L + a_f) T/w - (ψ sin L - χ cos L) a_g N/w ]
    ȧ_g = √(p/μ) [ -R cos L + ((w+1) sin L + a_g) T/w + (ψ sin L - χ cos L) a_f N/w ]
    ψ̇   = √(p/μ) s² N cos L / (2w)                        χ̇ = √(p/μ) s² N sin L / (2w)

and the averaged rate of any term is ⟨ẏ⟩ = (1/2π) ∮ ẏ dM = (1/2π) ∮ ẏ (1 - e cos E) dE. For near-circular orbits
(e → 0, u = ω + ν the argument of latitude) the leading forms used for the size estimates below are
ȧ = 2T/n, ṅ = -3T/a, and d(a_f + i a_g)/dt = (1/(na)) ⟨(2T + i R)... ⟩ written out where used.

**The along-track lever.** Every LEO term below is judged by what it does to the mean motion, because a mean-motion
error δn grows into an along-track error s(t) = a ∫ δn dt. A fractional error δ in the drag acceleration held for a
time t gives

    s(t) = (3/4) n |ȧ_D| δ t²                                   (1)

with ȧ_D the drag decay rate of the semi-major axis. For a Starlink at 550 km (n = 1.095e-3 rad/s, B = 0.0078 m²/kg,
ρ ≈ 1.5e-12 kg/m³) ȧ_D = -ρ B √(μa) ≈ -53 m/day, so δ = 10 % for three days is 3.0 km.

**Cost baseline (side B, 2026-10-23, owner Mac, single thread).** SGP4XP: 1.12 µs per object for a 60 s output
step, 361 µs per object for a 1-day jump (about 10 nodes of 4 rate evaluations each, so about 9 µs per rate
evaluation with drag and SRP), 3.26 KiB per object. A term's cost is quoted as added µs per rate evaluation (×40
per object-day in LEO) and added µs per output state; bytes are the added fields of the element set at 4 bytes each
(float32; the SDS `$OMM` record of G1 holds XP's set in 312 bytes).

### 2a. DCA drag in place of Jacchia-70

**2a.1 Force.** Drag on a body with ballistic coefficient B = C_D A/m:

    a_D = -(1/2) B ρ |v_r| v_r,    v_r = v - ω_E × r - w(r, t)

    ρ(r, t) = ρ_MSIS(r, t; F10.7(t - 1 d), F̄81(t), ap(t), ap history) · exp(s(t))

with NRLMSISE-00 (Picone et al. 2002), the open-DCA fleet common mode s(t) published as SDS `$DCL` (E13, E13b), and
the space weather from SDS `$SPW` (GFZ Kp, ap and Ap, Matzka et al. 2021; NOAA SWPC; never SET JB2008 indices or the
CSSI file). w is the neutral wind (default 0; HWM14, Drob et al. 2015, as an option): co-rotation alone is what the
FFM truth uses, and XP's co-rotation probe (`SPEC.md` 3.2) shows the same quadratic |v_r| v_r law.

**2a.2 Orbit average, reference path.** ⟨f_drag⟩ is the Gauss-equation average of a_D over the mean orbit. Two rules:

- eccentric orbits (z = ae/H ≥ 3, H the local density scale height): XP's 13-point Gauss–Legendre rule on the
  perigee band [-ν_c, ν_c] of `SPEC.md` 3.4 (Abramowitz & Stegun 1964, table 25.4), unchanged;
- near-circular orbits (z < 3, all Starlink and most of LEO): the K-point trapezoid rule in eccentric anomaly,
  E_k = 2πk/K, weights (1 - e cos E_k)/K, which converges geometrically for a smooth periodic integrand where
  Gauss–Legendre over a full period does not (Trefethen & Weideman 2014); K = 8 to 12, set by the 2a.7 measurement.

At each node the point's geodetic height and latitude, local solar time and v_r are formed and ρ evaluated. This
path is exact to the FFM truth's density model and serves as the check of 2a.4.

**2a.3 Weather beyond the data (the horizon chain).** The `$SPW` rows end about two days ahead and FFM refuses arcs
past them; SDN-GP never refuses. Each input x ∈ {F10.7, F̄81, ap} takes, in order of availability, the observed
value, the NOAA SWPC 3-day forecast, the SWPC 45-day forecast (daily Ap and F10.7), then a climatology:

- F10.7_clim(t) = (1 AU / r_☉(t))² · Φ(t - t₀), Φ the solar-cycle shape of Hathaway, Wilson & Reichmann (1994),
  Φ(τ) = A τ³ / (exp(τ²/b²) - c), refitted each month to the observed cycle (Hathaway 2015) and mapped to F10.7 by
  the sunspot-number relation of Tapping (2013); F̄81 is its running mean;
- ap_clim(t) = the cycle-phase median of the GFZ record, modulated by the semiannual (Russell & McPherron 1973) term;
- s(t) beyond the last `$DCL` row relaxes to its trailing 27-day mean s̄ with the time constant chosen in E13:

      s(t) = s̄ + (s(t₁) - s̄) exp(-(t - t₁)/τ_s),    τ_s = 48 h.

Each hand-off is blended over one day with a raised-cosine weight, so the density has no step (a density step is a
kink in the along-track error). Every evaluation carries its tier (observed, 3-day, 45-day, climatology); the tier
selects the density-error variance of the covariance (2f.4).

**2a.4 The catalog-shared density kernel (the fast path).** The atmosphere at time t is the same for every object,
so it is expanded once per kernel time and every object's orbit average becomes a short sum. On each sphere of
geocentric radius r_k (k = 1 … K_r, 100 to 1,500 km altitude, about 60 spheres, finer below 400 km) and at kernel
times t_j (3-hourly where ap is observed, daily beyond), in the solar-fixed frame (pole the Earth's rotation axis,
longitude φ_s the hour angle from the subsolar meridian):

    ρ(r_k, θ, φ_s, t_j) / ρ̄_k(t_j) = 1 + Σ_{l=1..L} Σ_{m=-l..l} c_klm(t_j) Y_lm(θ, φ_s)        (2)

projected exactly by a Gauss–Legendre grid in latitude and a uniform grid in φ_s ((L+1)(2L+1) density calls per
sphere). Expanding ρ on spheres of constant geocentric radius puts the Earth's oblateness (the geodetic height of a
circular orbit varies by about 21 km between equator and pole) into the latitude structure, so a circular orbit lies
on one sphere.

Orbit average, circular orbit with pole p̂ (in the solar-fixed frame) and node direction: rotate (2) into the orbit
frame with the Wigner matrices D^l(α, β, γ) (Euler angles of the orbit frame: the node's hour angle, the inclination,
0; Edmonds 1957); along the orbit (colatitude π/2 in that frame) Y_lk(π/2, u) = N_lk P_l^k(0) e^{iku}, so the k-th
Fourier coefficient of the density along the orbit is

    ρ̂_k = ρ̄(r) [ δ_k0 + Σ_l Σ_m c_lm D^l_mk N_lk P_l^k(0) ],      P_l^k(0) = 0 when l + k is odd.     (3)

For k = 0 this is the addition theorem: the great-circle mean of Y_lm is P_l(0) Y_lm(p̂). ρ̂_0 drives ȧ and λ̇,
ρ̂_{±1} drive the eccentricity vector, ρ̂_{±2} the 2/rev terms (kept for the residual budget only). The eccentricity
enters as King-Hele's (1964) radial factor: with r = a(1 - e cos E) and the local scale height H(a) from the radial
grid, exp(z cos E) = I_0(z) + 2 Σ_k I_k(z) cos kE (z = ae/H), so the averaged rates are products of the Bessel series
and (3), truncated at k ≤ 2 for z < 0.5 (Starlink: e ≈ 1e-4 to 2e-3, z < 0.25); for z ≥ 3 the reference path 2a.2
is used. Co-rotation enters exactly through |v_r|²: for a circular orbit |v_r|² = v² (1 - 2 (ω_E r/v) cos i cos²(·) …),
whose orbit average gives King-Hele's factor F = (1 - (r ω_E/v) cos i)² (0.92 for the 53° shell, an 8 % effect on ȧ)
and the cross-track component that drives di/dt; winds, when on, add the HWM14 zonal mean as King-Hele's
atmospheric rotation factor Λ in place of 1.

Interpolation: cubic in r between four spheres, linear in t between kernel times; the solar-fixed frame keeps the
diurnal bulge fixed, and NRLMSISE-00's universal-time (longitude) terms enter through the 3-hourly kernel times.

**2a.5 Late binding of the environment.** The fit constrains the decay over the arc, i.e. the product B ⟨ρ⟩_arc, not
B alone. The element set therefore stores B and ⟨ρ⟩_arc,E (the arc-mean density under the environment E used at fit
time, named by its `$SPW` and `$DCL` record identifiers). At propagation under a newer environment E′,

    B′ = B · ⟨ρ⟩_arc,E / ⟨ρ⟩_arc,E′                                   (4)

keeps the fitted decay over the arc and applies the newer density after it. So an old element set improves when a
newer nowcast is published, without a refit; with no environment reachable E′ is the climatology of 2a.3 and the
result is deterministic. This is the step HANDE (1.4) did not take: its density was the index history at fit time.

**2a.6 Expected gain.**

- FFM-propagated Starlink: the truth's density is NRLMSISE-00 with s = 0 under the same GFZ/SWPC rows and the same
  SWPC 45-day extension (G1 environment), so 2a removes the density-model mismatch entirely (up to the kernel error).
  G1 bounds that mismatch: with no drag in the truth (52 windows at B_eff = 0) best-case XP still reaches 3.77 km on
  day 3, against 9.82 km where drag acts; after the aliasing term of 2d is removed, the remaining drag-related part is
  what 2a targets. Long fits isolate it: with 72 h fits (where aliasing is suppressed, 2e) XP's next-day error is
  0.769 km, which is the one-day growth of the drag-model mismatch and the residual floor. Expected: the 72 h-fit
  next-day error from 0.77 km to the floor of 2d (≈ 0.2 to 0.3 km), and day 3 of the 24 h fit by the same factor once
  2d is in.
- Precise truth (ISS, laser-ranged LEO): the truth's atmosphere is the real one; 2a replaces a date-only flux by the
  observed weather and the DCA. E13 measured the DCA itself in FFM at 3 days: median error ratio 0.74 (Swarm,
  D13-def against JB2008 with SET indices). Against XP's date-only J70 the expected gain is larger, and is the
  measurement of 2a.7.

**2a.7 Cost, parameters, fitting.**

- Kernel build: 60 spheres × (L+1)(2L+1) = 91 calls (L = 6) = 5,460 NRLMSISE-00 calls per kernel time, about 27 ms at
  about 5 µs per call (to be measured in WASM); at 3-hourly times about 0.22 s per catalog-day, shared by the
  ~15,000 objects with perigee below 1,500 km: about 15 µs per object-day.
- Per rate evaluation: radial interpolation of 49 coefficients on four spheres, the e^{imα} phases (the d^l(i)
  matrices are cached per object at each node, i being nearly constant), and the k ≤ 2 sums of (3): about 600 flops,
  ≈ 0.3 µs, against about 65 µs for the 13-point reference path with direct NRLMSISE-00 calls. Shared memory: 60 × 49
  × 8 bytes = 23.5 KiB per kernel time (2.2 MiB for four days at 3-hourly, daily beyond), none per object.
- Parameters per object: B (as XP's BTERM, now signed, 2b) and ⟨ρ⟩_arc (4 bytes) plus an 8-byte environment
  identifier: +12 bytes.
- Fitting: B (or B_eff) by the same Levenberg–Marquardt as XP's fit, with the environment fixed during the fit.
- Acceptance of the fast path: the kernel's ⟨ρ⟩ within 1 % of the reference path (one tenth of the DCA's own 9 %
  scatter, E13) over the G1 population and a solar-cycle range of dates.

### 2b. Starlink drag-makeup thrust, T = κ·D

**2b.1 Model.** The drag-makeup thrust of the operator model is proportional to the drag and opposite to it:

    a_T = -κ a_D   ⇒   a_D + a_T = -(1/2)(1 - κ) B ρ |v_r| v_r,    B_eff = (1 - κ) B             (5)

so in the averaged rates 2b is 2a with B replaced by B_eff, and B_eff tracks the density, storms included. If the
thrust is along the inertial velocity instead of v_r, the difference is the co-rotation angle (r ω_E cos i / v ≈
2.3° at 53°) in the cross-track component, a small inclination-rate term carried for completeness.

**2b.2 Identifiability.** One arc observes only the product B_eff (the decay), so κ is not identified by a single
ballistic arc (E13b: "absolute density and B are not independently identified, continuous thrust is confounded
without coasts"). With a prior B ~ N(B̂, σ_B²) — from E13b's shell estimates, from the satellite's own coast arcs,
or from its physical class — the posterior is κ = 1 - B_eff/B̂ with

    σ_κ² = (B_eff/B̂²)² σ_B² + σ_Beff² / B̂².

B_eff is fitted signed: κ > 1 (net thrust, orbit raising or more than full makeup) is a negative B_eff. G1's ballistic
truth fitter puts 52 of 239 Starlinks at the B_eff = 0 bound for exactly this reason.

**2b.3 Why κ is carried at all.** The dynamics need only B_eff, but κ decides the covariance. If the operator closes
the loop on the actual drag (T = κ D_actual), a fractional density error δ enters the net force as (1 - κ) B ρ δ; if
the thrust is planned on a forecast density (T = κ D_forecast, open loop), it enters as B ρ δ. For κ = 0.9 the two
differ by a factor of 10 in the in-track sigma of (1) and (2f.4). Which one SpaceX flies is measurable (2b.6), and it
is the most likely single cause of the Starlink covariance's scale error.

**2b.4 Beyond the operator's span: the station-keeping prior.** Starlinks hold their shell. Beyond the forecast
span (or over long horizons) the mean semi-major axis is modeled as relaxing to the shell's target a*:

    ȧ = -(a - a*)/τ_c,   equivalently κ(t) = 1 + (a - a*) / (τ_c ȧ_D(t)),                           (6)

with a* from the satellite's own history (the median of its fitted mean a over the last weeks) and τ_c fitted on the
population. The along-track error then stays bounded by the operator's deadband instead of growing as t², which is
the right long-horizon prior for a controlled orbit and the wrong one for a decaying or lowering one (2c).

**2b.5 Expected gain.** On the FFM truth arm: none beyond a signed B_eff, because that truth is itself ballistic with
κ folded into B_eff. On the SpaceX-forecast arm (inside the span), whose day-1 error for best-case XP is 2.738 km
against 1.502 km on the FFM truth: 2b with 2c targets that 1.24 km difference, which is the thrust pattern the operator
plans that a ballistic B cannot carry. On the covariance: 2b.3 selects the process-noise scale (2f).

**2b.6 Cost, parameters, fitting.** Rates: none beyond 2a (B_eff replaces B). Parameters: κ and the prior source
(+4 bytes); a* and τ_c are population values. Fitting: B_eff free, κ from the prior after the fit. Measurement:
newer-file truth (the first hours of SpaceX files issued after the fit) during density excursions (storm days in the
`$SPW` rows): regress the in-track error on (1 - κ) B ∫∫ δρ and on B ∫∫ δρ; the better predictor names the loop.

### 2c. Empirical along-track terms (constant and once per revolution)

**2c.1 Model.** In-track carries 99.4 to 99.9 % of the day-3 squared error in LEO (G1), so the empirical terms are
transverse:

    T_emp(u, t) = [τ_0 + τ_c cos u + τ_s sin u] g(t),   g = 1 on the fit arc, g = exp(-(t - t_e)/τ_e) after it,

with t_e the end of the arc and τ_e the persistence time (a first-order Gauss–Markov prior on the empirical force,
fitted on the population; default 1 day). The averaged rates (near-circular, from the Gauss equations of 2.0):

    ȧ = 2 τ_0 g / n,      ṅ = -3 τ_0 g / a,      d(a_f + i a_g)/dt = e^{iΩ} (τ_c + i τ_s) g / (n a),       (7)

so τ_0 produces the along-track quadratic s(t) = -(3/2) τ_0 t² (on the arc) and the 1/rev pair rotates the
eccentricity vector at a fixed orbit-frame direction atan2(τ_s, τ_c), the classical once-per-revolution empirical
acceleration of precise orbit determination (Colombo 1989; reduced-dynamic orbits, Wu, Yunck & Thornton 1991).

**2c.2 Identifiability.** τ_0 and B_eff produce the same t² signature except through the density's variation over the
arc: their correlation is ⟨ρ⟩/√⟨ρ²⟩, above 0.99 for a 10 % density variation. So exactly one of the two is free per
object: B_eff for objects in drag makeup or ballistic flight, τ_0 (with B at its prior) for objects whose fitted B_eff
is outside the physical range — G1's 19 Starlinks with B_eff above 0.5 m²/kg, ten times a physical value, which are
lowering or decaying under thrust, and whose day-3 XP error is 25.4 km. τ_c and τ_s are separable (a linear drift of
the 1/rev radial and in-track amplitude) and absorb once-per-revolution forces no term models (shadow asymmetries,
thermal re-radiation).

**2c.3 Expected gain.** On the 19 lowering or decaying Starlinks, a constant tangential thrust is the right model and a
density-proportional one is not: expected from 25.4 km at day 3 to the level of the drag-acts subset (9.8 km for XP)
or below. On the rest: small once 2a and 2d are in (it is the safety valve for force mismatches, and the carrier of the
SpaceX-forecast thrust pattern with 2b).

**2c.4 Cost, parameters, fitting.** Rates: three closed-form terms, < 0.05 µs per rate evaluation. Parameters: τ_0,
τ_c, τ_s (+12 bytes); τ_e is a population value. Fitting: linear in the parameters, added to the Levenberg–Marquardt
vector; τ_0 only when the B_eff test of 2c.2 selects it (the selection rule is fixed before the test windows are read).
