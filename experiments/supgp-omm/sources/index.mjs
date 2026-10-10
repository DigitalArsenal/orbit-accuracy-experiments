// The sources of the pass, by group. A source says where a group's operator files are, which
// reader turns them into an $OEM, and the window CelesTrak fits to them.
import * as starlink from './starlink.mjs';
import * as iss from './iss.mjs';
import * as planet from './planet.mjs';
import * as cpf from './cpf.mjs';
import * as css from './css.mjs';
import * as glonass from './glonass.mjs';
import * as intelsat from './intelsat.mjs';
import * as ses from './ses.mjs';
import { eumetsat, gps, oneweb, spaceTrackOnly, telesat } from './unavailable.mjs';

export const sources = {
  // groups whose operator ephemeris cannot be had here: recorded with their reason, nothing fitted
  ast: spaceTrackOnly('ast', 'AST'), eumetsat, gps, iridium: spaceTrackOnly('iridium', 'Iridium'), kuiper: spaceTrackOnly('kuiper', 'Kuiper'),
  oneweb, orbcomm: spaceTrackOnly('orbcomm', 'Orbcomm'), telesat,
  cpf: { ...cpf, readers: ['cpf', 'ecef'] },
  css: { ...css, readers: ['orbit-products'] },
  glonass: { ...glonass, readers: ['sp3'] },
  intelsat: { ...intelsat, readers: ['orbit-products', 'ecef'] },
  iss: { ...iss, readers: ['orbit-products'] },
  planet: { ...planet, readers: ['orbit-products'] },
  ses: { ...ses, readers: ['orbit-products', 'ecef'] },
  starlink: { ...starlink, readers: ['meme'] },
};
