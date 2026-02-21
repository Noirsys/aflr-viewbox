CREATE TABLE news_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metadata_id INTEGER,
        content_id INTEGER
    );
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        news_item_id INTEGER,
        index_num INTEGER,
        item_name TEXT,
        category TEXT,
        relevancy_date TEXT,
        details TEXT,
        FOREIGN KEY(news_item_id) REFERENCES news_items(id)
    );
CREATE TABLE content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        news_item_id INTEGER,
        teleprompter_text TEXT,
        headline_text TEXT,
        subtitle_text TEXT,
        materials TEXT,
        FOREIGN KEY(news_item_id) REFERENCES news_items(id)
    );
