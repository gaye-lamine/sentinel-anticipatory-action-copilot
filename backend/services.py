"""Readers for the scientific inputs supplied to Sentinel."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

from .models import DistrictStatus


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "run-test" / "kmj_seas51_spi3_ond_eprob_2026_07_th0p68_tr15p2_district_averages.csv"
GEOJSON_PATH = PROJECT_ROOT / "karamoja_9_districts.geojson"
TRIGGER_THRESHOLD = 15.2


def _normalise_column_name(column: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(column).lower())


def _find_column(columns: list[object], keywords: tuple[str, ...], label: str) -> object:
    """Find a source column without hard-coding the data values themselves."""
    normalised = {_normalise_column_name(column): column for column in columns}
    for name, original in normalised.items():
        if any(keyword in name for keyword in keywords):
            return original
    raise HTTPException(
        status_code=500,
        detail=f"Unable to identify the {label} column in Sentinel's district CSV.",
    )


def load_district_statuses() -> list[DistrictStatus]:
    """Parse district drought probabilities directly from the ICPAC result CSV."""
    if not CSV_PATH.is_file():
        raise HTTPException(status_code=500, detail=f"District CSV is missing: {CSV_PATH.name}")

    try:
        dataframe = pd.read_csv(CSV_PATH)
    except (OSError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Unable to read the district CSV.") from exc

    try:
        district_column = _find_column(
            list(dataframe.columns), ("district", "admin2", "admin"), "district"
        )
    except HTTPException:
        # The district-statistics script writes district names as a Pandas index,
        # which is read back as an ``Unnamed: 0`` column. Treat that source
        # column as the district identifier without inventing any names.
        index_columns = [
            column
            for column in dataframe.columns
            if _normalise_column_name(column).startswith("unnamed")
        ]
        if not index_columns:
            raise
        district_column = index_columns[0]
    probability_column = _find_column(
        list(dataframe.columns), ("probability", "eprob", "droughtprob", "prob"), "drought probability"
    )

    statuses: list[DistrictStatus] = []
    for _, row in dataframe.iterrows():
        district_name = row[district_column]
        probability = pd.to_numeric(row[probability_column], errors="coerce")
        if pd.isna(district_name) or pd.isna(probability):
            continue

        drought_probability = float(probability)
        statuses.append(
            DistrictStatus(
                district_name=str(district_name).strip(),
                drought_probability=drought_probability,
                trigger_threshold=TRIGGER_THRESHOLD,
                status="ACTIVATED" if drought_probability >= TRIGGER_THRESHOLD else "WATCH",
            )
        )
    return statuses


def get_district_status(district_name: str) -> DistrictStatus | None:
    """Find a district from the current ICPAC CSV, case-insensitively."""
    requested_name = district_name.strip().casefold()
    return next(
        (
            district
            for district in load_district_statuses()
            if district.district_name.casefold() == requested_name
        ),
        None,
    )


def load_district_geojson() -> dict[str, Any]:
    """Load the supplied Karamoja district boundaries as GeoJSON."""
    if not GEOJSON_PATH.is_file():
        raise HTTPException(status_code=500, detail=f"District GeoJSON is missing: {GEOJSON_PATH.name}")

    try:
        with GEOJSON_PATH.open("r", encoding="utf-8") as geojson_file:
            data = json.load(geojson_file)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Unable to read the district GeoJSON.") from exc

    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="District GeoJSON must be a JSON object.")
    return data
