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

    ȧ = 2⟨T⟩/n,    ṅ = -3⟨T⟩/a,    d(a_f + i a_g)/dt = (1/(na)) ⟨e^{iL} (2T - iR)⟩.

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
is used. Co-rotation enters exactly through v_r: for a circular orbit
|v_r|² = v² [1 - 2 (ω_E r/v) cos i + (ω_E r/v)² cos² φ] (φ the latitude), so the transverse drag carries
King-Hele's factor F ≈ (1 - (r ω_E/v) cos i)² (0.92 for the 53° shell, an 8 % effect on ȧ) and the cross-track
component of v_r drives di/dt (King-Hele 1987); winds, when on, add the HWM14 zonal mean as King-Hele's atmospheric
rotation factor Λ in place of 1.

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

### 2d. Tesseral m-daily short-periodics and shallow resonances (the LEO floor)

**2d.1 The terms.** With Kaula's (1966) disturbing function

    R = (μ/a) Σ_l Σ_m (R_E/a)^l Σ_p F_lmp(i) Σ_q G_lpq(e) S_lmpq,
    S_lmpq = [C_lm cos ψ + S_lm sin ψ] (l - m even),  [-S_lm cos ψ + C_lm sin ψ] (l - m odd),
    ψ_lmpq = (l - 2p) ω + (l - 2p + q) M + m (Ω - θ_G),

the terms split by j = l - 2p + q, the multiple of the mean anomaly:

- **m-daily** (j = 0, l even, p = l/2, q = 0): ψ = m(Ω - θ_G), period 2π / (m |θ̇_G - Ω̇|), about one m-th of a
  day, amplitude O(e⁰). (Odd l reach j = 0 only with q = ±1, so those are O(e).)
- **short-periodic** (j ≥ 1, far from commensurability): periods below one revolution, tens of meters in LEO.
- **resonant** (j ≥ 1 with |ψ̇| ≪ n): integrated in the averaged rates, as XP does for its four classes.

**2d.2 First-order m-daily solution.** The slow elements are frozen over the term's period and ψ̇_m = m(Ω̇ - θ̇_G).
Because ∂R/∂M = 0 the semi-major axis does not oscillate (Δa = 0). In the along-track angle u + Ω cos i, the
∂R/∂e parts cancel between ω and M at e → 0, and the ∂R/∂i parts cancel between ω and Ω cos i, leaving the ∂R/∂a
part of Lagrange's equations:

    Δs_T = 2(l + 1) a (n/ψ̇_m) (R_E/a)^l F_{l,m,l/2}(i) J_lm sin(ψ - ψ_lm),     J_lm = √(C_lm² + S_lm²)        (8)
    Δi   = -m (n/ψ̇_m) (R_E/a)^l F_{l,m,l/2}(i) J_lm cos(ψ - ψ_lm) / sin i
    ΔΩ   =    (n/ψ̇_m) (R_E/a)^l F′_{l,m,l/2}(i) J_lm sin(ψ - ψ_lm) / sin i,      Δe = O(e)

added at output time to λ, χ and ψ (equinoctial form as in Danielson et al. 1995, which also gives the O(e) and
j ≠ 0 terms when they are wanted). Coefficients: EGM2008 (Pavlis et al. 2012), the FFM truth's field. The inclination
functions come from Gooding's recurrence and are cached per object at each node.

**2d.3 Size: the m-daily terms are the measured floor.** With l = m = 2, F_221 = (3/2) sin² i and G_210 = 1, the
along-track amplitude of (8) is A_22 = 6 a (n/ψ̇_2) (R_E/a)² (3/2) sin² i J22 (J22 = 1.815e-6). The full set (even
l ≤ 8, all m) was evaluated from the EGM2008 coefficients of the FFM module (`propagator/ffm/lib/egm2008_data.h`)
with Kaula's inclination functions in exact arithmetic (a design estimate, not module code):

| Orbit | a (km) | i (°) | A_22 (m) | next largest (l, m): A (m) | RMS of the set (m) | G1 in-track fit RMS, best-case XP (m) |
| --- | --: | --: | --: | --- | --: | --: |
| Starlink 550 km | 6928 | 53.05 | 454 | (4,3) 180, (4,2) 170, (4,1) 106 | 384 | 441 (all Starlinks) |
| Starlink 530 km | 6908 | 43.0 | 332 | (4,2) 224, (4,1) 176 | 332 | |
| Starlink 570 km | 6948 | 70.0 | 627 | (4,1) 327 | 519 | |
| Starlink 560 km | 6938 | 97.6 | 707 | (4,1) 179 | 535 | |
| ISS | 6795 | 51.64 | 459 | (4,2) 198, (4,3) 191 | 394 | 402 |
| Stella (laser-ranged LEO) | 7180 | 98.6 | 646 | (4,1) 171 | 487 | 388 (median of seven targets) |
| LAGEOS-1 | 12270 | 109.84 | 153 | (4,1) 26 | 110 | 118 (laser-ranged high) |

