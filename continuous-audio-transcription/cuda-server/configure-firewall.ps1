# This script must be run as Administrator
$ruleName = "WhisperX CUDA Server"
$port = 8000

# Remove existing rule if exists
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

# Create new rule
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $port `
    -Action Allow `
    -Profile Any `
    -Description "Allow WhisperX CUDA transcription server"

Write-Host "Firewall rule created for port $port"
