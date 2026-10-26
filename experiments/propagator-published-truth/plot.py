# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib==3.10.7"]
# ///
"""Plot aggregate statistics only; no astrodynamics calculations."""
import hashlib
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "results/propagator-published-truth"
raw = (RESULTS / "summary.json").read_bytes()
summary = json.loads(raw)
plt.rcParams.update({"svg.hashsalt": "published-truth-20261026", "font.family": "DejaVu Sans", "font.size": 10})
fig, axes = plt.subplots(2, 2, figsize=(10, 7.2), layout="constrained")
colors = {"xp-native": "#137c9b", "ap-msis": "#be7800", "ffm": "#a33175"}
styles = {"xp-native": "-", "ap-msis": "--", "ffm": "-"}
leads = (1, 3, 7)
for ax, family in zip(axes.flat, ("Swarm", "Sentinel", "GRACE-FO", "GPS")):
    data = summary["families"][family]["leads"]
    for arm, color in colors.items():
        values = [data[str(d)]["arms"][arm]["medianRmsM"] for d in leads]
        if any(x is None for x in values):
            ax.text(.04, .88, "FFM: 9/9 covariance requests rejected", transform=ax.transAxes, color=colors["ffm"], fontsize=9)
            continue
        ax.plot(leads, values, marker="o", color=color, linestyle=styles[arm], linewidth=2, label=arm)
    ax.set(title=family, xlabel="Forecast lead (days)", ylabel="Median arc position RMS (m)", yscale="log", xticks=leads)
    ax.grid(True, which="major", alpha=.22)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, fontsize=9)
fig.suptitle("Published-reference forecasts: accuracy by orbit family\n24-hour precise-state fits · final-day scoring bins · logarithmic error axes", fontsize=14)
fig.supxlabel("Descriptive family medians: 2–3 spacecraft per family. Failed arcs retained in counts; no covariance-realism pass.", fontsize=9)
metadata = {"Date": None, "Creator": "Matplotlib 3.10.7", "Description": f"Aggregate summary SHA-256: {hashlib.sha256(raw).hexdigest()}"}
fig.savefig(RESULTS / "accuracy.svg", metadata=metadata)
preview = ROOT / "runs/propagator-published-truth/accuracy-preview.png"
preview.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(preview, dpi=150)
plt.close(fig)
print(f"Wrote {RESULTS / 'accuracy.svg'} from {len(summary['arcSummaries'])} arc aggregates")
