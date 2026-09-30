#!/usr/bin/env python3
"""Build the demo library used for the store / README screenshots.

    python3 scripts/screenshots/demo_library.py [today YYYY-MM-DD] > demo-backup.json

The output is a regular Tomo backup: restore it with "Replace" on a test
device. Covers are Open Library URLs (loaded on demand, no files inside).
Deterministic: the same `today` gives the same library.
"""
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone

TODAY = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
rnd = random.Random(42)


def ol_id(cover_id):
    return f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"


def ol_isbn(isbn):
    return f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"


# isbn, title, author, pages, cover, moods, pace
CATALOG = {
    "phm": ("9780593135204", "Project Hail Mary", "Andy Weir", 496, ol_id(11200092), ["funny", "hopeful", "tense"], "fast"),
    "notw": ("9780756404741", "The Name of the Wind", "Patrick Rothfuss", 736, ol_id(11480483), ["adventurous", "mysterious"], "medium"),
    "tomorrow": ("9780593321201", "Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", 416, ol_id(12859975), ["emotional", "reflective"], "medium"),
    "dune": ("9780441172719", "Dune", "Frank Herbert", 608, ol_id(11481354), ["adventurous", "challenging"], "slow"),
    "circe": ("9780316556347", "Circe", "Madeline Miller", 393, ol_id(8739376), ["emotional", "reflective"], "medium"),
    "hobbit": ("9780547928227", "The Hobbit", "J.R.R. Tolkien", 300, ol_id(14627509), ["adventurous", "funny"], "fast"),
    "martian": ("9780553418026", "The Martian", "Andy Weir", 387, ol_id(11447888), ["funny", "tense"], "fast"),
    "midnight": ("9780525559474", "The Midnight Library", "Matt Haig", 288, ol_id(10313767), ["hopeful", "reflective"], "fast"),
    "bookthief": ("9780375842207", "The Book Thief", "Markus Zusak", 552, ol_id(8153054), ["emotional", "sad"], "medium"),
    "gatsby": ("9780743273565", "The Great Gatsby", "F. Scott Fitzgerald", 180, ol_isbn("9780743273565"), ["reflective", "sad"], "fast"),
    "p&p": ("9780141439518", "Pride and Prejudice", "Jane Austen", 480, ol_isbn("9780141439518"), ["romantic", "funny"], "medium"),
    "1984": ("9780451524935", "1984", "George Orwell", 328, ol_isbn("9780451524935"), ["dark", "challenging"], "medium"),
    "mockingbird": ("9780061120084", "To Kill a Mockingbird", "Harper Lee", 336, ol_id(14351077), ["emotional", "reflective"], "medium"),
    "prince": ("9780156012195", "The Little Prince", "Antoine de Saint-Exupéry", 96, ol_isbn("9780156012195"), ["hopeful", "reflective"], "fast"),
    "atomic": ("9780735211292", "Atomic Habits", "James Clear", 320, ol_id(12539702), ["informative", "inspiring"], "fast"),
    "educated": ("9780399590504", "Educated", "Tara Westover", 352, ol_id(8314077), ["inspiring", "emotional"], "medium"),
    "hugo": ("9781501161933", "The Seven Husbands of Evelyn Hugo", "Taylor Jenkins Reid", 400, ol_id(8354226), ["romantic", "emotional"], "fast"),
    "crawdads": ("9780735219090", "Where the Crawdads Sing", "Delia Owens", 384, ol_id(8362947), ["mysterious", "sad"], "medium"),
    "hunger": ("9780439023528", "The Hunger Games", "Suzanne Collins", 374, ol_id(12646537), ["tense", "adventurous"], "fast"),
    "solitude": ("9780060883287", "One Hundred Years of Solitude", "Gabriel García Márquez", 417, ol_isbn("9780060883287"), ["reflective", "challenging"], "slow"),
    "norwegian": ("9780375704024", "Norwegian Wood", "Haruki Murakami", 296, ol_isbn("9780375704024"), ["sad", "romantic"], "medium"),
    "handmaid": ("9780385490818", "The Handmaid's Tale", "Margaret Atwood", 311, ol_id(8231851), ["dark", "tense"], "medium"),
    "brave": ("9780060850524", "Brave New World", "Aldous Huxley", 288, ol_id(8231823), ["dark", "reflective"], "medium"),
    "alchemist": ("9780062315007", "The Alchemist", "Paulo Coelho", 208, ol_id(7414780), ["inspiring", "hopeful"], "fast"),
    "sapiens": ("9780062316097", "Sapiens", "Yuval Noah Harari", 464, ol_id(8634250), ["informative", "challenging"], "slow"),
    "fourth": ("9781649374042", "Fourth Wing", "Rebecca Yarros", 528, ol_id(14407898), [], None),
    "lessons": ("9780385547345", "Lessons in Chemistry", "Bonnie Garmus", 400, ol_id(12725772), [], None),
    "station": ("9780804172448", "Station Eleven", "Emily St. John Mandel", 352, ol_id(7369961), [], None),
    "klara": ("9780593318171", "Klara and the Sun", "Kazuo Ishiguro", 320, ol_id(10648686), [], None),
    "crime": ("9780140449136", "Crime and Punishment", "Fyodor Dostoevsky", 656, ol_isbn("9780140449136"), [], None),
    "catcher": ("9780316769488", "The Catcher in the Rye", "J.D. Salinger", 234, ol_id(9273490), [], None),
}

