# Экстрактор данных Kyrandia

**Язык:** Русский | [English](README.md)

Набор скриптов для извлечения и декомпиляции ресурсов **The Legend of Kyrandia** в удобный JSON‑формат.
Оригинальные файлы игры в репозиторий не добавляются (они лежат в игнорируемых папках).

## Требования

- Python 3.x
- Оригинальные файлы игры (локально, не в Git)

## Общий подход

1) Положите оригинальные файлы игры в `original_files/` или `extractor/kyr-game/` (эти папки в `.gitignore`).
2) При необходимости распакуйте контейнеры `.PAK`.
3) Конвертируйте нужные ресурсы в JSON и храните JSON в `extracted_files/`.

## Скрипты

- `msc_unpack.py` — распаковка `MSC.PAK` в отдельные `.MSC` файлы.
- `msc_to_json.py` — декодирование одного `.MSC` в JSON (маска проходимости/экран).
- `cps_to_json.py` — декодирование `.CPS` в JSON (пиксели + палитра).
- `dat_to_json.py` — декомпиляция одного `.DAT` (метаданные сцены) в JSON.
- `dat_batch_to_json.py` — пакетная конвертация всех `.DAT` из папки в JSON.
- `emc_to_json.py` — извлечение вызовов отрисовки из `.EMC` в JSON.
- `emc_text_to_json.py` — извлечение строк текста из `.EMC` в JSON.
- `WestPak2_0.68a.exe` — сторонний инструмент для распаковки ресурсов Westwood (используется вручную при необходимости).

## Примеры использования

Распаковать `MSC.PAK`:

```powershell
python extractor\msc_unpack.py original_files\MSC.PAK extracted_files\msc
```

Конвертировать один `.MSC` в JSON:

```powershell
python extractor\msc_to_json.py extracted_files\msc\GEMCUT.MSC extracted_files\msc\GEMCUT.json
```

Конвертировать `.CPS` в JSON с палитрой:

```powershell
python extractor\cps_to_json.py original_files\MAIN15.CPS extracted_files\cps\MAIN15.json --width 320 --height 200 --palette original_files\PALETTE.COL
```

Конвертировать один `.DAT`:

```powershell
python extractor\dat_to_json.py extracted_files\dat_pak\ALCHEMY.DAT extracted_files\dat_json\ALCHEMY.json
```

Пакетная конвертация `.DAT`:

```powershell
python extractor\dat_batch_to_json.py extracted_files\dat_pak extracted_files\dat_json
```

Извлечь отрисовку из `.EMC`:

```powershell
python extractor\emc_to_json.py original_files\GEMCUT.EMC extracted_files\emc\GEMCUT.json
```

Извлечь текст из `.EMC`:

```powershell
python extractor\emc_text_to_json.py original_files\_NPC.EMC extracted_files\emc\_NPC.json
```

## Что можно коммитить

Только декомпилированные артефакты (JSON). Оригинальные/сырые бинарные файлы игры и временные результаты распаковки остаются локально и игнорируются Git.
