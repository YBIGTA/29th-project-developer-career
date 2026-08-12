# DevCompass

채용 공고에서 요구하는 기술과 실제 기술 생태계 사이의 괴리를 분석하는 서비스.

## 구성

- `app/api`, `app/main.py` — FastAPI 서빙 레이어 (API 서버 VM에 배포)
- `app/batch` — 배치 파이프라인 (배치 서버 VM에 별도 배포)
- `app/db`, `app/core` — API·배치 공통 코드
- `frontend/` — Next.js 프론트엔드
- `requirements/` — 서비스별 의존성 분리 (`base.txt` 공통, `api.txt`, `batch.txt`, `dev.txt`)
- `Dockerfile.api`, `Dockerfile.batch` — 서비스별 이미지
- `deploy/` — 배치 서버 VM 배포용 compose/crontab
- `tests/` — pytest 테스트
- `scripts/` — 운영/초기화 스크립트
- `docs/` — 협업 및 아키텍처 문서

## 배포 구조

API 서버와 배치 서버는 서로 다른 VM에서 독립적으로 뜨고, 같은 DB를 공유한다.

- **API VM**: `Dockerfile.api`로 빌드, 상시 구동 (uvicorn)
- **배치 VM**: `Dockerfile.batch`로 빌드, cron/systemd timer로 주기 실행 (상시 구동 아님)
- 두 VM 모두 `.env`의 `DATABASE_URL`이 실제 DB에 접근 가능한 호스트를 가리켜야 함 (`localhost` 금지)

자세한 배치 서버 배포 절차는 `deploy/docker-compose.batch.yml`, `deploy/crontab.example` 참고.

## 실행법

### 사전 준비

```bash
cp .env.example .env
```

### 개발환경 (Docker, API + DB)

```bash
docker compose up --build
```

### API 서버만 로컬 실행

```bash
pip install -r requirements/api.txt
uvicorn app.main:app --reload
```

### 프론트엔드만 로컬 실행

```bash
cd frontend
npm install
npm run dev
```

### 배치 파이프라인 로컬 실행

```bash
pip install -r requirements/batch.txt
python -m app.batch.run

# 또는 배치 이미지로
docker compose --profile batch run --rm batch
```

### 테스트

```bash
pip install -r requirements.txt
pytest
```

## 컨테이너 포트

로컬 `docker compose up`(API + DB) 기준.

| 컨테이너 | 포트 | 비고 |
| --- | --- | --- |
| `db` | `5432:5432` | Postgres 16, 데이터는 `db_data` 볼륨에 저장 |
| `api` | `8000:8000` | FastAPI (uvicorn) |
| `batch` | 없음 | 상시 구동 아님, `--profile batch run`으로 1회 실행 |

배치 서버 VM(`deploy/docker-compose.batch.yml`)에는 DB/API 컨테이너가 없고, `.env`의 `DATABASE_URL`로 API 서버 VM의 DB에 원격 접속한다.

## DB 접속 방법 (DBeaver)

사전 준비: `docker compose up`으로 `db` 컨테이너가 떠 있어야 하고, 테이블이 없다면 먼저 `python scripts/init_db.py`로 스키마를 생성한다.

1. DBeaver 실행 → 좌측 상단 **New Database Connection** (플러그 아이콘) 클릭
2. 연결 목록에서 **PostgreSQL** 선택 → Next
3. Main 탭에 접속 정보 입력 (`.env` 값 기준, 기본값은 아래)

   | 항목 | 값 |
   | --- | --- |
   | Host | `localhost` |
   | Port | `5432` |
   | Database | `devcompass` (`.env`의 `POSTGRES_DB`) |
   | Username | `devcompass` (`.env`의 `POSTGRES_USER`) |
   | Password | `devcompass` (`.env`의 `POSTGRES_PASSWORD`) |

4. **Test Connection** 클릭해서 정상 연결 확인 (처음이면 PostgreSQL 드라이버 다운로드 팝업이 뜨는데 그대로 Download 진행)
5. **Finish**로 저장하면 좌측 Database Navigator에 연결이 추가됨
6. 좌측 트리에서 `devcompass` → `Schemas` → `public` → `Tables`로 들어가면 `job_postings`, `technologies`, `gap_results` 테이블 확인 가능
7. 테이블 더블클릭 → **Data** 탭에서 저장된 row를 바로 조회/편집 가능
8. SQL로 직접 조회하려면 테이블 위에서 우클릭 → **SQL Editor** → **Open SQL script**

```sql
SELECT * FROM job_postings;
```

> 배치 서버 VM에서 접속할 때는 Host를 `localhost`가 아니라 API 서버 VM의 실제 접근 가능한 호스트/IP로 넣어야 한다 (`.env`의 `DATABASE_URL`과 동일한 값).

**파이썬 코드에서 조회**

```python
from app.db.database import SessionLocal
from app.db.models import JobPosting

db = SessionLocal()
print(db.query(JobPosting).all())
```

테이블이 아직 없다면 먼저 `python scripts/init_db.py`로 스키마를 생성해야 한다.
