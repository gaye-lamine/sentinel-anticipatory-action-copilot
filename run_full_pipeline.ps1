<#!
.SYNOPSIS
Runs the official ICPAC ibf-thresholds-triggers orchestration script from Windows.

.DESCRIPTION
This is a thin, reproducible wrapper around the official scientific pipeline.
It does not reproduce or alter the scientific calculations in Sentinel. Configure
the upstream pipeline and CDS credentials before use. The resulting district CSV
and GeoJSON can then be copied into this Sentinel project.
#>
[CmdletBinding()]
param(
    [string]$PipelineRoot = "C:\Users\lamine\Desktop\ibf-thresholds-triggers",
    [string]$PythonExecutable = "python",
    [int]$Year = 2026,
    [int]$Month = 1,
    [ValidateSet("MAM", "JJA")]
    [string]$Season = "MAM",
    [string]$OutputDirectory = "run-test",
    [string]$Threshold = "-0.68",
    [string]$Trigger = "0.152",
    [switch]$SkipDownload
)

$ErrorActionPreference = "Stop"
$orchestrator = Join-Path $PipelineRoot "run_pipeline.py"

if (-not (Test-Path -LiteralPath $orchestrator)) {
    throw "Official pipeline orchestration script was not found: $orchestrator"
}

$arguments = @(
    $orchestrator,
    "--year", $Year,
    "--month", $Month,
    "--season", $Season,
    "--output-dir", $OutputDirectory,
    "--thresholds=$Threshold",
    "--triggers=$Trigger"
)

if ($SkipDownload) {
    $arguments += "--skip-download"
}

Push-Location $PipelineRoot
try {
    & $PythonExecutable @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Official pipeline failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "Pipeline completed. Copy the generated district-average CSV and Karamoja GeoJSON into Sentinel for serving."
