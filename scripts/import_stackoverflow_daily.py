# -*- coding: utf-8 -*-
"""stackoverflow_daily_all.csv를 ecosystem_daily_stackoverflow_metrics로 적재.

사용법:
    export DEVCOMPASS_DSN="postgresql://user:pass@host:5432/devcompass"
    python scripts/import_stackoverflow_daily.py --input stackoverflow_daily_all.csv
"""

import argparse
import csv
import io
import os
import sys
from pathlib import Path

import psycopg

UPSERT_SQL = """
    INSERT INTO ecosystem_daily_stackoverflow_metrics (
        metric_date, skill_id, stackoverflow_tag, tag_source,
        question_count, period_start, period_end, is_partial_period,
        source_file, imported_at
    ) VALUES (
        %(metric_date)s, %(skill_id)s, %(tag)s, %(tag_source)s,
        %(question_count)s, %(metric_date)s, %(metric_date)s, FALSE,
        %(source_file)s, NOW()
    )
    ON CONFLICT (metric_date, skill_id) DO UPDATE SET
        stackoverflow_tag = EXCLUDED.stackoverflow_tag,
        tag_source = EXCLUDED.tag_source,
        question_count = EXCLUDED.question_count,
        source_file = EXCLUDED.source_file,
        status = 'success',
        error_message = NULL,
        imported_at = NOW()
"""


def dsn_from_env():
    dsn = os.environ.get("DEVCOMPASS_DSN")
    if dsn:
        return dsn
    if all(os.environ.get(name) for name in ("PGHOST", "PGDATABASE", "PGUSER")):
        return None  # psycopg.connect()가 PG* 환경변수를 알아서 읽는다
    raise SystemExit(
        "DEVCOMPASS_DSN 또는 PGHOST/PGDATABASE/PGUSER 환경변수가 필요합니다."
    )


def read_rows(path):
    with io.open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"skill", "stackoverflow_tag", "tag_source", "date", "question_count"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"입력 CSV에 필요한 컬럼이 없습니다: {sorted(missing)}")
        return list(reader)


def load_skill_ids(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT skill_id, skill_name FROM skill")
        return {name: skill_id for skill_id, name in cur.fetchall()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="stackoverflow_daily_all.csv 경로")
    parser.add_argument("--dry-run", action="store_true", help="INSERT 없이 처리 대상만 집계")
    args = parser.parse_args()

    rows = read_rows(args.input)
    print(f"입력 행 수: {len(rows)}")

    dsn = dsn_from_env()
    conn = psycopg.connect(dsn) if dsn else psycopg.connect()

    try:
        skill_ids = load_skill_ids(conn)
        unmapped = sorted({r["skill"] for r in rows if r["skill"] not in skill_ids})
        if unmapped:
            print(
                f"경고: skill 테이블에 없는 이름 {len(unmapped)}개, 이 행들은 건너뜁니다: {unmapped}",
                file=sys.stderr,
            )

        payload = [
            {
                "metric_date": r["date"],
                "skill_id": skill_ids[r["skill"]],
                "tag": r["stackoverflow_tag"],
                "tag_source": r["tag_source"],
                "question_count": int(r["question_count"]),
                "source_file": args.input.name,
            }
            for r in rows
            if r["skill"] in skill_ids
        ]
        print(f"적재 대상: {len(payload)}행 (건너뛴 행: {len(rows) - len(payload)})")

        if args.dry_run:
            print("--dry-run 이라 INSERT는 건너뜁니다.")
            return

        with conn.transaction():
            with conn.cursor() as cur:
                cur.executemany(UPSERT_SQL, payload)
        conn.commit()
        print("완료.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
