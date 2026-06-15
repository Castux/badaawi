#!/bin/bash
# Sort Glossary.md alphabetically by the first column (Word)

GLOSSARY_FILE="Glossary.md"

# Check if file exists
if [[ ! -f "$GLOSSARY_FILE" ]]; then
    echo "Error: $GLOSSARY_FILE not found in current directory"
    exit 1
fi

# Read file into array
mapfile -t lines < "$GLOSSARY_FILE"

# Extract header and separator
header="${lines[0]}"
separator="${lines[1]}"

# Extract data rows, sort by first column (field 2 after splitting by |)
{
    for ((i=2; i<${#lines[@]}; i++)); do
        echo "${lines[$i]}"
    done
} | sort -t'|' -k2 > /tmp/sorted_rows.txt

# Write back to file
{
    echo "$header"
    echo "$separator"
    cat /tmp/sorted_rows.txt
} > "$GLOSSARY_FILE"

rm /tmp/sorted_rows.txt
echo "Glossary.md has been sorted alphabetically!"
