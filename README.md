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

## 배치 팀 가이드: 수집 데이터 DB 저장

배치 파이프라인은 `app/batch/collect/*.py`에서 소스별로 데이터를 수집하고, `app/batch/run.py`가 이를 모아 DB에 저장하는 구조다.

1. **수집 함수 작성**: `app/batch/collect/adzuna.py`, `remoteok.py`처럼 소스별 파일에 `collect() -> list[dict]` 형태로 작성한다. 외부 API 응답을 그대로 반환하지 말고, `models.py`의 컬럼명에 맞춘 dict 리스트로 정리해서 반환한다.

   ```python
   # app/batch/collect/adzuna.py
   def collect() -> list[dict]:
       # 외부 API 호출 후 아래 형태로 정리해서 반환
       return [
           {"title": "...", "company": "...", "source": "adzuna", "url": "...", "raw_text": "..."},
           ...
       ]
   ```

2. **DB 저장은 `app/batch/run.py`에서 처리**: 수집 함수는 순수하게 데이터만 반환하고, DB 세션/커밋은 `run.py`에서 일괄 담당한다. `app/db/database.py`의 `SessionLocal`과 `app/db/models.py`의 모델을 사용한다.

   ```python
   # app/batch/run.py
   from app.db.database import SessionLocal
   from app.db.models import JobPosting
   from app.batch.collect import adzuna, remoteok

   def main():
       db = SessionLocal()
       try:
           postings = adzuna.collect() + remoteok.collect()
           for p in postings:
               db.add(JobPosting(**p))
           db.commit()
       finally:
           db.close()

   if __name__ == "__main__":
       main()
   ```

