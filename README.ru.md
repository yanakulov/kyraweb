# KyraWeb

![Игровое лого](https://upload.wikimedia.org/wikipedia/commons/6/6d/The_Legend_of_Kyrandia_Series_-_Logo.png?20210417191824)

![CURRENT STAGE](https://img.shields.io/badge/ТЕКУЩИЙ%20ЭТАП-Работаю%20над%20субтитрами-green?style=for-the-badge)

**Язык:** [English](README.md) | Русский

---

**KyraWeb** — независимый веб‑ремейк *The Legend of Kyrandia* (Westwood Studios, 1992). Проект воссоздаёт оригинальную логику и визуальный стиль на современных веб‑технологиях (Vue 3 + Vite), используя данные оригинальной игры.

## Текущий статус

- Играбельное интро с таймингами, фейдами и сценовыми анимациями
- Сцена Kalak’s Place (GEMCUT) с маской, перемещением и слоями
- Оверлеи предметов (письмо/пила с заменой спрайтов)
- Инвентарь и бросок предметов с отскоком
- Отладочная панель (маска, слои, скорость, шаг анимации)
- Деморежим в сцене письма (зацикливание + интерактивная панель)

## В планах

- Система титров
- Расширение списка сцен и скриптов
- Оригинальные меню и UI
- Сохранения/загрузка и конфигурация

## Документация

**Русская версия:**
- Анимации сцены: `docs/animations.ru.md`
- Передвижение и walk-mask: `docs/movement.ru.md`

**English (default):**
- Scene animations: `docs/animations.md`
- Movement & walkmask: `docs/movement.md`

## Экстрактор ресурсов

Папка `extractor/` содержит скрипты для конвертации оригинальных ресурсов в JSON/PNG. Они нужны **только локально** и не должны коммититься вместе с файлами игры.

Краткий список (см. `extractor/README.md`):

- `msc_unpack.py` — распаковка `MSC.PAK`
- `msc_to_json.py` — декодирование `.MSC` в JSON (маска)
- `cps_to_json.py` — декодирование `.CPS` в JSON (пиксели + палитра)
- `dat_to_json.py` / `dat_batch_to_json.py` — декодирование `.DAT`
- `emc_to_json.py` — извлечение анимационных команд
- `emc_text_to_json.py` — извлечение текста из `.EMC`
- `wsa_to_png.py` — декодирование `.WSA` в PNG

## Шрифт

В интерфейсе используется шрифт **Kyrandia**, файл:

```
public/assets/font/kyrandia.otf
```

Автор (ссылка):

```
https://fontstruct.com/fontstructions/show/1132362/kyrandia_2
```
