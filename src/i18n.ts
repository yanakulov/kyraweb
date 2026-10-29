import { ref, watch } from 'vue';
import gameRussian from './locales/ru-game.json';

export type Language = 'en' | 'ru';
const preferenceKey = 'kyrandia.language';
function initialLanguage(): Language {
  try { const saved = globalThis.localStorage?.getItem(preferenceKey); if (saved === 'en' || saved === 'ru') return saved; } catch { /* Reading remains available when storage is blocked. */ }
  return globalThis.navigator?.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
export const locale = ref<Language>(initialLanguage());
watch(locale, value => {
  try { globalThis.localStorage?.setItem(preferenceKey, value); } catch { /* The chosen language still applies for this visit. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}, { immediate: true, flush: 'sync' });
export function setLocale(value: string) { if (value === 'en' || value === 'ru') locale.value = value; }

export const russian: Record<string, string> = {
  ...gameRussian,
  'Open the book': 'Открыть книгу',
  'Preparing your story…': 'Готовим вашу историю…',
  'The story begins…': 'История начинается…',
  'The original Kyrandia cover embossed into leather': 'Обложка «Легенды о Кирандии», вытесненная на коже',
  'Fables and Fiends, Book One': 'Сказки и демоны. Книга первая',
  'Fables & Fiends · Book One': 'Сказки и демоны · Книга первая',
  'Book One': 'Книга первая',
  'The Legend of Kyrandia': 'Легенда о Кирандии',
  'Continue journey': 'Продолжить путь',
  'Start Journey': 'Начать путешествие',
  'Start journey': 'Начать путешествие',
  'A tale of magic. A kingdom to awaken.': 'Сказание о магии. Королевство ждёт пробуждения.',
  'Game settings': 'Настройки игры',
  'Back to Options': 'Назад к меню',
  'Book options': 'Меню книги',
  'Options': 'Меню',
  'Resume': 'Продолжить',
  'Save game': 'Сохранить игру',
  'Load game': 'Загрузить игру',
  'Settings': 'Настройки',
  'How to play': 'Как играть',
  'Save your story': 'Сохранить историю',
  'Saved chapters': 'Сохранённые главы',
  'Keep your place in the story.': 'Оставьте закладку в своей истории.',
  'Return to a saved chapter.': 'Вернитесь к сохранённой главе.',
  'Chapter name': 'Название главы',
  'My adventure': 'Моё приключение',
  'Empty page': 'Чистая страница',
  'Replace this saved chapter?': 'Перезаписать эту главу?',
  'Replace': 'Перезаписать',
  'Keep it': 'Оставить',
  'Save here': 'Сохранить здесь',
  'Load chapter': 'Открыть главу',
  'Saved in this browser on this device.': 'Хранится в этом браузере на этом устройстве.',
  'Walk speed': 'Скорость ходьбы',
  'Slowest': 'Очень медленно',
  'Slow': 'Медленно',
  'Fast': 'Быстро',
  'Fastest': 'Очень быстро',
  'Language': 'Язык',
  'Window dust': 'Пылинки в лучах света',
  'Full screen': 'На весь экран',
  'Exit full screen': 'Выйти из полного экрана',
  'Main menu': 'Главное меню',
  'Replay intro': 'Повторить заставку',
  'The story so far': 'Предыстория',
  'Leave this adventure? Unsaved progress will be lost.': 'Покинуть приключение? Несохранённый прогресс будет потерян.',
  'Continue': 'Продолжить',
  'Stay here': 'Остаться',
  'Original tale © 1992 Westwood Studios': 'Оригинальная история © 1992 Westwood Studios',
  'An unofficial web remake': 'Неофициальный веб-ремейк',
  'Remake by': 'Ремейк от',
  'Reimagined by AkulaFlow · Yan Akulov': 'Новая глава — AkulaFlow · Ян Акулов',
  'Explore.': 'Исследуйте.',
  'Click to walk. Move the cursor to an exit to reveal its arrow.': 'Щёлкните, чтобы идти. Подведите курсор к выходу — появится стрелка.',
  'Discover.': 'Открывайте.',
  'Click people to talk or objects to take them. Choose an inventory item, then click where to use it.': 'Щёлкните по персонажу, чтобы заговорить, или по предмету, чтобы взять его. Выберите вещь в инвентаре и укажите, где её использовать.',
  'Touch.': 'На сенсорном экране.',
  'Swipe to guide the cursor. Tap to interact. During dialogue, tap to skip the current line.': 'Ведите курсор свайпом. Коснитесь экрана, чтобы действовать. Во время разговора касание пропускает текущую реплику.',
  'Options returns you to this book and pauses the adventure.': 'Кнопка Options возвращает к книге и ставит приключение на паузу.',
  'Opening your saved chapter…': 'Открываем сохранённую главу…',
  'Resume to finish the current action before saving.': 'Перед сохранением вернитесь в игру и дождитесь конца текущего действия.',
  'Saved chapters are unavailable.': 'Сохранённые главы недоступны.',
  'The chapter could not be saved.': 'Не удалось сохранить главу.',
  'This chapter could not be opened.': 'Не удалось открыть эту главу.',
  'This page has no saved chapter.': 'На этой странице пока нет сохранённой главы.',
  'The game is not ready.': 'Игра ещё не готова.',
  'The game could not load. Please try again.': 'Не удалось загрузить игру. Попробуйте снова.',
  'The next scene could not be loaded. Tap the exit to try again.': 'Не удалось загрузить следующую локацию. Выберите выход ещё раз, чтобы повторить попытку.',
  'Brandon has died. Start a new journey.': 'Брендон погиб. Начните новое путешествие или загрузите сохранение.',
  'Try again': 'Попробовать снова',
  'Loading…': 'Загрузка…',
  'Loading the scene…': 'Загружаем локацию…',
  'Kyrandia game scene': 'Игровая сцена Кирандии',
  'The story is unfolding…': 'История продолжается…',
  'The journey is paused.': 'Путешествие приостановлено.',
  'Click or tap to skip this line.': 'Щёлкните или коснитесь экрана, чтобы пропустить реплику.',
  'Your journey begins here.': 'Здесь начинается ваше путешествие.',
  'Swipe to move the cursor. Tap to interact.': 'Ведите курсор свайпом. Коснитесь экрана, чтобы действовать.',
  'Click or tap to walk, pick up and place items.': 'Щёлкайте или касайтесь экрана, чтобы идти, брать и класть предметы.',
  'Click where you want to go.': 'Укажите, куда хотите пойти.',
  'The Temple of Kyrandia': 'Храм Кирандии',
  'A southern cliff': 'Южный утёс',
  'Letter': 'Письмо',
  'Ruby': 'Рубин',
  'Saw': 'Пила',
  'Lavender rose': 'Лиловая роза',
  'Silver rose': 'Серебряная роза',
  'Marble': 'Шарик',
  'Teardrop': 'Слеза',
  'Apple': 'Яблоко',
  'Apple (eaten)': 'Огрызок',
  'Item': 'Предмет',
  'Unsupported game save version. Update the game or choose another slot.': 'Эта версия сохранения не поддерживается. Обновите игру или выберите другую главу.',
  'Unsupported save version. Update the game or choose another slot.': 'Эта версия сохранения не поддерживается. Обновите игру или выберите другую главу.',
  'The game save is too large. Existing saves have not changed.': 'Сохранение слишком велико. Существующие главы не изменены.',
  'Browser storage is unavailable. Allow storage for this site to use saved games.': 'Хранилище браузера недоступно. Разрешите этому сайту хранить данные, чтобы сохранять игру.',
  'Saved games could not be read. Allow storage for this site and try again.': 'Не удалось прочесть сохранения. Разрешите этому сайту хранить данные и повторите попытку.',
  'This save is too large to load. Choose another slot.': 'Это сохранение слишком велико для загрузки. Выберите другую главу.',
  'This save is damaged. Choose another slot or save again.': 'Сохранение повреждено. Выберите другую главу или сохраните игру заново.',
  'This save could not be loaded.': 'Не удалось загрузить сохранение.',
  'Choose one of the three save slots.': 'Выберите одну из трёх глав для сохранения.',
  'The save is too large. Existing saves have not changed.': 'Сохранение слишком велико. Существующие главы не изменены.',
  'Browser storage is full. Free space for this site and try again; existing saves have not changed.': 'Хранилище браузера заполнено. Освободите место для этого сайта и повторите попытку. Существующие главы не изменены.',
  'The game could not be saved. Allow storage for this site and try again; existing saves have not changed.': 'Не удалось сохранить игру. Разрешите этому сайту хранить данные и повторите попытку. Существующие главы не изменены.',
  'This saved room is incomplete. Choose another saved game.': 'Данные сохранённой комнаты неполны. Выберите другую главу.',
  "This save does not match the room's animations.": 'Это сохранение несовместимо с анимациями комнаты. Выберите другую главу.',
  'The saved room animation is invalid.': 'Данные анимации в сохранении повреждены. Выберите другую главу.',
  'Dear Brynn:': 'Дорогая Брин!',
  'Malcolm has broken free. Soon he will come for me. Please help Brandon. Direct him toward the Amulet. Use the lavender rose to key the spells.': 'Малколм вырвался на свободу. Скоро он придёт за мной. Прошу, помоги Брендону. Направь его к Амулету. Пусть лиловая роза станет ключом к чарам.',
  "Darm and Zanthia should be able to help. Be careful, he'll try to get all of us.": 'Дарм и Зантия должны суметь помочь. Будь осторожна: он попытается добраться до каждого из нас.',
  'Kallak': 'Каллак',
};

/** Original scripts keep their text/timing; only the presented words change. */
export function translateGameText(text: string): string {
  const key = text.replace(/\s+/g, ' ').trim();
  if (locale.value !== 'ru') return text;
  if (russian[key]) return russian[key];
  if (/^Chapter \d+$/.test(key)) return key.replace('Chapter', 'Глава');
  const saved = /^“(.+)” saved\.$/.exec(key);
  if (saved) return `«${saved[1]}» сохранено.`;
  const action = /^(Took|Placed) (.+)$/.exec(key);
  if (action) return `${action[1] === 'Took' ? 'Взято' : 'Положено'}: ${russian[action[2]] ?? action[2]}`;
  if (key.startsWith('Invalid save data (')) return 'Данные сохранения повреждены. Выберите другую главу или сохраните игру заново.';
  return text;
}
export const t = translateGameText;
