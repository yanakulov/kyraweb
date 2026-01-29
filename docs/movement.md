# Передвижение и маска проходимости

## Оригинальная логика (ScummVM / Kyrandia LoK)

- Проходимость и слои берутся из `.MSC` (маска 320x144).
- Слой персонажа определяется по `drawLayerTable` в `.DAT` по координате Y.
- Окклюзия (перекрытие) решается сравнением слоя маски и слоя персонажа.

## Реализация в этом проекте

Форматы:
- Маска: `extractor/msc_to_json.py` -> `public/assets/masks/<SCENE>.json`
- Метаданные сцены: `public/assets/scenes/dat/<SCENE>.json`

Логика:
- Точка непроходима, если `(mask & 0x80) != 0`
- Если `maskLayer > actorLayer`, рисуем фон поверх персонажа
- `actorLayer` берём из `drawLayerTable` (JSON сцены)
- Движение и pathing: `src/engine/game.ts`
- Скорость шага: используем тик `1000/60` мс и задержку в тиках как в ScummVM.

Скорости (LoK / ScummVM, `timer_lok.cpp`):
- slowest → 11 тиков
- slow → 9 тиков
- fast → 6 тиков
- fastest → 3 тика

Каждый тик — это один пиксель шага, поэтому скорость ≈ `60 / ticks` px/s.

Отладка:
- В правой панели можно включить маску и информацию по пикселю (x/y, mask, layer, blocked, actor).
