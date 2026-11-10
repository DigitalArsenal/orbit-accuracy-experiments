# Module notes from the rounds (propagator/sdn-ap 0.6.5, unchanged): exploratory

No module was changed or built. What the development rounds ran into, for issues:

1. **The experiment's fit configuration, not the module: tesseral terms off above e 0.048.** `buildApFitPcfBytes`
   (`experiments/ap-five-day-accuracy/lib/external-and-optical-ap-engine.mjs`) sets MAXIMUM_TESSERAL_DEGREE 0 above e 0.048. Since 0.6.4
   the module carries tesseral terms by resonance class up to e 0.3 (README, "From 0.6.4 the tesseral switch is by resonance class").
   QZSS's quasi-zenith orbits (e about 0.075) and the two eccentric Galileo satellites (e about 0.16) therefore fly without their resonance terms in every arm
   of the registered construction. Measured (round 3): on public-set fits it changes nothing (D5 1.9007 against 1.9006 km, 107 GEO
   sets); on rapid-orbit fits GEO 0.054 -> 0.058 km, HEO 0.079 -> 0.067 km (4 sets). Not a defect; the threshold should be a
   per-class choice in the registration, and the module's own class rule is the obvious default.
2. **AGOM is not observable from SGP4 flights.** Fitted to public-set flights, AGOM sits at 0 (B3 median exactly 0) or wanders (D5
   p10 0, p90 0.04 m2/kg); fitted to precise orbits it is 0.023 +- 0.008 (MEO) and 0.021 (IGSO). A prior at the right value moves the
   trajectory by under 0.5 % (round 4). Not a defect: SGP4 has no radiation pressure. The AP record's covariance should say so (the
   AGOM it states from a public-set fit is not a measurement).
3. **The record's epoch placement changes nothing.** `sdnap_fit_epoch_diagnostic` 0, 1 or 2 gives the same 72 h error to 0.1 % on every
   class (round 13). The diagnostic can stay a diagnostic.
4. **Refusals on long arcs are rare and named.** Over every kept run, `fit-implausible` (RMS above 100 km) on 0.1 to 0.5 % of history
   fits and one `fit-failed` (no convergence, an 11-day HIGH_LEO arc); each is a history across a maneuver. The served chain falls back.
   No defect; the refusals worked as documented.
5. **Missing input port, not a missing term.** The biggest gains came from orbit-product inputs (CPF predictions, GNSS ultra-rapid and rapid orbits) (rounds 1 to 3); the fit takes any
   GCRF $OEM, so nothing is missing in the module for that. The weight of each state is fixed at the 1 km a priori sigma (SPEC: "unit
   weights"); the rounds reached per-segment weighting only by sampling density (history at 900 to 3,600 s, forecast at 300 s). A
   per-state or per-block sigma on the fit's input (for instance from an $OEM covariance or a block-level stated sigma) would let a
   construction weigh a precise arc against a public-set arc without thinning either. Worth an issue if the catalog mixes inputs.