The m-daily set is the size of the measured fit floor in every LEO and laser-ranged regime, and its sin² i law shows
in G1 section 6: Starlink strata at 85° and above fit at 0.63 to 0.69 km (3D), those below 48° at 0.46 to 0.51 km.

**2d.4 Why a 0.4 km floor becomes a 10 km day-3 error: aliasing into the drag.** An unmodeled along-track term
A cos(ω_m t + φ) on a fit arc of length T (C = ω_m T / 2π cycles), with the arc mapped to x ∈ [-1, 1], projects on
the drag's quadratic signature with the Legendre coefficient

    c_2 = -5 A j_2(πC) cos φ′                                                                     (9)

(from e^{ikx} = Σ_l (2l + 1) i^l j_l(k) P_l(x), j_l the spherical Bessel functions), and the fitted drag carries it
forward as c_2 P_2(1 + 2L/T) at a lead L past the arc. For the J22 term of the 53° shell (period 11.82 h) and G1's
24 h fit, C = 2.03 and |5 j_2(πC)| = 0.436; for the m = 1 terms (period about 24 h) |5 j_2(π · 1.02)| = 1.53, so even
small m = 1 amplitudes alias hard. Where drag has no lever (above about 1,500 km the density cannot produce a
quadratic of this size) the quadratic path is closed and the term aliases only into the mean motion, through
3 j_1(πC) (0.46 at 24 h), growing linearly.

Predicted errors: least squares of {1, t, t²} (drag lever) or {1, t} (no drag lever) over the arc against the sum of
the 2d.3 terms (and the 15:1 term of 2d.5 for Starlink), phases uniform, 4,000 draws, median of each held-out day's
RMS (a design estimate):

| Regime (fit 24 h) | Model of the omitted gravity | Fit | Day 1 | Day 2 | Day 3 |
| --- | --- | --: | --: | --: | --: |
| Starlink 550 km, drag lever | m-daily l ≤ 6 and 15:1 | 0.35 | 1.08 | 3.59 | 7.88 |
| measured, best-case XP, FFM-propagated Starlink | | 0.483 | 1.502 | 4.733 | 9.867 |
| Stella, drag lever | m-daily l ≤ 6 | 0.45 | 1.36 | 4.56 | 10.03 |
| measured, best-case XP, laser-ranged LEO | | 0.409 | 0.970 | 3.174 | 9.399 |
| LAGEOS-1, no drag lever | m-daily | 0.11 | 0.14 | 0.22 | 0.31 |
| measured, best-case XP, laser-ranged high | | 0.125 | 0.146 | 0.190 | 0.271 |

The omitted tesseral gravity alone accounts for about 80 % of best-case XP's error on every held-out day of the FFM
truth, for all of it on laser-ranged LEO, and for all of it on laser-ranged high orbits. The fitted parameters
corroborate it: XP's BTERM on the laser-ranged LEO spheres is 0.14 m²/kg (median) and its AGOM 0.126 m²/kg, about
50 to 100 times the physical C_D A/m and C_R A/m of LARES, Starlette and Ajisai (spheres of known mass and diameter):
the fitted drag is carrying gravity. This is the central finding of this design: in LEO the binding term is not the
atmosphere but the tesseral field that SGP4 and XP both omit, and its damage is done through the drag fit.

**2d.5 Shallow resonance: the main Starlink shells sit near 15:1.** The 530 to 570 km shells (mean motions about 15.0
to 15.1 rev/day) are within about 0.2 rev/day of fifteen revolutions per nodal day, ψ̇ = (Ṁ + ω̇) - 15(θ̇_G - Ω̇) ≈ -0.17
rev/day for the 53° shell (period about 6 days), a band XP does not cover (its classes stop at 3.6 rev/day). The j = 1,
m = 15 terms (odd l from 15) give

    Δa = 2 j a (n/ψ̇) Σ_l (R_E/a)^l F̄ Ḡ J̄_l,15 sin ψ,      Δλ = 3 j (n/ψ̇)² Σ_l (R_E/a)^l F̄ Ḡ J̄_l,15 cos ψ       (10)