SHELVES = [
    {"id": "sh_fav", "name": "Favourites", "color": "#e5484d", "emoji": "❤️"},
    {"id": "sh_scifi", "name": "Sci-fi", "color": "#3e8ed0", "icon": "planet"},
    {"id": "sh_classics", "name": "Classics", "color": "#b8860b", "icon": "library"},
    {"id": "sh_club", "name": "Book club", "color": "#30a46c", "icon": "people"},
]
SHELF_OF = {
    "sh_fav": {"phm", "circe", "hobbit", "prince", "bookthief", "midnight"},
    "sh_scifi": {"phm", "dune", "martian", "1984", "brave", "hunger", "station", "klara"},
    "sh_classics": {"gatsby", "p&p", "1984", "mockingbird", "prince", "solitude", "brave", "crime", "catcher"},
    "sh_club": {"tomorrow", "hugo", "lessons", "crawdads", "educated"},
}

# Finished books: (key, finish date as days before TODAY, rating)
FINISHED = [
    ("circe", 9, 5), ("martian", 24, 4.5), ("midnight", 38, 4), ("hobbit", 52, 5), ("atomic", 66, 4),
    ("hugo", 79, 4.5), ("gatsby", 90, 4), ("educated", 104, 4.5), ("prince", 112, 5), ("hunger", 126, 4),
    ("bookthief", 145, 5), ("handmaid", 163, 4), ("alchemist", 176, 3.5), ("crawdads", 192, 4),
    ("mockingbird", 212, 5), ("dune", 236, 4.5), ("p&p", 258, 4.5), ("brave", 280, 3.5),
    ("1984", 303, 4.5), ("norwegian", 329, 4), ("solitude", 352, 4.5),
]
READING = [("phm", 342), ("notw", 212), ("tomorrow", 96)]
PAUSED = [("sapiens", 131)]
TO_READ = ["fourth", "lessons", "station", "klara", "crime", "catcher"]

QUOTES = [
    ("hobbit", "In a hole in the ground there lived a hobbit.", 1),
    ("p&p", "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", 1),
    ("gatsby", "So we beat on, boats against the current, borne back ceaselessly into the past.", 180),
    ("prince", "It is only with the heart that one can see rightly; what is essential is invisible to the eye.", 72),
    ("dune", "I must not fear. Fear is the mind-killer.", 8),
    ("mockingbird", "You never really understand a person until you consider things from his point of view.", 39),
    ("1984", "Who controls the past controls the future. Who controls the present controls the past.", 44),
    ("bookthief", "I have hated the words and I have loved them, and I hope I have made them right.", 528),
    ("midnight", "You don't have to understand life. You just have to live it.", 271),
    ("circe", "But in a solitary life, there are rare moments when another soul dips near yours.", 341),
    ("phm", "Amaze! Amaze! Amaze!", 301),
    ("alchemist", "When you want something, all the universe conspires in helping you to achieve it.", 21),
]
NOTES = [
    ("phm", "Rocky is the best character I've read in years. Fist my bump!", 288),
    ("notw", "Kvothe's three silences - reread the prologue at the end.", 1),
    ("educated", "Book club: talk about memory vs. the family's version of events.", 210),
]


def ts(d, hour, minute=0):
    return int(datetime(d.year, d.month, d.day, hour, minute, tzinfo=timezone.utc).timestamp() * 1000)


books, sessions, notes = [], [], []
book_id = {}  # catalog key -> book id
sid = 0


