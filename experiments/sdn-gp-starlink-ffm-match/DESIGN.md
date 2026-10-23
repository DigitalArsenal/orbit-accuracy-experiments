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