(normalized F̄, Ḡ, J̄; Kaula 1966; Allan 1967); every odd l from 15 to 69 has the same angle ψ, so the terms add as
one lumped complex coefficient Σ. From the EGM2008 coefficients (design estimate, J2 secular rates in ψ̇):

| Shell | ψ̇ (rev/day) | Period (d) | |Σ| | Δa (m) | Along-track amplitude (km) |
| --- | --: | --: | --: | --: | --: |
| 550 km, 53.05° | -0.164 | 6.1 | 4.5e-9 | 5.7 | 0.79 |
| 540 km, 53.2° | -0.132 | 7.6 | 4.6e-9 | 7.3 | 1.26 |
| 530 km, 43° | -0.127 | 7.9 | 1.5e-9 | 2.5 | 0.44 |
| 570 km, 70° | -0.167 | 6.0 | 8.7e-10 | 1.1 | 0.15 |
| 560 km, 97.6° | +0.003 | 330 | 3.2e-9 | | exact resonance (below) |
| ISS, 417 km, 51.6° | +0.264 | 3.8 | 6.3e-9 | 5.0 | 0.44 |

For the 53° shells the period is longer than the G1 window: the 24 h fit absorbs the term completely (2 m of fit
residual) and the prediction then drifts away from it, 2.4 km at day 3 for the 550 km shell (the 2d.4 model). The
97.6° shell sits on the resonance, where (10) becomes a constant transverse force τ = j n² a |Σ| sin ψ₀ ≤ 2.7e-8
m/s², about 10 % of the drag at moderate solar activity, which the fitted B_eff absorbs for days and which biases κ
and any B prior over months. The periods are sensitive to the mean motion (ψ̇ changes by about 0.003 rev/day per km of
altitude), so each object's term is evaluated from its own elements. SDN-GP generalizes XP's four classes to every (j, m) with |ψ̇| < ε n (ε = 0.02, l ≤ 40
for LEO, l ≤ 8 above 2 rev/day), integrated in the averaged rates.

**2d.6 Expected gain, cost, parameters.**

- Gain: the LEO in-track fit floor from 0.44 km to the remainder of the 2d.4 table (about 0.25 km), and the aliasing
  path closed. Predicted day 3 on the FFM-propagated Starlink: from 9.87 km to the drag-model part that remains
  (about 2 to 4 km before 2a, section 3); laser-ranged LEO from 9.40 km to about 1 to 2 km; laser-ranged high from
  0.271 km to well below 0.1 km (the m-daily set is all of its predicted error).
- Cost: m-daily set (l even ≤ 6, all m: 12 terms) at output time: one cos/sin of (Ω - θ_G), multiples by
  recurrence, 12 cached coefficients: about 0.1 µs per state (+9 % of 1.12 µs). Shallow resonance in the rates:
  8 to 16 terms with cached F̄: about 0.3 µs per rate evaluation (+3 %). Memory: about 240 bytes per object of cached
  coefficients (within the 4 KiB budget).
- Parameters per object: none (field constants). Bytes: 0.
- Fitting: nothing new; the terms change the residual floor that every other parameter is fitted against.

### 2e. Fit span, priors and multi-arc fitting

**2e.1 Leverage.** Over an arc of length T the drag's quadratic signature (1) has the Legendre coefficient

    c_2,D = n |ȧ_D| T² / 8                                                                       (11)

(627 m at 24 h, 2,507 m at 48 h and 5,641 m at 72 h for a Starlink at 53 m/day), and any residual with projection
c_2,res on P_2 biases the drag by δB/B = c_2,res / c_2,D. For the J22 term of (9): 23 % at 24 h, 2.1 % at 48 h,
0.65 % at 72 h. A white floor σ_f with N_eff independent samples adds σ(c_2) = √(5/N_eff) σ_f; for the correlated
floor of 2d, N_eff is the arc length over the residual's correlation time, not the sample count.

