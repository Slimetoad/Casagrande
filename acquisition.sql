CREATE TABLE admissions_hub_counts (
  day TEXT NOT NULL, program TEXT NOT NULL, event TEXT NOT NULL, variant TEXT NOT NULL,
  total INTEGER NOT NULL, PRIMARY KEY(day,program,event,variant)
);
