// The sources of the pass, by group. A source says where a group's operator files are, which
// reader turns them into an $OEM, and the window CelesTrak fits to them.
import * as starlink from './starlink.mjs';
import * as iss from './iss.mjs';
import * as planet from './planet.mjs';
import * as css from './css.mjs';
import * as glonass from './glonass.mjs';
import * as intelsat from './intelsat.mjs';
import * as ses from './ses.mjs';

export const sources = {
  css: { ...css, readers: ['orbit-products'] },
  glonass: { ...glonass, readers: ['sp3'] },
  intelsat: { ...intelsat, readers: ['orbit-products', 'ecef'] },
  iss: { ...iss, readers: ['orbit-products'] },
  planet: { ...planet, readers: ['orbit-products'] },
  ses: { ...ses, readers: ['orbit-products', 'ecef'] },
  starlink: { ...starlink, readers: ['meme'] },
};
