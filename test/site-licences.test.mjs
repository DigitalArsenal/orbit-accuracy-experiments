// The site publishes only what data/licenses.json lets us reproduce, labelled
// with each source's own licence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { labelFor, mayPublishFile } from '../harness/data-licenses.mjs';

test('the site refuses sources that may not be reproduced and labels the rest by their own terms', () => {
  for (const id of ['celestrak', 'set-jb2008', 'esa-earth-observation', 'esa-navigation-office', 'esa-navigation-office-pod']) {
    assert.throws(() => labelFor([id]), /may not be reproduced/, id);
  }
  const iers = labelFor(['iers']);
  assert.ok(!/^MIT/.test(iers.license), 'IERS rows are not MIT');
  assert.match(iers.credit, /IERS Earth Orientation Centre/);
  assert.match(labelFor(['sds-vcm-sample']).license, /Public sources/);
});

test('publish steps skip ESA/ESOC, ESA EO and SET files by name and keep IGS and Copernicus ones', () => {
  for (const name of ['ESA0OPSFIN_20262140000_01D_05M_ORB.SP3.gz', 'SW_OPER_SP3ACOM_2__20260801T235942_20260802T235942_0203.ZIP', '260814.cs2.v4.sp3.gz', 'SOLFSMY.TXT']) assert.equal(mayPublishFile(name), false, name);
  for (const name of ['IGS0OPSFIN_20262140000_01D_15M_ORB.SP3.gz', 'S1A_OPER_AUX_POEORB_OPOD_20260802.EOF']) assert.equal(mayPublishFile(name), true, name);
});