**2e.2 The G1 fit-length study read through (9) and (11).** The omitted gravity of 2d.4 (m-daily l ≤ 6 and 15:1,
drag lever) predicts, for the common interval 72 to 96 h, 7.88 / 1.26 / 0.66 km for 24 / 48 / 72 h fits (measured:
8.83 / 1.58 / 0.77 km), and for the first day after each fit 1.08 / 0.50 / 0.66 km (measured: 1.33 / 0.82 / 0.77 km).
Long fits suppress the m-daily aliasing as predicted; at 72 h what is left is mostly the 15:1 drift, which a longer
arc resolves no better. The part no gravity term explains, √(measured² - predicted²), is 0.40 to 0.65 km on the
first day after a 48 to 72 h fit: the drag-model mismatch, the target of 2a.

**2e.3 Rules.**

- **Longest clean arc.** Fit 48 h where the truth allows it; never fit across the 48 h join of a SpaceX file.
- **Stitched fresh-OD arcs (Starlink).** SpaceX reissues each file about every 8 h, and the first hours of each file
  are its freshest orbit determination (G1's truth rule). The first 8 h of each of the last six files form a 48 h arc
  of near-OD states with none of the forecast tail; fit one epoch state and B_eff (and τ_0 if selected) to it. A
  detected maneuver cuts the arc into segments.
- **Priors on B.** Minimize Σ ‖r_k‖²_W + (B - B̂)²/σ_B². Sources of B̂, in order: the physical value for passive
  spheres (laser-ranged targets: known mass and diameter; C_D from gas–surface interaction models, Moe & Moe 2005);
  the object's own previous fits, smoothed as a random walk with variance q Δt between fits (a scalar Kalman smoother
  over the B history, robust to the attitude-mode jumps of a Starlink by a Student-t innovation); the shell value of
  E13b. The posterior closes the aliasing path: with σ_B/B = 5 % on a sphere, the 23 % aliasing bias cannot enter.
- **Colored-noise weights.** W is the inverse of the floor's covariance (the residual autocorrelation of the theory
  on the population), not the identity, which down-weights the periodic floor and is the same matrix that scales the
  fit covariance in 2f.5.

**2e.4 Alias-free spans (a diagnostic with no new code).** j_2(πC) vanishes at C = 1.835, 2.895, 3.923, 4.939, which
for the 53° shell's J22 period are T = 21.7, 34.2, 46.4 and 58.4 h. If 2d.4 is right, XP fitted over 21.7 h loses
most of the J22 contribution that it carries at 24 h (|5 j_2| = 0.436 at 24 h, 0 at 21.7 h), while the m = 1 terms
stay (|5 j_2| = 1.46 at 21.7 h): the cleanest test of the aliasing account, runnable on the existing harness today.

**2e.5 Expected gain, cost, parameters.**

- Laser-ranged LEO spheres: with B fixed near its physical value the quadratic path is closed and the m-daily set
  enters only through the mean motion (linear growth): predicted for Stella, days 1 / 2 / 3, from 1.36 / 4.56 / 10.03
  km (drag lever) to 0.62 / 0.92 / 1.27 km with the prior alone, and to the residual floor with 2d. The largest
  relative gain in any regime, at no cost.
- Starlink: 48 h stitched arcs give the measured 24 → 48 h improvement (next-day 1.33 → 0.82 km; 72–96 h interval
  8.83 → 1.58 km) without fitting the forecast tail; the B history prior adds to it on short arcs.
