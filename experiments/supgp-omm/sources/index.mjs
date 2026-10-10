// The sources of the pass, by group. A source says where a group's operator files are, which
// reader turns them into an $OEM, and the window CelesTrak fits to them.
import * as starlink from './starlink.mjs';
import * as iss from './iss.mjs';
import * as planet from './planet.mjs';
import * as css from './css.mjs';

export const sources = {
  css: { ...css, readers: ['orbit-products'] },
  iss: { ...iss, readers: ['orbit-products'] },
  planet: { ...planet, readers: ['orbit-products'] },
  starlink: { ...starlink, readers: ['meme'] },
};