def add_sessions(bid, start_day, end_day, from_page, to_page, every_day=False):
    """Spread from_page..to_page over sessions between two dates (inclusive)."""
    global sid
    days = (end_day - start_day).days + 1
    reading_days = [start_day + timedelta(days=i) for i in range(days) if every_day or rnd.random() < 0.72 or i in (0, days - 1)]
    total = to_page - from_page
    weights = [rnd.uniform(0.6, 1.4) for _ in reading_days]
    s = sum(weights)
    page = from_page
    for k, (d, w) in enumerate(zip(reading_days, weights)):
        pages = round(total * w / s) if k < len(reading_days) - 1 else to_page - page
        pages = max(1, pages)
        if page + pages > to_page:
            pages = to_page - page
        if pages <= 0:
            continue
        minutes = max(8, round(pages / rnd.uniform(0.75, 1.15)))
        # Mostly evenings, some mornings and lunch breaks.
        hour = rnd.choices([7, 13, 21, 22, 23], weights=[2, 1, 5, 4, 1])[0]
        start = ts(d, hour, rnd.randint(0, 40))
        end = start + minutes * 60_000
        sid += 1
        sessions.append({
            "id": f"s_demo{sid:05d}", "bookId": bid, "startTime": start, "endTime": end,
            "durationSeconds": minutes * 60, "startPage": page, "endPage": page + pages,
            "pagesRead": pages, "date": d.isoformat(),
        })
        page += pages


def book(key, status, **extra):
    isbn, title, author, pages, cover, moods, pace = CATALOG[key]
    b = {
        "id": f"b_demo_{key.replace('&', 'and')}", "title": title, "authors": [author], "coverUrl": cover,
        "isbn": isbn, "pageCount": pages, "status": status, "currentPage": 0,
        "shelfIds": [sh for sh, keys in SHELF_OF.items() if key in keys], "source": "search",
        "catalogCheckedIsbn": isbn,
    }
    if moods:
        b["moods"] = moods
    if pace:
        b["pace"] = pace
    b.update(extra)
    books.append(b)
    book_id[key] = b["id"]
    return b


for key, ago, rating in FINISHED:
    pages = CATALOG[key][3]
    end = TODAY - timedelta(days=ago)
    length = max(3, round(pages / rnd.uniform(28, 45)))
    start = end - timedelta(days=length)
    b = book(key, "finished", currentPage=pages, rating=rating, readCount=1,
             addedAt=ts(start - timedelta(days=rnd.randint(5, 60)), 12),
             startedAt=ts(start, 20), finishedAt=ts(end, 22))
    add_sessions(b["id"], start, end, 0, pages)

# Currently reading: the last three weeks read every day (a streak).
streak_from = TODAY - timedelta(days=21)
for key, page in READING:
    pages = CATALOG[key][3]
    begun = streak_from - timedelta(days=rnd.randint(0, 12))
    extra = {}
    if key == "phm":
        plan_start = TODAY - timedelta(days=10)
        extra["plan"] = {"target": (TODAY + timedelta(days=12)).isoformat(), "start": plan_start.isoformat(), "startPage": 140}
    b = book(key, "reading", currentPage=page, addedAt=ts(begun - timedelta(days=20), 12), startedAt=ts(begun, 21), **extra)
    add_sessions(b["id"], begun, TODAY, 0, page, every_day=(key == "phm"))

for key, page in PAUSED:
    begun = TODAY - timedelta(days=150)
    b = book(key, "paused", currentPage=page, addedAt=ts(begun - timedelta(days=9), 12), startedAt=ts(begun, 21))
    add_sessions(b["id"], begun, begun + timedelta(days=12), 0, page)

for i, key in enumerate(TO_READ):
    book(key, "want_to_read", addedAt=ts(TODAY - timedelta(days=3 + i * 11), 18))

for n, (key, text, page) in enumerate(QUOTES):
    notes.append({"id": f"n_demoq{n:02d}", "bookId": book_id[key], "type": "quote", "text": text, "page": page,
                  "createdAt": ts(TODAY - timedelta(days=30 + n * 17), 21)})
for n, (key, text, page) in enumerate(NOTES):
    notes.append({"id": f"n_demon{n:02d}", "bookId": book_id[key], "type": "note", "text": text, "page": page,
                  "createdAt": ts(TODAY - timedelta(days=2 + n * 5), 22)})

year = TODAY.year
goals = [
    {"id": "g_demo_year", "metric": "books", "period": "year", "target": 20, "year": year, "createdAt": ts(date(year, 1, 1), 10), "type": "books_per_year"},
    {"id": "g_demo_pages", "metric": "pages", "period": "day", "target": 30, "createdAt": ts(date(year, 1, 1), 10), "type": "pages_per_day"},
    {"id": "g_demo_min", "metric": "minutes", "period": "month", "target": 900, "createdAt": ts(date(year, 1, 1), 10)},
    {"id": "g_demo_sprint", "metric": "books", "period": "custom", "target": 4, "name": "Autumn reading sprint",
     "start": (TODAY - timedelta(days=24)).isoformat(), "end": (TODAY + timedelta(days=31)).isoformat(), "createdAt": ts(TODAY - timedelta(days=25), 10)},
]

shelves = [dict(s, createdAt=ts(date(year - 1, 9, 1), 10)) for s in SHELVES]
print(json.dumps({"version": 1, "books": books, "sessions": sessions, "notes": notes, "shelves": shelves, "goals": goals, "deleted": []}, ensure_ascii=False))
