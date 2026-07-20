# Sentinel Engineering Notes — ICPAC Pipeline on Windows

## Scope

Sentinel consumes the district-average output from the official `ibf-thresholds-triggers` scientific workflow. The scientific model is not reimplemented in this repository; it remains the source of truth for the forecast probabilities and trigger calculation.

## Windows execution considerations

The upstream workflow was executed in the `drought_env` micromamba environment on Windows. The following implementation considerations were applied during pipeline execution and handoff:

- **netCDF serialization:** write forecast products with a netCDF-compatible engine and explicit serialization settings when an `xarray` dataset contains non-serializable attributes.
- **Memory-aware processing:** perform spatial and temporal slicing before loading or regridding large seasonal forecast arrays; avoid materialising a full 45-year baseline in memory unnecessarily.
- **Environment consistency:** keep geospatial, `xarray`, `xclim`/`xsdba`, netCDF and CDS API dependencies within the same pinned environment to avoid binary and projection-library conflicts on Windows.
- **Reproducible handoff:** retain the forecast NetCDF, district GeoJSON and district-average CSV as separate outputs. Sentinel only requires the last two inputs to serve the decision interface.

## Scientific pipeline sequence

The official orchestration script follows this high-level chain:

1. Download ECMWF Copernicus SEAS5.1 forecast and historical baseline data from CDS.
2. Transform precipitation data into a regionally masked SPI3 forecast.
3. Apply the drought threshold and anticipatory-action probability trigger.
4. Produce the forecast probability grid and district-level averages using `admin2Name` boundaries.

The upstream orchestration release packaged with the evaluated Windows run supports MAM and JJA as automated target seasons. The included OND 2026 handoff was generated with the official forecast-plot and district-statistics stages after preparation of the forecast NetCDF.

## Sentinel OND 2026 handoff

- Region: Karamoja, Uganda (`kmj`)
- Season: OND 2026
- SPI threshold: `-0.68`
- Activation trigger: `0.152` / `15.2%`
- District output: `run-test/kmj_seas51_spi3_ond_eprob_2026_07_th0p68_tr15p2_district_averages.csv`

Karenga is the activated district in the packaged result at 18.1%; all other district statuses are derived dynamically by Sentinel from the same CSV.
