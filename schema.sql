DROP TABLE IF EXISTS Items;
CREATE TABLE Items
(
    message_id TEXT,
    source     TEXT,
    body       TEXT,
    PRIMARY KEY (`message_id`)
);
