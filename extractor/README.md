# Kyrandia extractor tools

**Language:** English | [Русский](README.ru.md)

A set of scripts to extract and decompile **The Legend of Kyrandia** resources into a convenient JSON format.
Original game files are not committed to the repository (they live in ignored folders).

## Requirements

- Python 3.x
- Original game files (local, not in Git)

## Workflow overview

1) Put the original game files into `original_files/` or `extractor/kyr-game/` (both are in `.gitignore`).
2) If needed, unpack `.PAK` containers.
3) Convert the required resources to JSON and store them in `extracted_files/`.

## Scripts

- `msc_unpack.py` — unpack `MSC.PAK` into individual `.MSC` files.
- `msc_to_json.py` — decode a single `.MSC` to JSON (walkmask/screen).
- `cps_to_json.py` — decode `.CPS` to JSON (pixels + palette).
- `dat_to_json.py` — decompile one `.DAT` (scene metadata) to JSON.
- `dat_batch_to_json.py` — batch-convert all `.DAT` from a folder to JSON.
- `emc_to_json.py` — extract render commands from `.EMC` to JSON.
- `emc_text_to_json.py` — extract text strings from `.EMC` to JSON.
- `WestPak2_0.68a.exe` — third‑party Westwood unpacker (used manually if needed).

## Usage examples

Unpack `MSC.PAK`:

```powershell
python extractor\msc_unpack.py original_files\MSC.PAK extracted_files\msc
```

Convert a single `.MSC` to JSON:

```powershell
python extractor\msc_to_json.py extracted_files\msc\GEMCUT.MSC extracted_files\msc\GEMCUT.json
```

Convert `.CPS` to JSON with a palette:

```powershell
python extractor\cps_to_json.py original_files\MAIN15.CPS extracted_files\cps\MAIN15.json --width 320 --height 200 --palette original_files\PALETTE.COL
```

Convert a single `.DAT`:

```powershell
python extractor\dat_to_json.py extracted_files\dat_pak\ALCHEMY.DAT extracted_files\dat_json\ALCHEMY.json
```

Batch convert `.DAT`:

```powershell
python extractor\dat_batch_to_json.py extracted_files\dat_pak extracted_files\dat_json
```

Extract render commands from `.EMC`:

```powershell
python extractor\emc_to_json.py original_files\GEMCUT.EMC extracted_files\emc\GEMCUT.json
```

Extract text from `.EMC`:

```powershell
python extractor\emc_text_to_json.py original_files\_NPC.EMC extracted_files\emc\_NPC.json
```

## What can be committed

Only decompiled artifacts (JSON). Original/raw binary game files and intermediate unpacked data stay local and are Git‑ignored.
