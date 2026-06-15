# Sort Glossary.md alphabetically by the first column (Word)
$filePath = "Glossary.md"

# Read all lines
$lines = Get-Content $filePath

# Extract header and separator
$header = $lines[0]
$separator = $lines[1]

# Extract data rows (skip header and separator)
$dataRows = $lines[2..($lines.Count - 1)]

# Sort by first column (word)
$sorted = $dataRows | ForEach-Object {
    $cells = $_ -split '\|'
    $word = $cells[1].Trim()
    @{ Line = $_; Word = $word }
} | Sort-Object { $_.Word } | ForEach-Object { $_.Line }

# Write back to file
$output = @($header, $separator) + $sorted
Set-Content -Path $filePath -Value $output -Encoding UTF8

Write-Host "Glossary.md has been sorted alphabetically!"
