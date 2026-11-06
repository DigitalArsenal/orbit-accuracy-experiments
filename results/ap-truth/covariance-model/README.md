No form passed leave-one-block-out on training; nothing is scored on the held-out set as a verdict and nothing ships. Held-out verdict: none.

# AP DRAG process-noise model (COVARIANCE-MODEL.md)

Forms fitted on the training windows (the coverage study's windows re-flown on sdn-ap 0.6.1 at 17 digits with the full RIC block, amendment 2) by re-weighting the module's own per-term variances; burn-censored near 700 km (amendment 4: Sentinel-1A and 1C; strong drag uncensored, no maneuver record held). Selected in the registered order by leave-one-block-out on five season blocks (T-a, T-b, T-c strong drag 2025; S1-a, S1-b near 700 km 2026; 10-day guards): a fold passes when every decidable left-out cell (R, I, C at 24, 72, 167 h; Sentinel-1 at 24 and 72 h; at least 30 window-arms) has median |z| in [0.603, 0.754] and a share within 2 sigma of at least 0.90. Only a selected form is scored on the held-out windows, once; no held-out row has been read.

## Selection

| Form | Parameters | Training loss | T-a failed / decidable | T-b failed / decidable | T-c failed / decidable | S1-a failed / decidable | S1-b failed / decidable |
|---|---:|---:|---:|---:|---:|---:|---:|
| F0 | 5 | 0.0701 | 7 / 9 | 7 / 9 | 5 / 9 | 3 / 6 | 5 / 6 |
| F1 | 6 | 0.0367 | 6 / 9 | 8 / 9 | 6 / 9 | 4 / 6 | 4 / 6 |
| F2 | 6 | 0.0370 | 6 / 9 | 8 / 9 | 6 / 9 | 4 / 6 | 5 / 6 |
| F3 | 7 | 0.0699 | 7 / 9 | 7 / 9 | 4 / 9 | 3 / 6 | 5 / 6 |
| F4 | 8 | 0.0362 | 6 / 9 | 7 / 9 | 6 / 9 | 3 / 6 | 4 / 6 |
| F5 | 9 | 0.0342 | 5 / 9 | 7 / 9 | 6 / 9 | 4 / 6 | 4 / 6 |
| F6 | 9 | 0.0167 | 4 / 9 | 8 / 9 | 8 / 9 | 4 / 6 | 5 / 6 |
| F7 | 9 | 0.0170 | 6 / 9 | 7 / 9 | 5 / 9 | 4 / 6 | 5 / 6 |
| F8 | 9 | 0.0183 | 5 / 9 | 7 / 9 | 5 / 9 | 4 / 6 | 5 / 6 |
| F9 | 9 | 0.0357 | 5 / 9 | 7 / 9 | 5 / 9 | 3 / 6 | 4 / 6 |
| F10 | 10 | 0.0183 | 5 / 9 | 7 / 9 | 5 / 9 | 4 / 6 | 5 / 6 |
| F11 | 10 | 0.0169 | 6 / 9 | 7 / 9 | 5 / 9 | 4 / 6 | 5 / 6 |
| F12 | 10 | 0.0168 | 4 / 9 | 6 / 9 | 6 / 9 | 3 / 6 | 4 / 6 |

## Cells failing under every form (16)

n: window-arms in the cell; SE: the standard error of a calibrated covariance's median |z| at that n (independent window-arms); pass chance: a calibrated Gaussian covariance's chance to pass the cell (median band and 2-sigma share).

| Left-out block, axis, lead | n | Median \|z\| over the forms | SE | Share within 2 sigma over the forms | Pass chance, calibrated |
|---|---:|---|---:|---|---:|
| T-a C 24 h | 546 | 0.814 to 1.001 | 0.034 | 0.817 to 0.912 | 0.97 |
| T-a C 72 h | 546 | 0.798 to 1.128 | 0.034 | 0.927 to 1.000 | 0.97 |
| T-a R 167 h | 546 | 0.497 to 0.567 | 0.034 | 0.974 to 0.985 | 0.97 |
| T-b I 24 h | 552 | 0.456 to 0.594 | 0.033 | 0.946 to 0.966 | 0.97 |
| T-b C 24 h | 552 | 0.801 to 0.967 | 0.033 | 0.882 to 0.958 | 0.97 |
| T-b I 72 h | 552 | 0.441 to 0.530 | 0.033 | 0.924 to 0.947 | 0.97 |
| T-b C 72 h | 552 | 0.863 to 1.168 | 0.033 | 0.926 to 0.996 | 0.97 |
| T-b C 167 h | 552 | 0.768 to 1.055 | 0.033 | 0.960 to 1.000 | 0.97 |
| T-c I 72 h | 790 | 0.760 to 0.840 | 0.028 | 0.844 to 0.910 | 0.99 |
| T-c C 72 h | 790 | 0.512 to 0.766 | 0.028 | 0.946 to 0.999 | 0.99 |
| T-c I 167 h | 790 | 0.828 to 0.928 | 0.028 | 0.823 to 0.863 | 0.99 |
| S1-a I 24 h | 97 | 0.685 to 1.116 | 0.080 | 0.876 to 0.948 | 0.65 |
| S1-a C 72 h | 37 | 0.379 to 0.575 | 0.129 | 0.946 to 0.946 | 0.42 |
| S1-b R 24 h | 120 | 0.765 to 0.808 | 0.072 | 0.983 to 0.983 | 0.70 |
| S1-b I 24 h | 120 | 0.342 to 0.415 | 0.072 | 0.958 to 0.975 | 0.70 |
| S1-b C 24 h | 120 | 0.832 to 0.957 | 0.072 | 0.933 to 0.942 | 0.70 |

## The gate's size

The chance that a perfectly calibrated Gaussian covariance passes each fold, from each decidable cell's n (normal approximation; independent window-arms, which is optimistic: overlapping windows and the two arms of one window lower the effective n). A fold passes with the product of its cells' chances if they are independent and with the smallest if they are fully correlated.

| Block | Decidable cells | n per cell | Pass chance per cell | Fold, cells independent | Fold, cells fully correlated |
|---|---:|---|---|---:|---:|
| T-a | 9 | 546 | 0.97 | 0.789 | 0.97 |
| T-b | 9 | 552 | 0.97 | 0.795 | 0.97 |
| T-c | 9 | 790 | 0.99 | 0.934 | 0.99 |
| S1-a | 6 | 97, 37 | 0.65, 0.42 | 0.020 | 0.42 |
| S1-b | 6 | 120, 55 | 0.70, 0.51 | 0.046 | 0.51 |

## Fitted on all training rows

| Form | Loss | Parameters |
|---|---:|---|
| F0 | 0.07014 | s_e 5.82414e-7, s_i 0.00000113996, s_l 4.91245e-7, c 0.120747, k_F 1.45768 |
| F1 | 0.03669 | s_e 5.77676e-7, s_i 0.00000107086, s_l 4.92314e-7, c 0.120097, k_F 1.50065, q_i 0.181246 |
| F2 | 0.03699 | s_e 5.76051e-7, s_i 6.86737e-7, s_l 4.92457e-7, c 0.120157, k_F 1.50343, c_i 0.0831596 |
| F3 | 0.06986 | s_e 5.90513e-7, s_i 0.00000113107, s_l 4.92552e-7, c 0.120696, k_U 1.42075, k_V 0.829903, k_W 1.57561 |
| F4 | 0.03618 | s_e 5.92260e-7, s_i 0.00000105125, s_l 4.93404e-7, c 0.120136, k_U 1.41903, k_V 0.832113, k_W 1.70188, q_i 0.186575 |
| F5 | 0.03423 | s_e 5.90663e-7, s_i 0.00000104742, s_l 4.66980e-7, c 0.121386, k_U 1.41712, k_V 0.972732, k_W 1.73444, q_i 0.187233, m -0.341995 |
| F6 | 0.01667 | s_e 5.73155e-7, s_i 0.00000105226, s_l 2.93344e-7, c 0.631128, k_U 1.42996, k_V 1.91784, k_W 1.69483, q_i 0.186097, q_d -0.698632 |
| F7 | 0.01703 | s_e 5.59140e-7, s_i 0.00000105073, s_l 2.93436e-7, c 0.120564, k_U 1.41771, k_V 1.81345, k_W 1.70052, q_i 0.186620, s_a 0.0000272136 |
| F8 | 0.01833 | s_e 5.88914e-7, s_i 0.00000105123, s_l 3.36518e-7, c 0.120315, k_U 1.42210, k_V 3.30657, k_W 1.70230, q_i 0.186378, p_l 1.46817 |
| F9 | 0.03569 | s_e 5.86984e-7, s_i 0.00000105092, s_l 4.96435e-7, c 0.102068, k_U 1.44158, k_V 0.831393, k_W 1.70427, q_i 0.186332, inv_tau 0.0407986 |
| F10 | 0.01831 | s_e 5.86950e-7, s_i 0.00000105142, s_l 3.39316e-7, c 0.116522, k_U 1.42722, k_V 3.24043, k_W 1.70373, q_i 0.186211, p_l 1.46113, inv_tau 0.00764639 |
| F11 | 0.01691 | s_e 5.49995e-7, s_i 0.00000104972, s_l 3.01285e-7, c 0.120140, k_U 1.43207, k_V 1.70348, k_W 1.70447, q_i 0.187075, m 0.127496, s_a 0.0000269926 |
| F12 | 0.01680 | s_e 4.93822e-7, s_i 6.90027e-7, s_l 2.68600e-7, c 3.93040, k_F 1.50023, s_e2 3.70867e-7, s_i2 0.00000163844, s_l2 3.38759e-7, c2 0.126976, k_F2 1.51852 |
Build of the held-out flights: `propagator/sdn-ap` 0.6.1, wasm SHA-256 `05dd4a6600fb4c65d5841e1f49dc26df64fca7c14f1084644cafcfa875fe0a87` at modules `3b59e95b3`. Rows: `/opt/data/sdn-archive/operator-theory/covariance-model`, run from this repository at `248856e233`.