3. **새 컬럼/테이블이 필요하면** `app/db/models.py`를 수정하고 `python scripts/init_db.py`로 스키마를 반영한다 (별도 마이그레이션 도구는 없음, `create_all` 기반이라 기존 테이블 컬럼 변경은 직접 DB에서 처리하거나 테이블을 새로 만들어야 함).
4. **중복 저장 주의**: 현재 `job_postings.url`에 unique 제약이 없다. 배치를 여러 번 돌려도 중복이 쌓이지 않게 하려면 저장 전에 `db.query(JobPosting).filter_by(url=p["url"]).first()`로 존재 여부를 확인하거나, 모델에 unique 제약을 추가하는 방향을 논의해서 반영한다.
5. 로컬에서 확인은 위 [DB 접속 방법 (DBeaver)](#db-접속-방법-dbeaver) 또는 파이썬 스니펫으로 한다.

## 프론트엔드 ↔ API 계약

프론트(`frontend/lib/api.js`)가 기대하는 응답 형태다. `NEXT_PUBLIC_API_URL`이 비어 있거나 요청이 실패하면 `frontend/lib/mockData.json` / `mockPostings.json`으로 자동 대체되므로, API가 없어도 화면은 그대로 뜬다.

```
GET {NEXT_PUBLIC_API_URL}/api/v1/gapmap?role=
  → { meta: { fromDate, toDate, totalTechs, mappedTechs, totalPostings, mapLimit, roles: [] },
      items: [{
        tech, skillCode, kind, roles: [],        // 직군 그룹, 기술당 최대 2개
        demand, demandRank, ecosystemScore, quadrant,
        postings, postingsShare, postingsNote,
        ecosystem: {                      // 각 { score: 0~100, raw: 정수 }
          githubRepo, githubActivity, stackoverflow
        },
        sampleRepositories: [],
        summary, signals: [{ meta, title }], stack: [], verdict
      }] }

GET {NEXT_PUBLIC_API_URL}/api/v1/tech/{skillCode}/postings?limit=5
  → { items: [{ company, title, location, employmentType, publishedAt, applyUrl }] }
```

산출 규칙:

- **`ecosystemScore`** = `github_repo_score`, `github_activity_score`, `ecosystem_heat_score_log`(각각 0~100 정규화)의 **단순 평균**, 소수 1자리 반올림.
- **`demand`** = 기술을 요구하는 **공고 건수의 백분위 순위**(대상 집합 안에서 오름차순 순위 ÷ (N−1) × 100). 원시 건수(`postings`)와 전체 대비 비율(`postingsShare`), 순위(`demandRank`)는 별도 필드로 함께 내려준다.
  Min-Max를 쓰지 않는 이유: 공고 건수 분포가 Python 919건 대 Cloudflare 2건으로 극단적으로 치우쳐 있어서, 선형 Min-Max는 Python을 뺀 26개를 전부 하단에 몰아넣고 log1p Min-Max는 27개 중 23개를 50 이상으로 밀어 올려 **`선점 후보` 사분면이 비어 버린다.** 백분위는 중앙값이 정확히 50이라 차트가 그리는 50% 십자선과 일치하고, 네 사분면이 모두 채워진다.
- **`roles`** — 채용공고의 원본 직군 14종을 6개 그룹(`일반 SWE`, `매니지먼트 · 솔루션`, `AI · 리서치`, `인프라 · 보안`, `웹 · 모바일`, `데이터`)으로 통합한 뒤, 그룹 내 요구 비율(해당 기술 언급 건수 ÷ 그룹 공고 수) 상위 2개를 담는다. 그룹 크기로 나누는 이유는 원시 건수로 뽑으면 가장 큰 그룹(`일반 SWE`, 767건)이 27개 중 21개에서 1위가 돼 필터로 쓸 수 없기 때문이다. 표본이 3건 미만인 그룹은 제외하므로 `roles`가 빈 배열일 수 있다.
- **`meta.roles`** — 필터 UI에 노출할 직군 그룹 목록이자 표시 순서(공고 수 내림차순). 비어 있으면 프론트가 직군 필터를 자동으로 감춘다.
- **`quadrant`** = 두 축을 **50** 기준으로 4분류한 한글 문자열 (`필수` / `선점 후보` / `희소가치` / `저관심`). **서버가 계산해서 내려준다** — 프론트는 색상·라벨에 매핑만 하고 좌표로부터 재계산하지 않는다 (`frontend/lib/quadrants.js`).
- **점수 표기**: `ecosystemScore`와 `ecosystem.*.score`는 모두 **소수 1자리로 반올림**해서 내려준다. 화면이 세 지표와 종합 점수를 같이 보여주므로, 자릿수가 다르면 합이 안 맞는 것처럼 보인다.
- **`ecosystem.*.raw`**는 화면에 항상 함께 표시된다. 세 점수 모두 대상 기술 집합 안에서의 Min-Max 정규화라 최하위가 0점으로 눌리는데, raw가 없으면 "안 쓰인다"로 오독되기 때문이다.
- **`mapLimit`**: 지도에는 `demand` 상위 이 개수까지만 점을 찍고, 나머지는 기술 사전으로 넘긴다 (기본 30).
- 공고 목록은 `JOB_POSTING`의 `is_active = true`만, 회사명은 `ATS_BOARD.company_name`에서 조인해 채운다.

> **현재 백엔드와 어긋나는 지점** (아직 수정 전)
> - 경로: `app/api/routes.py`는 `/gap`, `/tech/{name}`이고 둘 다 `NotImplementedError`다. 위 계약은 `/api/v1/gapmap`, `/api/v1/tech/{skillCode}/postings`를 쓴다.
> - 필드명: `app/api/schemas.py`의 `TechGap`은 `technology`/`demand_score`/`ecosystem_score`/`gap_score`로, 프론트가 쓰는 `tech`/`demand`/`ecosystemScore`와 다르다. `gap_score`는 프론트에서 쓰지 않는다.
> - `app/db/models.py`는 "임의의 코드임" 주석이 달린 플레이스홀더로, `devcompass-dw-erd.html`의 DW ERD(12테이블)와 무관하다.

### 채용 데이터 파이프라인에서 확인된 한계

`tech_stack_pipeline.ipynb`가 만든 `skills_counts.csv` / `skills_by_job_role.csv`를 화면에 붙이면서 확인한 것들. 지금 수치를 읽을 때 감안해야 한다.

- **회사 자기언급 필터가 벤더 기업의 수요를 지운다.** `tag_dataframe`은 태그가 채용 회사명을 포함하면 자기언급으로 보고 제거하는데, 이 데이터셋에는 Cloudflare·MongoDB·Datadog처럼 자기 제품명이 곧 기술명인 회사가 채용 기업으로 들어 있다. 그 결과 Cloudflare는 전체 2건으로 27개 중 최하위가 됐다. 실제 수요가 아니라 필터의 부작용이다.
- **`GPT / OpenAI` 이름이 양쪽에서 다르다.** 생태계 CSV는 `GPT / OpenAI` 하나로 두는데 사전은 `GPT`(114건)와 `OpenAI`(19건)를 별도 canonical로 뽑는다. 프론트는 둘을 합산해 133건으로 쓴다. 스키마에 `SKILL_ALIAS`가 있으니 이 매핑은 DB 쪽으로 옮기는 게 맞다.
- **`Claude`(172건)가 생태계 수집 대상에 없다.** 공고 언급으로는 `GPT`(114건)보다 많은데 27개 목록에 빠져 있어 지도에 안 뜬다. 다음 수집 때 추가 후보.
- **`share_%`는 직군 간 비교에 쓰면 안 된다.** `Frontend` 직군은 공고가 9건뿐이라 React 6건이 66.7%로 잡힌다. 그래서 위 `roles` 산출은 원본 14직군이 아니라 통합 그룹 기준으로 계산한다.
- **0단계 중복 제거 셀이 두 번 돌면 원본 백업을 덮어쓴다.** `dev_role_jobs_raw_backup.csv`에 현재 `dev_role_jobs.csv`를 먼저 복사하는데, 이미 중복 제거된 파일을 다시 돌리면 백업도 중복 제거본으로 바뀌어 원본을 잃는다. 백업이 이미 있으면 건너뛰는 가드가 필요하다.
- **`Node.js`의 alias에 `Node`가 있다.** Kubernetes를 요구하는 공고가 많은데(418건) "Kubernetes node" 같은 표현이 `Node.js`로 잡힐 수 있다. 부록 B 회귀 테스트에 케이스를 추가해 확인해볼 값어치가 있다.
- **데이터가 국내 공고가 아니다.** 수집원이 Anthropic·Cloudflare·Palantir 등 영어권 ATS라, 화면 문구에서 "국내 수요"라고 쓰면 틀린 말이 된다. 기존 서술 문구에 있던 국내 언급은 이번에 전부 걷어냈다.

### 다루지 않는 것

- **추세(trend)**: 생태계 CSV가 180일 스냅샷 1회분이라 시계열이 없다. 시계열 적재가 시작되기 전까지 상승/하락 표시는 넣지 않는다.
- **경쟁 강도**: 지원자 수에 해당하는 데이터가 DW에 없다. 근거 없는 수치라 화면에서 제거했다.

## 프론트엔드 배포 (Vercel)

`frontend/`는 Next.js 프로젝트로, Vercel에 별도 배포한다 (API/배치 서버 VM과는 독립).

1. **Vercel 프로젝트 생성**
   - [vercel.com](https://vercel.com)에서 GitHub 레포 import
   - **Root Directory를 `frontend`로 지정** (모노레포라서 필수, 안 하면 빌드 실패함)
   - Framework Preset은 Next.js로 자동 인식됨

2. **환경변수 설정**: Vercel 프로젝트 Settings → Environment Variables에서 API 서버 주소를 등록한다 (예: `NEXT_PUBLIC_API_URL=https://<api-vm-host>:8000`). 코드에서는 `process.env.NEXT_PUBLIC_API_URL`로 참조.

3. **CORS 주의**: 현재 `app/main.py`에 CORS 미들웨어가 없다. Vercel 도메인에서 API 서버로 요청하면 브라우저 CORS 에러가 나므로, API 쪽에 `fastapi.middleware.cors.CORSMiddleware`를 추가해서 Vercel 배포 도메인을 `allow_origins`에 등록해야 한다.

4. **배포 방식**
   - GitHub 연동 시 `main`(또는 지정한 브랜치)에 push하면 자동 배포됨 (PR마다 프리뷰 배포도 생성됨)
   - CLI로 직접 배포하려면:
     ```bash
     npm i -g vercel
     cd frontend
     vercel        # 프리뷰 배포
     vercel --prod # 프로덕션 배포
     ```

5. 로컬에서 프로덕션 빌드를 미리 확인하려면 `cd frontend && npm run build && npm run start`.

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
