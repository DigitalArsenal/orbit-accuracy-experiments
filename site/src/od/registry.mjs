// The "03 // Orbit Determination" pages. Each runs site/src/od/<model>.js on
// the scenario site/build-od.mjs writes (GPS on 2026-08-02, IGS final orbits).
// `section_id` is the id the paper apps map; `modules`: what the page runs.
export const OD_SECTION = {
  paper: 'evidence-supported-aso-catalog',
  heading: '03 // Orbit Determination',
  subtitle: 'Batch fits and EKF and UKF filters with covariance, association and conjunction.',
};

const SIMULATION = ['analysis/observation-simulator', 'foundation/frames', 'propagator/hpop'];

export const OD_MODELS = [
  { sectionId: 'od-batch-fit', model: 'batch-fit', title: 'A batch least-squares fit with its covariance',
    claim: 'Radar, optical and RF observations of a GPS satellite fitted by weighted least squares; the fit and its covariance against the IGS orbit.',
    modules: [...SIMULATION, 'analysis/estimation'] },
  { sectionId: 'od-ekf-ukf', model: 'ekf-ukf', title: 'EKF and UKF: covariance through the pass',
    claim: 'The same observations through an extended and an unscented Kalman filter: how each covariance shrinks, and where they differ.',
    modules: [...SIMULATION, 'analysis/estimation'] },
  { sectionId: 'od-association', model: 'association', title: 'Associating observations with the catalog',
    claim: 'Each observation gated against every catalog prediction by its Mahalanobis distance, assigned scan by scan; what fits nothing is an uncorrelated track.',
    modules: ['analysis/observation-simulator', 'analysis/association'] },
  { sectionId: 'od-conjunction', model: 'conjunction', title: 'A conjunction from fitted covariances',
    claim: 'The fitted orbit and its covariance carried to a close approach; the combined covariance gives the probability of collision.',
    modules: [...SIMULATION, 'analysis/estimation', 'analysis/conjunction-assessment'] },
];
