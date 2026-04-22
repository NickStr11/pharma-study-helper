param(
    [string]$TargetPath = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-CommandPath {
    param([string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return $null
    }

    return $command.Source
}

function Test-CodexCommand {
    $pathValue = Find-CommandPath -Name 'codex'
    if (-not $pathValue) {
        return [pscustomobject]@{
            Check  = 'codex executable'
            Status = 'missing'
            Detail = 'codex not found in PATH'
            Path   = '-'
        }
    }

    try {
        $output = (& $pathValue --version 2>&1 | Out-String).Trim()
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            return [pscustomobject]@{
                Check  = 'codex executable'
                Status = 'ok'
                Detail = if ([string]::IsNullOrWhiteSpace($output)) { 'version probe passed' } else { $output }
                Path   = $pathValue
            }
        }

        if ($pathValue -like '*WindowsApps*' -and $output -match 'Access is denied') {
            return [pscustomobject]@{
                Check  = 'codex executable'
                Status = 'shell-blocked'
                Detail = 'WindowsApps package stub is not directly executable from shell; verify live spawn inside the Codex app.'
                Path   = $pathValue
            }
        }

        return [pscustomobject]@{
            Check  = 'codex executable'
            Status = 'blocked'
            Detail = if ([string]::IsNullOrWhiteSpace($output)) { "codex exited with code $exitCode" } else { $output }
            Path   = $pathValue
        }
    }
    catch {
        if ($pathValue -like '*WindowsApps*' -and $_.Exception.Message -match 'Access is denied') {
            return [pscustomobject]@{
                Check  = 'codex executable'
                Status = 'shell-blocked'
                Detail = 'WindowsApps package stub is not directly executable from shell; verify live spawn inside the Codex app.'
                Path   = $pathValue
            }
        }

        return [pscustomobject]@{
            Check  = 'codex executable'
            Status = 'blocked'
            Detail = $_.Exception.Message
            Path   = $pathValue
        }
    }
}

function Get-FileContentOrNull {
    param([string]$FullPath)

    if (-not (Test-Path -LiteralPath $FullPath)) {
        return $null
    }

    return Get-Content -LiteralPath $FullPath -Raw -Encoding utf8
}

$resolvedRoot = (Resolve-Path -LiteralPath $TargetPath).Path
$codexRow = Test-CodexCommand

$configPath = Join-Path $resolvedRoot '.codex\config.toml'
$docsResearcherPath = Join-Path $resolvedRoot '.codex\agents\docs-researcher.toml'
$expectedAgents = @(
    '.codex\agents\repo-recon.toml',
    '.codex\agents\security-reviewer.toml',
    '.codex\agents\docs-researcher.toml',
    '.codex\agents\exa-researcher.toml',
    '.codex\agents\notebooklm-summarizer.toml',
    '.codex\agents\browser-debugger.toml',
    '.codex\agents\targeted-fixer.toml'
)

$configContent = Get-FileContentOrNull -FullPath $configPath
$docsResearcherContent = Get-FileContentOrNull -FullPath $docsResearcherPath
$presentAgents = ($expectedAgents | Where-Object {
    Test-Path -LiteralPath (Join-Path $resolvedRoot $_)
}).Count

$subagentRows = @(
    [pscustomobject]@{
        Check  = '.codex/config.toml'
        Status = if ($configContent) { 'ok' } else { 'missing' }
        Detail = 'project-scoped config'
    },
    [pscustomobject]@{
        Check  = 'multi_agent'
        Status = if ($configContent -and $configContent -match '(?s)\[features\].*?multi_agent\s*=\s*true') { 'ok' } else { 'missing' }
        Detail = 'features.multi_agent = true'
    },
    [pscustomobject]@{
        Check  = 'max_threads'
        Status = if ($configContent -and $configContent -match '(?s)\[agents\].*?max_threads\s*=\s*\d+') { 'ok' } else { 'missing' }
        Detail = '[agents].max_threads'
    },
    [pscustomobject]@{
        Check  = 'max_depth'
        Status = if ($configContent -and $configContent -match '(?s)\[agents\].*?max_depth\s*=\s*\d+') { 'ok' } else { 'missing' }
        Detail = '[agents].max_depth'
    },
    [pscustomobject]@{
        Check  = 'custom agents'
        Status = if ($presentAgents -eq $expectedAgents.Count) { 'ok' } else { 'missing' }
        Detail = "$presentAgents/$($expectedAgents.Count) expected agent files"
    },
    [pscustomobject]@{
        Check  = 'docs MCP'
        Status = if ($docsResearcherContent -and $docsResearcherContent -match '(?s)\[mcp_servers\.openaiDeveloperDocs\].*?https://developers\.openai\.com/mcp') { 'ok' } else { 'missing' }
        Detail = 'docs_researcher local openaiDeveloperDocs MCP'
    }
)

Write-Host ''
Write-Host "=== Codex Subagent Smoke ($resolvedRoot) ===" -ForegroundColor Cyan
Write-Host ''
@($codexRow) | Format-Table -AutoSize

Write-Host ''
$subagentRows | Format-Table -AutoSize

$subagentFailures = @($subagentRows | Where-Object { $_.Status -ne 'ok' })
$hasFailures = $codexRow.Status -notin @('ok', 'shell-blocked') -or $subagentFailures.Count -gt 0
if ($hasFailures) {
    Write-Host ''
    Write-Host 'Subagent smoke readiness failed.' -ForegroundColor Red
    exit 1
}

Write-Host ''
if ($codexRow.Status -eq 'shell-blocked') {
    Write-Host 'Subagent config readiness passed. Shell probe is blocked by WindowsApps packaging, so do the live spawn check inside the Codex app.' -ForegroundColor Yellow
}
else {
    Write-Host 'Subagent smoke readiness passed.' -ForegroundColor Green
}
Write-Host ''
Write-Host 'Suggested smoke prompt:' -ForegroundColor Cyan
Write-Host 'Ask Codex to spawn repo_recon, docs_researcher, and security_reviewer in parallel, wait for them, and return one consolidated summary.'