- Cost: fit time only (the fit's Jacobian gains one prior row); 0 µs at propagation. Parameters: a 1-byte prior
  source code. Fitting: as above.

### 2f. Analytic STM and covariance realism

**2f.1 Variational equations of the averaged system.** With y the mean elements and p the fitted parameters
(B_eff, AGOM, τ_0, τ_c, τ_s as selected), the mean-element state transition and sensitivity matrices

    Φ(t, t₀) = ∂y(t)/∂y(t₀),   Ψ(t, t₀) = ∂y(t)/∂p:     Φ̇ = A Φ,   Ψ̇ = A Ψ + ∂f/∂p,   A = ∂f/∂y

are integrated with the same Runge–Kutta step on the same grid as the state (the discrete variational equations of
the step), so the STM is consistent with the propagated state, checkpointed with it, and independent of request
order. A has closed form for the zonal and third-body rates (polynomials in the elements, `SPEC.md` 2 and 5); for drag
it is differentiated under the quadrature or the kernel sums of (3). This is the DSST approach to partials (Danielson
et al. 1995; Setty et al. 2016) carried to the new terms.

**2f.2 The secular closed form (console path).** For output at frame rate the dominant block has a closed form. With
δn, δa related by δn = -(3/2)(n/a) δa, J2 secular rates Ω̇, ω̇, Ṁ of `SPEC.md` 2, and the drag decay ṅ_D:

    δλ(t) = δλ₀ + (1 + ∂Ṁ/∂n + …) δn₀ t + (1/2) (∂ṅ_D/∂B_eff) δB_eff t² + (∂(Ṁ+ω̇+Ω̇)/∂(e, i)) (δe₀, δi₀) t
    δΩ(t) = δΩ₀ + (∂Ω̇/∂a δa₀ + ∂Ω̇/∂i δi₀ + ∂Ω̇/∂e δe₀) t,    ∂Ω̇/∂a = -(7/2) Ω̇/a,   ∂Ω̇/∂i = -Ω̇ tan i

and similarly for ω and the eccentricity vector (a J2 rotation of the e-vector at rate ω̇): a 7 × 7 (6 + B_eff) STM
with about 15 non-zero entries, the structure used in J2 and drag relative-motion STMs (Gim & Alfriend 2003; Koenig,
Guffanti & D'Amico 2017). The full variational path of 2f.1 is used for fitting and for long horizons.

**2f.3 Output map.** The osculating Cartesian state is x = h(y, t): the short-periodic map of `SPEC.md` 8 (J2,
Sun/Moon, m-daily of 2d) then Kepler. H = ∂x/∂y = (∂x/∂y_osc)(I + ∂η/∂y), η the short-periodic corrections, with
∂η/∂y to first order in J2 (Gim & Alfriend 2003). The Cartesian STM is Φ_x(t, t₀) = H(t) Φ(t, t₀) H(t₀)⁻¹.

**2f.4 Covariance with physical process noise.** The covariance is carried in mean equinoctial elements, where it
stays Gaussian far longer than in Cartesian coordinates (Junkins, Akella & Alfriend 1996; Horwood & Poore 2014):

    P_y(t) = Φ P_y₀ Φᵀ + Ψ P_p Ψᵀ + Φ P_yp Ψᵀ + Ψ P_py Φᵀ + Q(t),     P_x(t) = H P_y Hᵀ

Q's dominant entry is the along-track variance from density errors. A fractional density error δ(t) modeled as a
first-order Gauss–Markov process with variance σ_δ² and time constant τ, entering the decay through ȧ_D, gives
s(t) = -(3/2) n ȧ_D ∫₀ᵗ (t - t′) δ(t′) dt′ and in closed form

    σ_s²(t) = (9/4) n² ȧ_D² σ_δ² [ (2/3) τ t³ - τ² t² + 2 τ⁴ (1 - e^{-t/τ} (1 + t/τ)) ]                      (12)

which is (3/4) n |ȧ_D| σ_δ t² for t ≪ τ (a persistent bias, as in (1)) and (3/2) n |ȧ_D| σ_δ √(2τt³/3) for t ≫ τ: the
t² to t^(3/2) transition of Emmert et al. (2017). For closed-loop drag makeup ȧ_D carries the factor (1 - κ) of 2b.3,
for open-loop thrust it does not. (σ_δ, τ) are set per weather tier of 2a.3 (observed with DCA: E13's residual scatter
0.0916 in ln ρ; 3-day forecast; 45-day forecast; climatology). The column ∂x/∂s of the sensitivity matrix is exported
with each state, so a consumer can apply a revised s(t) or a storm scenario to a screening without re-propagating:
δx(t) = (∂x/∂s) δs, the linear form of the late binding of 2a.5.

**2f.5 Calibration (covariance realism).** Three scale terms, fitted in two stages on held-out windows only:

1. On the FFM truth (density error zero by construction, same environment): the fit covariance P_y₀ = σ̂² (JᵀWJ)⁻¹
   with W the colored-noise weight of 2e.3 (the white-noise assumption is what makes formal covariances
   overconfident: it counts N correlated residuals as N independent ones), plus a constant theory-floor term Q_f
   (radial, in-track, cross-track variances of the theory's own residual).
2. On independent truth (newer-file SpaceX states, laser ranging, the ISS OEM, GNSS): (σ_δ, τ) per weather tier and
   the closed-loop or open-loop choice of 2b.3.

Target: mean d²/3 in [0.8, 1.25] and 95 % coverage in [0.93, 0.97] (the V1c2 rule), from 3.40 (our E14 S3-KC on SGP4)
and 24.9 (SynCoPate) today. Consider-parameter theory for unestimated biases follows Tapley, Schutz & Born (2004).

**2f.6 Cost, parameters.** Secular closed form: about 0.3 µs per output state for P_x (a 7 × 7 congruence and the H
product). Full variational: 7 to 8 times a rate evaluation per node, at fit time and for long horizons only.
Parameters: the mean-element covariance of (y, B_eff) as 28 float32 (112 bytes), 144 bytes with two more parameters;
(σ_δ, τ) and Q_f are population values per weather tier and regime, published once, not per object.

### 2g. Theory plus a per-object residual series: bytes against meters

**2g.1 Model.** After the theory fit, the residual ε(t) = x_truth(t) - x_SDN-GP(t) in radial, in-track and
cross-track axes is small and smooth: slow drag-model mismatch plus periodic remnants at 1/rev, 2/rev and the
m-daily frequencies. It is stored per segment [t_a, t_b] in a product basis, Chebyshev in time and Fourier in the
theory's own mean argument of latitude u(t):

    ε_c(t) = Σ_{j=0..J} Σ_{k=0..K} T_j(τ) [α_cjk cos k u(t) + β_cjk sin k u(t)],   τ = (2t - t_a - t_b)/(t_b - t_a)    (13)

for c ∈ {R, I, C}, with K = 2 in-track and K = 1 radial and cross-track, evaluated by Clenshaw's recurrence
(Clenshaw 1955). A plain time Chebyshev must resolve the orbital frequency itself (a LEO SPK record spans a fraction
of a revolution); the Fourier factor moves the orbital frequency into the basis, so the Chebyshev degree only has to
follow the slow envelope (Boyd 2001 for the convergence of both factors).

**2g.2 Bytes.** One LEO object-day with J = 6: (5 + 3 + 3) × 7 = 77 coefficients; quantized to int16 against a
per-segment, per-component scale (the scale set by the target accuracy), 154 bytes plus 12 bytes of scales. A time
Chebyshev of the full position at the same tolerance (SPK type 2: about 60 records of degree 10 to 12 per LEO day,
three components, 8-byte coefficients) is 15 to 19 KB per object-day, so the expected ratio is about 100. The bytes
against meters curve (1, 10 and 100 m; G1 task arm 4) is the measurement; J and K are chosen per target by the
coefficient-decay rule (stop when the next degree's coefficients fall below the quantization step).

**2g.3 Beyond the segment.** The residual is not extrapolated except for its k = 0, j ≤ 2 part, faded out with the
persistence time τ_e of 2c; past that the element set is the theory alone, so a stale set degrades instead of ending.

**2g.4 Use.** Inside an operator's forecast span (SpaceX files) theory plus residual reproduces the forecast,
planned thrust included, at the target tolerance: the compact form to measure against the SDS `$PPE` compact copies
of the forecasts. For precise-orbit objects (GNSS, laser-ranged) it gives sub-meter replay at a few hundred bytes per
day.

**2g.5 Cost, parameters, fitting.** Evaluation: three Clenshaw sums of degree J with cos/sin of k u from one sincos
and the double-angle relation: about 0.1 µs per state. Fitting: linear least squares on the residual (the basis is
linear), no iteration. Parameters: 77 per object-day (154 to 166 bytes per object-day at the 10 m target, fewer at
100 m).

### 2h. Regime extensions

All regimes use the same integrator, grid, checkpoint and output chain; a regime changes the central body's
constants, the rate terms and the frame. Small bodies (asteroids, comets) keep their own SDS small-body schema with
osculating heliocentric elements (owner ruling 2026-10-13); SDN-GP can propagate them, but they are not `$OMM`
records.

**2h.1 Moon-centered orbits (low, frozen, elliptical).**

- Central body: μ_M = 4,902.80 km³/s² (DE440, Park et al. 2021), reference radius 1,738.0 km, lunar gravity from
  GRAIL (GL0660B, Konopliv et al. 2013; GRGM660PRIM, Lemoine et al. 2013), J2 ≈ 2.03e-4, C22 ≈ 2.24e-5, J3 ≈ 8.5e-6.
- Because the Moon rotates once per 27.32 days, the tesseral angles m(Ω - θ_M) are long-period for every lunar
  orbit, so the degree 2 to 8 zonals and tesserals all enter the averaged rates (single averaging over the mean
  anomaly only, with the Moon-fixed node angle kept as a slow variable), not the short-periodic output. Orbits below
  about 100 km altitude are dominated by mascons and need degree 50 and more; they are out of SDN-GP's scope and are
  labeled so (FFM handles them).
- Third bodies: Earth (μ_E/μ_M = 81.30) and Sun, with XP's averaged quadrupole and octupole formulas (`SPEC.md` 5)
  and the Earth as the body. Above about 3,000 km altitude Earth's quadrupole drives the Kozai–Lidov exchange of
  eccentricity and inclination (Kozai 1962; Lidov 1962) that sets lunar frozen orbits (Elipe & Lara 2003; Ely 2005);
  the averaged rates carry it directly. Orbits with periods above about 1.5 days use XP's long-period mode
  (instantaneous geometry, 95-minute class, `SPEC.md` 5 and 9) with the Moon as center.
- Frame: the lunar principal-axis frame for the gravity field, the IAU mean-Earth orientation for output (Archinal
  et al. 2018), the pole precessing by Cassini's laws (Peale 1969); SRP with Earth and Moon shadows.
- Truth: NAIF SPKs of LRO, Danuri and KPLO (inventory: to fetch). Parameters: XP's 8. Cost: the tesseral rates add
  about 30 % to a rate evaluation.

**2h.2 Earth–Moon libration-point orbits (halo, NRHO, Lyapunov, DRO).**

- Frame: the synodic frame of the Earth–Moon system, pulsating with the instantaneous Earth–Moon distance so that
  the Moon's eccentricity is a small periodic forcing (Szebehely 1967), origin at the libration point.
- Base: Richardson's (1980) third-order halo solution about L1 or L2 (γ the distance of the point from the Moon):

      x = a21 A_x² + a22 A_z² - A_x cos τ₁ + (a23 A_x² - a24 A_z²) cos 2τ₁ + (a31 A_x³ - a32 A_x A_z²) cos 3τ₁
      y = k A_x sin τ₁ + (b21 A_x² - b22 A_z²) sin 2τ₁ + (b31 A_x³ - b32 A_x A_z²) sin 3τ₁
      z = δ_m A_z cos τ₁ + δ_m d21 A_x A_z (cos 2τ₁ - 3) + δ_m (d32 A_z A_x² - d31 A_z³) cos 3τ₁
      τ₁ = λ ω t + φ,   ω = 1 + s1 A_x² + s2 A_z²,   l1 A_x² + l2 A_z² + Δ = 0

  with Richardson's coefficients (functions of the mass ratio and γ) and δ_m = ±1 for northern and southern families.
- Fitted quasi-periodic form: for the real ephemeris, X(t) = Σ_{|k|≤K} Σ_{|l|≤L} c_kl exp(i(k θ₁ + l θ₂)) per
  synodic coordinate, θ₁ the orbit's phase and θ₂ the forcing phases (the Moon's mean anomaly ℓ and the solar argument
  2D), with frequencies refined by Laskar's frequency analysis (Laskar 1990) and amplitudes by linear least squares.
  For the 9:2 NRHO (the Gateway orbit, Lee 2019; Zimovan, Howell & Davis 2017) θ₁ locks to 2/9 of the synodic month.
- Regularized phase: the perilune passage of an NRHO (about 3,000 km from the Moon) is sharp, so the series is
  written in a Sundman anomaly s with dt/ds = c r_M^α (r_M the distance to the Moon, α = 1 or 3/2; Sundman 1912;
  Stiefel & Scheifele 1971), and t(s) is itself a short Fourier series. The perilune passage spreads over many
  harmonics of t but few of s.
- Stability: L1 and L2 halos are unstable with e-folding times of days, NRHOs nearly stable; the element set is a
  segment between station-keeping epochs (2h.5), never an extrapolation across one.
- Parameters: 3 coordinates × (2K + 1)(2L + 1) coefficients, K ≈ 20 to 40 in s, L ≤ 2: about 0.5 to 2 KB per segment
  of weeks; the bytes against SPK at 1, 10 and 100 m are the measurement. Truth: CAPSTONE and Artemis I SPKs.

**2h.3 Heliocentric cruise.**

- Mean elements about the Sun (ICRF, TDB) with an SRP-reduced central parameter μ_eff = μ_☉ (1 - β),
  β = P₁AU (1 AU)² AGOM / μ_☉ = 7.69e-4 · AGOM (AGOM in m²/kg), the classical lightness number of radial SRP.
- Planetary perturbations far from the planets: linear element rates (the JPL approximate-element idea per craft,
  Standish & Williams in Urban & Seidelmann 2012) plus, for months-long segments, the Laplace–Lagrange secular
  terms of the (e, ϖ) and (i, Ω) vectors (Murray & Dermott 1999, chapter 7), then the residual series of 2g.
- Thrust arcs (electric propulsion) are segments with a constant RTN acceleration (2c's τ terms in three axes).
- Hand-off to a planet-centered segment inside the planet's Laplace sphere of influence r_SOI = a_p (m_p/M_☉)^(2/5).
- Truth: NAIF cruise SPKs (inventory: to fetch); planetary positions from DE440.

**2h.4 Planet-centered orbits.** XP's zonal machinery through J5 (`SPEC.md` 2) with the body's μ, R, J_n and IAU
pole (Archinal et al. 2018): Mars (MRO120D; Konopliv et al. 2016), Venus, Jupiter and Saturn (large J2 and J4, so the
J2² terms XP already carries matter more); the Sun as third body; for Mars, the areostationary resonance as XP's
1-day class with Mars's rotation angle, and an optional exponential atmosphere for low orbiters, labeled as such.

**2h.5 Segments and hand-offs in one element-set form.** An object's trajectory is a sequence of segments
S_k = (t_k, t_k+1, CENTER_NAME, REF_FRAME, MEAN_ELEMENT_THEORY, elements, covariance), each an SDS `$OMM` record
(CCSDS 502.0-B-3 keyword names). At a boundary the osculating states of S_k and S_k+1 agree by construction: the
fit carries the continuity constraint x_k(t_k+1) = x_k+1(t_k+1) in a common frame (center offsets from DE440), and
the covariance maps across as P_k+1 = J P_k Jᵀ, J = ∂y_k+1/∂y_k through Cartesian. Hand-off criteria: the sphere of
influence with a hysteresis band, or an operator maneuver epoch. MEAN_ELEMENT_THEORY names the theory and regime
(SDN-GP, never SGP4-XP); the synodic frame has no CCSDS name (open question 5).

### 2i. Further terms judged high value

**2i.1 ECOM-type SRP for GNSS, IGSO and GEO.** In MEO and above, SRP is the leading unmodeled force (in-track
share 87 to 90 % at day 3 in G1's GNSS, IGSO and GEO rows). The empirical CODE orbit model (ECOM) writes it in the
Sun-oriented D (to the Sun), Y (along the solar-panel axis), B (completing) frame as D₀, Y₀, B₀ plus once-per-
revolution B_c, B_s terms (Beutler et al. 1994; Springer, Beutler & Rothacher 1999; ECOM2, Arnold et al. 2015). Over
one orbit the D, Y, B directions are fixed in inertial space (the Sun moves 2° per GNSS revolution), so the
averaged rates are XP's closed-form sunlit-arc integrals (`SPEC.md` 4) with the constant D₀ replaced by the three
constant components, and the once-per-revolution terms by 2c's formulas in the B direction. The Y-bias Y₀ is the
classical cause of along-track drift in GPS predictions. Expected: the GNSS day 3 from 0.187 km and IGSO from 0.556
km by a factor of 2 to 3 (to measure). Parameters: 5 (+20 bytes; AGOM becomes D₀). Cost: about 0.5 µs per rate
evaluation.

**2i.2 Maneuver-aware segments in GEO and IGSO.** Station keeping (east–west every one to two weeks) inside a G1
window is a step in the in-track rate that no smooth theory represents. Detect it from the fit residual
(a change-point in the mean motion), cut the window into segments (2h.5), and score the segments separately.
Expected: the GEO day-3 tail (90th percentile 2.48 km against a 0.805 km median) shrinks. Parameters: none beyond a
segment boundary. This is fitting practice, not a rate term.

**2i.3 Space-weather scenario envelopes for conjunction screening.** Because density enters only through
B_eff exp(s(t)) and the STM carries ∂x/∂s (2f.4), a screening can evaluate a storm scenario (s raised by the
historical storm response for the forecast Ap) for every object at the cost of one sensitivity product, not a
re-propagation: a cheap upper envelope of the along-track uncertainty for the days when density forecasts fail.

**2i.4 Higher-order and secondary terms checked and set aside.** J2² short-periodics (about 10 m in LEO), Earth
radiation pressure (a constant radial force that only shifts the fitted mean motion, about 40 m over four days for an
AGOM of 0.19 m²/kg) and thermospheric winds (1 to 3 % of drag, absent from the FFM truth) are below the floors above.
They enter only if the measurements of section 4 leave a residual their size.
