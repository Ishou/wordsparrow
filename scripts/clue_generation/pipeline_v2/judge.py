"""Load the clue-judge artifact and score (lemma, style, clue). Shadow-mode scorer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from .. import judge_features as jf


class Judge:
    """A frozen backbone + linear probe; scores a single (lemma, style, clue)."""

    def __init__(self, probe: Any, backbone: Any, styles: list[str]) -> None:
        self._probe = probe
        self._backbone = backbone
        self._styles = styles

    @classmethod
    def load(cls, artifact_dir: Path) -> "Judge":
        """Load probe.joblib + metadata.json + the referenced sentence-transformer backbone."""
        import joblib
        from sentence_transformers import SentenceTransformer

        meta = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        # trusted in-repo artifact (our own train_judge output), not untrusted input
        probe = joblib.load(artifact_dir / "probe.joblib")
        backbone = SentenceTransformer(meta["backbone_ref"])
        return cls(probe, backbone, meta["styles"])

    def score(self, lemma: str, style: str, clue: str) -> float:
        """Probability-like judge score in [0, 1] (higher = better clue)."""
        emb = self._backbone.encode([jf.normalize_clue(clue), lemma], show_progress_bar=False)
        feat = jf.feature_vector(np.asarray(emb[0]), np.asarray(emb[1]),
                                 jf.style_onehot(style, self._styles))
        return float(self._probe.predict_proba(feat.reshape(1, -1))[0, 1])
